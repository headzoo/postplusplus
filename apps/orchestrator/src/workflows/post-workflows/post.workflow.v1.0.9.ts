import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import {
  ActivityFailure,
  ApplicationFailure,
  startChild,
  proxyActivities,
  sleep,
  defineSignal,
  setHandler,
} from '@temporalio/workflow';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { capitalize, sortBy } from 'lodash';
import { PostResponse } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { TimeoutFailure, TypedSearchAttributes } from '@temporalio/common';
import { postId as postIdSearchParam } from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';

const proxyTaskQueue = (taskQueue: string) => {
  return proxyActivities<PostActivity>({
    startToCloseTimeout: '10 minute',
    taskQueue,
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '2 minutes',
    },
  });
};

const proxyCheckTaskQueue = (taskQueue: string) => {
  return proxyActivities<PostActivity>({
    startToCloseTimeout: '2 minute',
    taskQueue,
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '10 seconds',
    },
  });
};

const proxyMutationTaskQueue = (taskQueue: string) => {
  return proxyActivities<PostActivity>({
    startToCloseTimeout: '10 minute',
    taskQueue,
    retry: {
      maximumAttempts: 1,
    },
  });
};

const {
  getPostsList,
  getPost,
  inAppNotification,
  changeState,
  updatePost,
  sendWebhooks,
  isCommentable,
} = proxyActivities<PostActivity>({
  startToCloseTimeout: '10 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

const poke = defineSignal('poke');

const iterate = Array.from({ length: 5 });

const maxPendingChecks = 90;

export async function postWorkflowV109({
  taskQueue,
  postId,
  organizationId,
  postNow = false,
}: {
  taskQueue: string;
  postId: string;
  organizationId: string;
  postNow?: boolean;
}) {
  const {
    postComment,
    getIntegrationById,
    refreshTokenWithCause,
    internalPlugs,
    processInternalPlug,
    resolvePostRulesV109,
    processPostRuleV109,
  } = proxyTaskQueue(taskQueue);

  const { checkPostStatus } = proxyCheckTaskQueue(taskQueue);

  const { postSocialPending, finalizePost } = proxyMutationTaskQueue(taskQueue);

  let poked = false;
  setHandler(poke, () => {
    poked = true;
  });

  const startTime = new Date();
  const firstPost = await getPost(organizationId, postId);

  if (!firstPost) {
    await changeState(postId, 'ERROR', 'No Post');
    return;
  }

  if (!postNow && firstPost.state !== 'QUEUE') {
    await changeState(firstPost.id, 'ERROR', 'Already posted', [firstPost]);
    return;
  }

  if (!postNow) {
    await sleep(
      dayjs(firstPost.publishDate).isBefore(dayjs())
        ? 0
        : dayjs(firstPost.publishDate).diff(dayjs(), 'millisecond')
    );
  }

  let publishedAt: Date | undefined;

  const postsListBefore = await getPostsList(organizationId, postId);
  const [post] = postsListBefore;

  if (!post) {
    await changeState(postId, 'ERROR', 'No Post');
    return;
  }

  if (post.integration?.refreshNeeded) {
    await inAppNotification(
      post.organizationId,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name} because you need to reconnect it. Please enable it and try again.`,
      true,
      false,
      'info'
    );

    await changeState(
      postsListBefore[0].id,
      'ERROR',
      'Refresh channel needed',
      postsListBefore
    );
    return;
  }

  if (post.integration?.disabled) {
    await inAppNotification(
      post.organizationId,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name} because it's disabled. Please enable it and try again.`,
      true,
      false,
      'info'
    );

    await changeState(
      postsListBefore[0].id,
      'ERROR',
      'Channel disabled',
      postsListBefore
    );
    return;
  }

  const toComment: boolean =
    postsListBefore.length === 1
      ? false
      : await isCommentable(post.integration);

  const postsList = toComment ? postsListBefore : [postsListBefore[0]];

  const postsResults: PostResponse[] = [];

  const handleActivityError = async (
    err: unknown,
    getIntegration?: () => Promise<any>
  ): Promise<{
    type: 'retry' | 'stop' | 'bad-body' | 'timeout' | 'unknown';
    message: string;
  }> => {
    if (err instanceof ActivityFailure && err.cause instanceof TimeoutFailure) {
      return { type: 'timeout', message: '' };
    }

    const cause =
      err instanceof ActivityFailure && err.cause instanceof ApplicationFailure
        ? err.cause
        : undefined;

    if (cause?.type === 'refresh_token') {
      const refresh = await refreshTokenWithCause(
        getIntegration ? await getIntegration() : post.integration,
        cause.message || ''
      );
      if (!refresh || !refresh.accessToken) {
        return { type: 'stop', message: cause.message || '' };
      }

      if (!getIntegration) {
        post.integration.token = refresh.accessToken;
      }

      return { type: 'retry', message: cause.message || '' };
    }

    if (cause?.type === 'bad_body') {
      return { type: 'bad-body', message: cause.message || '' };
    }

    return { type: 'unknown', message: '' };
  };

  const markUnconfirmed = async (err: any) => {
    await changeState(postsList[0].id, 'ERROR', err, postsList);
    await inAppNotification(
      post.organizationId,
      `We couldn't confirm your post on ${capitalize(
        post.integration?.providerIdentifier
      )}`,
      `Your post was sent to ${capitalize(
        post.integration?.providerIdentifier
      )}, but we couldn't confirm it was published. Please check your ${
        post?.integration?.name
      } account before posting again to avoid duplicates.`,
      true,
      false,
      'fail'
    );
  };

  const resolvePending = async (
    pending: PostResponse
  ): Promise<PostResponse | false> => {
    let pendingData = pending.pendingData;
    let errorAttempts = 0;

    for (let check = 0; check < maxPendingChecks; check++) {
      try {
        let result = await checkPostStatus(post.integration, pendingData);

        if (result.status !== 'completed') {
          pendingData = result.pendingData;
        }

        if (result.status === 'ready') {
          result = await finalizePost(post.integration, result.pendingData);
        }

        if (result.status === 'completed') {
          return {
            id: pending.id,
            postId: result.postId,
            releaseURL: result.releaseURL,
            status: 'success',
          };
        }

        pendingData = result.pendingData;

        errorAttempts = 0;
      } catch (err) {
        const handle = await handleActivityError(err);

        if (handle.type === 'retry') {
          continue;
        }

        if (handle.type === 'stop') {
          await markUnconfirmed(err);
          return false;
        }

        if (handle.type === 'bad-body') {
          await changeState(postsList[0].id, 'ERROR', err, postsList);
          await inAppNotification(
            post.organizationId,
            `Error posting on ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
            `An error occurred while posting on ${
              post.integration?.providerIdentifier
            }${handle.message ? `: ${handle.message}` : ``}`,
            true,
            false,
            'fail'
          );
          return false;
        }

        errorAttempts++;
        if (errorAttempts >= iterate.length) {
          break;
        }
      }

      await sleep('20 seconds');
    }

    await markUnconfirmed('Could not confirm the post status');
    return false;
  };

  for (let i = 0; i < postsList.length; i++) {
    const before = postsResults.length;
    let posted = false;
    let updated = false;
    for (const _ of iterate) {
      try {
        if (i === 0) {
          postsResults.push(
            ...(await postSocialPending(post.integration as Integration, [
              postsList[i],
            ]))
          );
        } else {
          if (postsList[i].delay) {
            const targetDelayMs = 60000 * Number(postsList[i].delay ?? 0);
            if (publishedAt) {
              const elapsed = new Date().getTime() - publishedAt.getTime();
              const remainingDelay = Math.max(0, targetDelayMs - elapsed);
              await sleep(remainingDelay);
            } else {
              await sleep(targetDelayMs);
            }
          }

          postsResults.push(
            ...(await postComment(
              postsResults[0].postId,
              postsResults.length === 1
                ? undefined
                : postsResults[i - 1].postId,
              post.integration,
              [postsList[i]]
            ))
          );
        }

        posted = true;

        if (postsResults[i].status === 'pending') {
          let resolved: PostResponse | false = false;
          try {
            resolved = await resolvePending(postsResults[i]);
          } catch (err) {
            try {
              await markUnconfirmed(err);
            } catch (e) {
              /**empty**/
            }
            resolved = false;
          }
          if (!resolved) {
            return false;
          }
          postsResults[i] = resolved;
        }

        await updatePost(
          postsList[i].id,
          postsResults[i].postId,
          postsResults[i].releaseURL
        );
        updated = true;

        break;
      } catch (err) {
        if (posted) {
          if (!updated) {
            try {
              await markUnconfirmed(err);
            } catch (e) {
              /**empty**/
            }
            return false;
          }

          break;
        }

        const handle = await handleActivityError(err);

        if (handle.type === 'retry') {
          continue;
        }

        if (handle.type === 'timeout') {
          try {
            await markUnconfirmed(err);
          } catch (e) {
            /**empty**/
          }
          return false;
        }

        await changeState(postsList[0].id, 'ERROR', err, postsList);

        if (handle.type === 'stop') {
          return false;
        }

        if (handle.type === 'bad-body') {
          await inAppNotification(
            post.organizationId,
            `Error posting${i === 0 ? ' ' : ' comments '}on ${
              post.integration?.providerIdentifier
            } for ${post?.integration?.name}`,
            `An error occurred while posting${i === 0 ? ' ' : ' comments '}on ${
              post.integration?.providerIdentifier
            }${handle.message ? `: ${handle.message}` : ``}`,
            true,
            false,
            'fail'
          );
          return false;
        }
      }
    }

    if (postsResults.length === before) {
      return false;
    }
  }

  await sendWebhooks(
    postsResults[0].postId,
    post.organizationId,
    post.integration.id
  );

  publishedAt = new Date();

  const internalPlugsList = await internalPlugs(
    post.integration,
    JSON.parse(post.settings)
  );

  const rulesWorkItems = await resolvePostRulesV109(
    organizationId,
    post.id,
    post.integration.id
  );

  const repeatPost = !post.intervalInDays
    ? []
    : [
        {
          type: 'repeat-post' as const,
          delay: post.intervalInDays * 24 * 60 * 60 * 1000,
        },
      ];

  const list: Array<
    | (typeof internalPlugsList)[number]
    | (typeof rulesWorkItems)[number]
    | (typeof repeatPost)[number]
  > = sortBy([...internalPlugsList, ...rulesWorkItems, ...repeatPost], 'delay');

  while (list.length > 0) {
    const todo = list.shift()!;

    const anchor = publishedAt || startTime;
    const elapsed = new Date().getTime() - anchor.getTime();
    const remainingDelay = Math.max(0, Number(todo.delay ?? 0) - elapsed);
    await sleep(remainingDelay);

    if (todo.type === 'internal-plug') {
      for (const _ of iterate) {
        try {
          await processInternalPlug({
            ...(todo as any),
            post: postsResults[0].postId,
          });
        } catch (err) {
          const handle = await handleActivityError(err, () =>
            getIntegrationById(organizationId, (todo as any).integration)
          );

          if (handle.type === 'stop' || handle.type === 'bad-body') {
            break;
          }

          continue;
        }
        break;
      }
    }

    if (todo.type === 'rule') {
      let retryAttempt = 0;
      const maxRetries = iterate.length;

      for (const _ of iterate) {
        try {
          const result = await processPostRuleV109({
            organizationId,
            runId: (todo as any).runId,
            ruleId: (todo as any).ruleId,
            postId: (todo as any).postId,
            evaluationIndex: (todo as any).evaluationIndex,
          });

          if (result.status === 'PROCESSING') {
            retryAttempt++;
            if (retryAttempt < maxRetries) {
              await sleep(
                Math.min(30000 * Math.pow(2, retryAttempt - 1), 300000)
              );
              continue;
            }
            break;
          }

          if (result.status === 'FAILED') {
            retryAttempt++;
            if (retryAttempt < maxRetries) {
              await sleep(
                Math.min(30000 * Math.pow(2, retryAttempt - 1), 300000)
              );
              continue;
            }
            break;
          }

          if (result.terminalRun) {
            const toDelete = list
              .reduce((all, current, index) => {
                if (
                  current.type === 'rule' &&
                  (current as any).runId === (todo as any).runId
                ) {
                  all.push(index);
                }
                return all;
              }, [] as number[])
              .reverse();

            for (const index of toDelete) {
              list.splice(index, 1);
            }
          }

          break;
        } catch (err) {
          const handle = await handleActivityError(err);

          if (handle.type === 'stop' || handle.type === 'bad-body') {
            break;
          }

          retryAttempt++;
          if (retryAttempt < maxRetries) {
            await sleep(
              Math.min(30000 * Math.pow(2, retryAttempt - 1), 300000)
            );
            continue;
          }

          break;
        }
      }
    }

    if (todo.type === 'repeat-post') {
      await startChild(postWorkflowV109, {
        parentClosePolicy: 'ABANDON',
        args: [
          {
            taskQueue,
            postId,
            organizationId,
            postNow: true,
          },
        ],
        workflowId: `post_${post.id}_${makeId(10)}`,
        typedSearchAttributes: new TypedSearchAttributes([
          {
            key: postIdSearchParam,
            value: postId,
          },
        ]),
      });
    }
  }
}

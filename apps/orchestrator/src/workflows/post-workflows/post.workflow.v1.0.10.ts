import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import {
  ActivityFailure,
  ApplicationFailure,
  startChild,
  proxyActivities,
  sleep,
  defineSignal,
  setHandler,
  workflowInfo,
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

const { inAppPostFailureNotificationV1 } = proxyActivities<PostActivity>({
  startToCloseTimeout: '2 minutes',
  retry: {
    maximumAttempts: 10,
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
  },
});

const poke = defineSignal('poke');

const iterate = Array.from({ length: 5 });

const maxPendingChecks = 90;
const maxFailureDetailLength = 500;

const getFailureDetail = (error: unknown, fallback: string) => {
  const activityCause =
    error instanceof ActivityFailure && error.cause ? error.cause : undefined;
  const message =
    activityCause instanceof Error
      ? activityCause.message
      : error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : fallback;

  const normalized = message.replace(/\s+/g, ' ').trim();
  return (normalized || fallback).slice(0, maxFailureDetailLength);
};

type PostWorkflowV110Request = {
  taskQueue: string;
  postId: string;
  organizationId: string;
  postNow?: boolean;
};

type NotifyFailure = (subject: string, message: string) => Promise<void>;

export async function postWorkflowV110(request: PostWorkflowV110Request) {
  let notificationSent = false;
  let publishingCompleted = false;
  let providerName = capitalize(request.taskQueue);
  let accountName: string | undefined;
  const notifyFailure: NotifyFailure = async (subject, message) => {
    const { workflowId, runId } = workflowInfo();
    await inAppPostFailureNotificationV1(
      request.organizationId,
      `post-publish-failure:${workflowId}:${runId}`,
      subject,
      message
    );
    notificationSent = true;
  };

  try {
    return await executePostWorkflowV110(request, notifyFailure, {
      postLoaded: (post) => {
        providerName = capitalize(
          post.integration?.providerIdentifier || request.taskQueue
        );
        accountName = post.integration?.name;
      },
      publishingComplete: () => {
        publishingCompleted = true;
      },
    });
  } catch (error) {
    if (publishingCompleted) {
      throw error;
    }

    try {
      await changeState(request.postId, 'ERROR', error);
    } catch {
      // Notification is still attempted when persisting the Post state fails.
    }

    if (!notificationSent) {
      try {
        const detail = getFailureDetail(
          error,
          'An internal publishing step failed.'
        );
        await notifyFailure(
          `A scheduled post failed to publish on ${providerName}`,
          `Postiz could not publish the scheduled post (${
            request.postId
          }) on ${providerName}${
            accountName ? ` for ${accountName}` : ''
          }. ${detail} Please review the failed post in Postiz and try again.`
        );
      } catch {
        // The notification activity already exhausted its own retry policy.
      }
    }

    return false;
  }
}

async function executePostWorkflowV110(
  {
    taskQueue,
    postId,
    organizationId,
    postNow = false,
  }: PostWorkflowV110Request,
  notifyFailure: NotifyFailure,
  lifecycle: {
    postLoaded: (post: any) => void;
    publishingComplete: () => void;
  }
) {
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
    await notifyFailure(
      `A scheduled post failed to publish on ${capitalize(taskQueue)}`,
      `Postiz could not load the scheduled post (${postId}) when it was time to publish it. The post was not sent. Please review your calendar and try again.`
    );
    await changeState(postId, 'ERROR', 'No Post');
    return false;
  }

  lifecycle.postLoaded(firstPost);

  if (!postNow && firstPost.state !== 'QUEUE') {
    await changeState(firstPost.id, 'ERROR', 'Already posted', [firstPost]);
    return false;
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
    await notifyFailure(
      `A scheduled post failed to publish on ${capitalize(taskQueue)}`,
      `Postiz could not load the scheduled post (${postId}) when it was time to publish it. The post was not sent. Please review your calendar and try again.`
    );
    await changeState(postId, 'ERROR', 'No Post');
    return false;
  }

  const providerName = capitalize(
    post.integration?.providerIdentifier || taskQueue
  );
  const accountName = post.integration?.name || 'your channel';

  const notifyPublishFailure = async (
    error: unknown,
    fallback: string,
    subject = 'post'
  ) => {
    const detail = getFailureDetail(error, fallback);
    await notifyFailure(
      `Your ${subject} failed to publish on ${providerName}`,
      `Postiz could not publish your ${subject} on ${providerName} for ${accountName}. ${detail} Please review the failed post in Postiz and try again.`
    );
  };

  const markFailed = async (
    error: unknown,
    fallback: string,
    subject = 'post'
  ) => {
    await changeState(postsListBefore[0].id, 'ERROR', error, postsListBefore);
    await notifyPublishFailure(error, fallback, subject);
  };

  if (post.integration?.refreshNeeded) {
    await notifyPublishFailure(
      'The channel must be reconnected before Postiz can publish to it.',
      'The channel must be reconnected before Postiz can publish to it.'
    );

    await changeState(
      postsListBefore[0].id,
      'ERROR',
      'Refresh channel needed',
      postsListBefore
    );
    return false;
  }

  if (post.integration?.disabled) {
    await notifyPublishFailure(
      'The channel is disabled. Enable or reconnect it before trying again.',
      'The channel is disabled. Enable or reconnect it before trying again.'
    );

    await changeState(
      postsListBefore[0].id,
      'ERROR',
      'Channel disabled',
      postsListBefore
    );
    return false;
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
      return { type: 'timeout', message: err.cause.message || '' };
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

    return {
      type: 'unknown',
      message: getFailureDetail(err, 'The provider rejected the request.'),
    };
  };

  const markUnconfirmed = async (err: unknown) => {
    await changeState(postsList[0].id, 'ERROR', err, postsList);
    const detail = getFailureDetail(
      err,
      'Postiz could not confirm the final publishing status.'
    );
    await notifyFailure(
      `We couldn't confirm your post on ${providerName}`,
      `Your post may have been sent to ${providerName} for ${accountName}, but Postiz could not confirm it was published. ${detail} Check the channel before posting again to avoid duplicates.`
    );
  };

  const resolvePending = async (
    pending: PostResponse
  ): Promise<PostResponse | false> => {
    let pendingData = pending.pendingData;
    let errorAttempts = 0;
    let lastError: unknown;

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
        lastError = err;
        const handle = await handleActivityError(err);

        if (handle.type === 'retry') {
          continue;
        }

        if (handle.type === 'stop') {
          await markUnconfirmed(err);
          return false;
        }

        if (handle.type === 'bad-body') {
          await markFailed(
            err,
            handle.message || 'The provider rejected the post.'
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

    await markUnconfirmed(
      lastError || 'Postiz could not confirm the post status.'
    );
    return false;
  };

  for (let i = 0; i < postsList.length; i++) {
    const before = postsResults.length;
    let posted = false;
    let updated = false;
    let lastError: unknown;

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
              /** empty */
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
        lastError = err;
        if (posted) {
          if (!updated) {
            try {
              await markUnconfirmed(err);
            } catch (e) {
              /** empty */
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
            /** empty */
          }
          return false;
        }

        if (handle.type === 'stop') {
          await markFailed(
            err,
            handle.message || 'Postiz could not refresh the channel connection.'
          );
          return false;
        }

        if (handle.type === 'bad-body') {
          await markFailed(
            err,
            handle.message || 'The provider rejected the post.',
            i === 0 ? 'post' : 'comment'
          );
          return false;
        }
      }
    }

    if (postsResults.length === before) {
      await markFailed(
        lastError || 'The provider did not accept the post.',
        'The provider did not accept the post after several attempts.',
        i === 0 ? 'post' : 'comment'
      );
      return false;
    }
  }

  lifecycle.publishingComplete();

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
      await startChild(postWorkflowV110, {
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

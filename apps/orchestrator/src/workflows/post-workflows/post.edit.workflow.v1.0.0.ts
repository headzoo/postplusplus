import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import {
  ActivityFailure,
  ApplicationFailure,
  proxyActivities,
} from '@temporalio/workflow';
import { Integration } from '@prisma/client';
import { capitalize } from 'lodash';
import { TimeoutFailure } from '@temporalio/common';

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

const proxyMutationTaskQueue = (taskQueue: string) => {
  return proxyActivities<PostActivity>({
    startToCloseTimeout: '10 minute',
    taskQueue,
    retry: {
      maximumAttempts: 1,
    },
  });
};

const { getPostsList, getPost, inAppNotification, updatePost } =
  proxyActivities<PostActivity>({
    startToCloseTimeout: '10 minute',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '2 minutes',
    },
  });

const iterate = Array.from({ length: 5 });

export async function postEditWorkflowV1({
  taskQueue,
  postId,
  organizationId,
}: {
  taskQueue: string;
  postId: string;
  organizationId: string;
}) {
  const { refreshTokenWithCause } = proxyTaskQueue(taskQueue);
  const { editPost } = proxyMutationTaskQueue(taskQueue);

  const firstPost = await getPost(organizationId, postId);
  if (!firstPost) {
    return;
  }

  if (
    firstPost.state !== 'PUBLISHED' ||
    !firstPost.releaseId ||
    firstPost.releaseId === 'missing'
  ) {
    await inAppNotification(
      firstPost.organizationId,
      `We couldn't edit your post on ${capitalize(
        firstPost.integration?.providerIdentifier || 'the channel'
      )}`,
      `This published post cannot be edited on the platform.`,
      true,
      false,
      'fail'
    );
    return;
  }

  const postsList = await getPostsList(organizationId, postId);
  const [post] = postsList;
  if (!post) {
    return;
  }

  if (post.integration?.refreshNeeded || post.integration?.disabled) {
    await inAppNotification(
      post.organizationId,
      `We couldn't edit your post on ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
      post.integration?.disabled
        ? `The channel is disabled. Please enable it and try again.`
        : `Please reconnect the channel and try again.`,
      true,
      false,
      'info'
    );
    return;
  }

  const handleActivityError = async (
    err: unknown
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
        post.integration,
        cause.message || ''
      );
      if (!refresh || !refresh.accessToken) {
        return { type: 'stop', message: cause.message || '' };
      }

      post.integration.token = refresh.accessToken;
      return { type: 'retry', message: cause.message || '' };
    }

    if (cause?.type === 'bad_body') {
      return { type: 'bad-body', message: cause.message || '' };
    }

    return { type: 'unknown', message: '' };
  };

  let edited = false;
  for (const _ of iterate) {
    try {
      const results = await editPost(post.integration as Integration, [
        postsList[0],
      ]);
      edited = true;
      const result = results[0];
      if (!result?.postId) {
        throw new Error('The platform did not return an edited post id');
      }
      await updatePost(postsList[0].id, result.postId, result.releaseURL);
      return;
    } catch (err) {
      if (edited) {
        await inAppNotification(
          post.organizationId,
          `We couldn't confirm your edited post on ${capitalize(
            post.integration?.providerIdentifier
          )}`,
          `Your edit was sent to ${capitalize(
            post.integration?.providerIdentifier
          )}, but we couldn't confirm it. Please check your ${
            post?.integration?.name
          } account.`,
          true,
          false,
          'fail'
        );
        return;
      }

      const handle = await handleActivityError(err);
      if (handle.type === 'retry') {
        continue;
      }

      await inAppNotification(
        post.organizationId,
        `Error editing on ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
        handle.type === 'bad-body'
          ? `An error occurred while editing on ${
              post.integration?.providerIdentifier
            }${handle.message ? `: ${handle.message}` : ``}`
          : `We couldn't edit your published post on ${capitalize(
              post.integration?.providerIdentifier
            )}. The original post is still live.`,
        true,
        false,
        'fail'
      );
      return;
    }
  }
}

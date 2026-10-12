import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import { postWorkflowV110 } from './post.workflow.v1.0.10';
import { proxyActivities, startChild } from '@temporalio/workflow';
import {
  TypedSearchAttributes,
  WorkflowIdReusePolicy,
} from '@temporalio/common';
import {
  organizationId,
  postId,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';

type PipelinePostWorkflowV111Request = {
  taskQueue: string;
  postId: string;
  organizationId: string;
  pipelineExecutionId: string;
};

const { getPost } = proxyActivities<PostActivity>({
  startToCloseTimeout: '2 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '5 seconds',
    backoffCoefficient: 2,
  },
});

export async function postWorkflowV111(
  request: PipelinePostWorkflowV111Request
) {
  const post = await getPost(request.organizationId, request.postId);
  if (!post || post.state === 'ERROR') {
    return false;
  }
  if (post.state === 'PUBLISHED') {
    return true;
  }
  if (post.state !== 'QUEUE') {
    return false;
  }

  const child = await startChild(postWorkflowV110, {
    workflowId: `post_${request.postId}_pipeline_${request.pipelineExecutionId}`,
    taskQueue: 'main',
    workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    args: [
      {
        taskQueue: request.taskQueue,
        postId: request.postId,
        organizationId: request.organizationId,
      },
    ],
    typedSearchAttributes: new TypedSearchAttributes([
      { key: postId, value: request.postId },
      { key: organizationId, value: request.organizationId },
    ]),
  });
  return child.result();
}

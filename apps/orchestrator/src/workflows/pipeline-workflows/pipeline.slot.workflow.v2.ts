import { PipelineActivity } from '@gitroom/orchestrator/activities/pipeline.activity';
import { postWorkflowV109 } from '@gitroom/orchestrator/workflows/post-workflows/post.workflow.v1.0.9';
import { PipelineSlotWorkflowV1Request } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.execution';
import { proxyActivities, startChild } from '@temporalio/workflow';
import {
  TypedSearchAttributes,
  WorkflowIdReusePolicy,
} from '@temporalio/common';
import {
  organizationId,
  postId,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';

const { claimPipelineSlot, finalizePipelineSlot } =
  proxyActivities<PipelineActivity>({
    startToCloseTimeout: '2 minutes',
    taskQueue: 'main',
    retry: {
      maximumAttempts: 3,
      initialInterval: '5 seconds',
      backoffCoefficient: 2,
    },
  });

export async function pipelineSlotWorkflowV2(
  request: PipelineSlotWorkflowV1Request
) {
  const claim = await claimPipelineSlot({
    ...request,
    nowUtc: new Date().toISOString(),
  });
  if (claim.outcome !== 'CLAIMED' || !claim.executionId) {
    return claim;
  }

  await Promise.all(
    claim.roots.map(async (root) => {
      try {
        const child = await startChild(postWorkflowV109, {
          workflowId: `post_${root.postId}`,
          taskQueue: 'main',
          workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
          args: [
            {
              taskQueue: root.taskQueue,
              postId: root.postId,
              organizationId: root.organizationId,
            },
          ],
          typedSearchAttributes: new TypedSearchAttributes([
            { key: postId, value: root.postId },
            { key: organizationId, value: root.organizationId },
          ]),
        });
        await child.result();
      } catch {
        // Persisted Post state is the source of truth. Finalization below turns
        // provider/activity failures and unknown child outcomes into FAILED.
      }
    })
  );

  return finalizePipelineSlot({ executionId: claim.executionId });
}

import { PipelineActivity } from '@gitroom/orchestrator/activities/pipeline.activity';
import { PipelineSlotWorkflowV1Request } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.execution';
import { proxyActivities, startChild } from '@temporalio/workflow';
import { WorkflowIdReusePolicy } from '@temporalio/common';
import { pipelineSlotWorkflowV2 } from './pipeline-workflows/pipeline.slot.workflow.v2';

const MAXIMUM_CANDIDATES_PER_TICK = 100;

const { discoverDuePipelineSlots } = proxyActivities<PipelineActivity>({
  startToCloseTimeout: '2 minutes',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    initialInterval: '5 seconds',
    backoffCoefficient: 2,
  },
});

const isAlreadyStarted = (error: unknown): boolean => {
  const value = error as { name?: string; message?: string };
  return (
    value?.name === 'WorkflowExecutionAlreadyStartedError' ||
    !!value?.message?.toLowerCase().includes('already started')
  );
};

export async function pipelineSchedulerTickWorkflowV1(): Promise<void> {
  const nowUtc = new Date().toISOString();
  let after: { scheduledFor: string; pipelineId: string } | undefined;

  do {
    let discovered;
    try {
      discovered = await discoverDuePipelineSlots({
        nowUtc,
        maximumCandidates: MAXIMUM_CANDIDATES_PER_TICK,
        ...(after ? { after } : {}),
      });
    } catch {
      break;
    }

    for (const candidate of discovered.candidates) {
      const slotRequest: PipelineSlotWorkflowV1Request = {
        pipelineId: candidate.pipelineId,
        scheduleRevision: candidate.scheduleRevision,
        scheduledFor: candidate.scheduledFor,
      };
      try {
        await startChild(pipelineSlotWorkflowV2, {
          workflowId: `pipeline-v2:${candidate.occurrenceId}`,
          taskQueue: 'main',
          parentClosePolicy: 'ABANDON',
          workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
          args: [slotRequest],
        });
      } catch (error) {
        if (!isAlreadyStarted(error)) {
          throw error;
        }
      }
    }

    after = discovered.next;
  } while (after);
}

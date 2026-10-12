import { PipelineActivity } from '@gitroom/orchestrator/activities/pipeline.activity';
import {
  PipelineSchedulerWorkflowV1Request,
  PipelineSlotWorkflowV1Request,
} from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.execution';
import {
  continueAsNew,
  proxyActivities,
  sleep,
  startChild,
} from '@temporalio/workflow';
import { WorkflowIdReusePolicy } from '@temporalio/common';
import { pipelineSlotWorkflowV4 } from './pipeline.slot.workflow.v4';

const SCHEDULER_CADENCE_MS = 30 * 1000;
const MAXIMUM_CANDIDATES_PER_TICK = 100;
const ITERATIONS_PER_RUN = 240;

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

export async function pipelineSchedulerWorkflowV4(
  request: PipelineSchedulerWorkflowV1Request = {}
): Promise<never> {
  let iteration = request.iteration || 0;

  while (iteration < ITERATIONS_PER_RUN) {
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
          await startChild(pipelineSlotWorkflowV4, {
            workflowId: `pipeline-v4:${candidate.occurrenceId}`,
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

    iteration += 1;
    await sleep(SCHEDULER_CADENCE_MS);
  }

  return continueAsNew<typeof pipelineSchedulerWorkflowV4>({ iteration: 0 });
}

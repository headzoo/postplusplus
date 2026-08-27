import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import {
  ConversionEvaluationActivity,
  ConversionEvaluationClaim,
} from '@gitroom/orchestrator/activities/conversion-evaluation.activity';
import { conversionEvaluationSignal } from '@gitroom/orchestrator/signals/conversion-evaluation.signal';

const BATCH_SIZE = 25;
const IDLE_CADENCE_MS = 30 * 1000;

const { claimDueJobs, cleanup, evaluateClaimedJob, reclaimStaleJobs } =
  proxyActivities<ConversionEvaluationActivity>({
    startToCloseTimeout: '2 minutes',
    taskQueue: 'main',
    retry: {
      maximumAttempts: 3,
      initialInterval: '2 seconds',
      backoffCoefficient: 2,
    },
  });

export type ConversionEvaluationWorkflowV1Request = {
  claims?: ConversionEvaluationClaim[];
};

export async function conversionEvaluationWorkflowV1(
  request: ConversionEvaluationWorkflowV1Request = {}
): Promise<never> {
  let signaled = false;
  setHandler(conversionEvaluationSignal, () => {
    signaled = true;
  });

  if (request.claims?.length) {
    for (const claim of request.claims) {
      try {
        await evaluateClaimedJob(claim);
      } catch {
        // ConversionService has already released or terminally settled the claim.
      }
    }
    return continueAsNew<typeof conversionEvaluationWorkflowV1>({});
  }

  try {
    await reclaimStaleJobs({});
    await cleanup({});
  } catch {
    // Maintenance is best effort and retried on every fresh workflow history.
  }

  let claims: ConversionEvaluationClaim[] = [];
  try {
    claims = await claimDueJobs({ limit: BATCH_SIZE });
  } catch {
    // A short cadence retries discovery without closing the infinite workflow.
  }

  if (claims.length) {
    return continueAsNew<typeof conversionEvaluationWorkflowV1>({ claims });
  }

  await condition(() => signaled, IDLE_CADENCE_MS);
  return continueAsNew<typeof conversionEvaluationWorkflowV1>({});
}

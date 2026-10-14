import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import { AutopostActivity } from '@gitroom/orchestrator/activities/autopost.activity';

const { autoPost } = proxyActivities<AutopostActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

export async function autoPostWorkflowV3({
  id,
  immediately,
}: {
  id: string;
  immediately: boolean;
}): Promise<never> {
  if (immediately) {
    try {
      await autoPost(id);
    } catch {
      // The activity notifies the organization; the next hourly check retries.
    }
  }
  await sleep(3600000);
  return continueAsNew<typeof autoPostWorkflowV3>({ id, immediately: true });
}

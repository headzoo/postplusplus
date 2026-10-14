import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';

const { searchForMissingThreeHoursPosts } = proxyActivities<PostActivity>({
  startToCloseTimeout: '10 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

export async function missingPostWorkflowV2(): Promise<never> {
  try {
    await searchForMissingThreeHoursPosts();
  } catch {
    // The next hourly scan retries recovery without closing the workflow.
  }
  await sleep('1 hour');
  return continueAsNew<typeof missingPostWorkflowV2>();
}

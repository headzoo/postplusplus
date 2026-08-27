import { continueAsNew, proxyActivities } from '@temporalio/workflow';
import { AutopostActivity } from '@gitroom/orchestrator/activities/autopost.activity';
import { AUTOPOST_ADMIN_TRIGGER_BATCH_SIZE } from '@gitroom/nestjs-libraries/temporal/admin-schedule.workflow';

export type AutopostAdminTriggerWorkflowV1Request = {
  after?: string;
};

const { autoPost, listActiveAutopostIdsForAdmin } =
  proxyActivities<AutopostActivity>({
    startToCloseTimeout: '10 minute',
    taskQueue: 'main',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '2 minutes',
    },
  });

export async function autopostAdminTriggerWorkflowV1(
  request: AutopostAdminTriggerWorkflowV1Request = {}
): Promise<void> {
  const page = await listActiveAutopostIdsForAdmin({
    after: request.after,
    take: AUTOPOST_ADMIN_TRIGGER_BATCH_SIZE,
  });

  for (const id of page.ids) {
    try {
      await autoPost(id);
    } catch {
      // Isolate a single failing autopost so the rest of the batch continues.
    }
  }

  if (page.next) {
    return continueAsNew<typeof autopostAdminTriggerWorkflowV1>({
      after: page.next,
    });
  }
}

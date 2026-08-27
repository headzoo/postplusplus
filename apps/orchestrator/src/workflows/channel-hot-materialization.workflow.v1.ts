import { continueAsNew, proxyActivities } from '@temporalio/workflow';
import {
  ChannelHotMaterializationActivity,
  ChannelHotMaterializationCandidate,
} from '@gitroom/orchestrator/activities/channel-hot-materialization.activity';
import {
  HOT_MATERIALIZATION_ACTIVITY_RETRY,
  HOT_MATERIALIZATION_ACTIVITY_TIMEOUT,
} from '@gitroom/nestjs-libraries/temporal/hot-triage.schedule';

export type ChannelHotMaterializationWorkflowV1Request = {
  hour?: string;
  after?: string;
};

const { resolveSweepHourV1, listDueCandidatesV1, materializeHotPicksV1 } =
  proxyActivities<ChannelHotMaterializationActivity>({
    startToCloseTimeout: HOT_MATERIALIZATION_ACTIVITY_TIMEOUT,
    taskQueue: 'main',
    retry: HOT_MATERIALIZATION_ACTIVITY_RETRY,
  });

export async function channelHotMaterializationWorkflowV1(
  request: ChannelHotMaterializationWorkflowV1Request = {}
): Promise<void> {
  const hour = request.hour ?? (await resolveSweepHourV1()).hour;

  const discovered = await listDueCandidatesV1({
    hour,
    after: request.after,
  });
  const candidate = discovered.candidates[0] as
    | ChannelHotMaterializationCandidate
    | undefined;

  if (!candidate) {
    return;
  }

  try {
    await materializeHotPicksV1({ hour, candidate });
  } catch {
    // Activity retries run first; isolate a persistently failing integration.
  }

  return continueAsNew<typeof channelHotMaterializationWorkflowV1>({
    hour,
    after: candidate.id,
  });
}

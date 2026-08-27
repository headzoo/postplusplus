import { continueAsNew, proxyActivities } from '@temporalio/workflow';
import {
  ChannelCultivateActivity,
  ChannelCultivateCandidate,
} from '@gitroom/orchestrator/activities/channel-cultivate.activity';
import {
  CULTIVATE_MATERIALIZATION_ACTIVITY_RETRY,
  CULTIVATE_MATERIALIZATION_ACTIVITY_TIMEOUT,
} from '@gitroom/nestjs-libraries/temporal/cultivate.schedule';

export type ChannelCultivateWorkflowV2Request = {
  hour?: string;
  after?: string;
};

const { resolveSweepHourV2, listDueCandidatesV2, materializeCultivatePicksV2 } =
  proxyActivities<ChannelCultivateActivity>({
    startToCloseTimeout: CULTIVATE_MATERIALIZATION_ACTIVITY_TIMEOUT,
    taskQueue: 'main',
    retry: CULTIVATE_MATERIALIZATION_ACTIVITY_RETRY,
  });

export async function channelCultivateWorkflowV2(
  request: ChannelCultivateWorkflowV2Request = {}
): Promise<void> {
  const hour = request.hour ?? (await resolveSweepHourV2()).hour;

  const discovered = await listDueCandidatesV2({
    hour,
    after: request.after,
  });
  const candidate = discovered.candidates[0] as
    | ChannelCultivateCandidate
    | undefined;

  if (!candidate) {
    return;
  }

  try {
    await materializeCultivatePicksV2({ hour, candidate });
  } catch {
    // Activity retries run first; isolate a persistently failing integration.
  }

  return continueAsNew<typeof channelCultivateWorkflowV2>({
    hour,
    after: candidate.id,
  });
}

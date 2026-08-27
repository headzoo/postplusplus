import { continueAsNew, proxyActivities } from '@temporalio/workflow';
import {
  ChannelFollowerBotScoreActivity,
  ChannelFollowerBotScoreCandidate,
} from '@gitroom/orchestrator/activities/channel-follower-bot-score.activity';

export type ChannelFollowerBotScoreWorkflowV1Request = {
  after?: string;
  active?: {
    candidate: ChannelFollowerBotScoreCandidate;
  };
};

const { listDueCandidatesV1, computeNextBatchV1 } =
  proxyActivities<ChannelFollowerBotScoreActivity>({
    startToCloseTimeout: '2 minutes',
    taskQueue: 'main',
    retry: {
      maximumAttempts: 3,
      initialInterval: '10 seconds',
      backoffCoefficient: 2,
    },
  });

export async function channelFollowerBotScoreWorkflowV1(
  request: ChannelFollowerBotScoreWorkflowV1Request = {}
): Promise<void> {
  if (request.active) {
    const { candidate } = request.active;
    try {
      const batch = await computeNextBatchV1({ candidate });
      if (batch.hasMore) {
        return continueAsNew<typeof channelFollowerBotScoreWorkflowV1>({
          after: request.after,
          active: { candidate },
        });
      }
    } catch {
      // Activity retries run first; isolate a persistently failing integration.
    }
    return continueAsNew<typeof channelFollowerBotScoreWorkflowV1>({
      after: candidate.id,
    });
  }

  const discovered = await listDueCandidatesV1({ after: request.after });
  const candidate = discovered.candidates[0];
  if (!candidate) {
    return;
  }

  try {
    const batch = await computeNextBatchV1({ candidate });
    if (batch.hasMore) {
      return continueAsNew<typeof channelFollowerBotScoreWorkflowV1>({
        after: request.after,
        active: { candidate },
      });
    }
  } catch {
    // Activity retries run first; isolate a persistently failing integration.
  }

  return continueAsNew<typeof channelFollowerBotScoreWorkflowV1>({
    after: candidate.id,
  });
}

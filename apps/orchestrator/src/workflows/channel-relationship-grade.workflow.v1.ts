import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import {
  ChannelRelationshipGradeActivity,
  ChannelRelationshipGradeCandidate,
} from '@gitroom/orchestrator/activities/channel-relationship-grade.activity';

const SCAN_CADENCE_MS = 60 * 60 * 1000;

export type ChannelRelationshipGradeWorkflowRequest = {
  after?: string;
  active?: {
    candidate: ChannelRelationshipGradeCandidate;
    snapshotAt: string;
  };
};

const { listDueCandidates, snapshotNextBatch } =
  proxyActivities<ChannelRelationshipGradeActivity>({
    startToCloseTimeout: '2 minutes',
    taskQueue: 'main',
    retry: {
      maximumAttempts: 3,
      initialInterval: '10 seconds',
      backoffCoefficient: 2,
    },
  });

export async function channelRelationshipGradeWorkflowV1(
  request: ChannelRelationshipGradeWorkflowRequest = {}
): Promise<never> {
  if (request.active) {
    const { candidate, snapshotAt } = request.active;
    try {
      const batch = await snapshotNextBatch({ candidate, snapshotAt });
      if (batch.hasMore) {
        return continueAsNew<typeof channelRelationshipGradeWorkflowV1>({
          after: request.after,
          active: { candidate, snapshotAt: batch.snapshotAt },
        });
      }
    } catch {
      // Activity retries run first; isolate a persistently failing integration.
    }
    return continueAsNew<typeof channelRelationshipGradeWorkflowV1>({
      after: candidate.id,
    });
  }

  const discovered = await listDueCandidates(request.after);
  const candidate = discovered.candidates[0];
  if (!candidate) {
    await sleep(SCAN_CADENCE_MS);
    return continueAsNew<typeof channelRelationshipGradeWorkflowV1>({});
  }

  const snapshotAt = discovered.asOf;
  try {
    const batch = await snapshotNextBatch({ candidate, snapshotAt });
    if (batch.hasMore) {
      return continueAsNew<typeof channelRelationshipGradeWorkflowV1>({
        after: request.after,
        active: { candidate, snapshotAt: batch.snapshotAt },
      });
    }
  } catch {
    // Activity retries run first; isolate a persistently failing integration.
  }

  return continueAsNew<typeof channelRelationshipGradeWorkflowV1>({
    after: candidate.id,
  });
}

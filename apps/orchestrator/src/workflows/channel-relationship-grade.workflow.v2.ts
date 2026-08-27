import { continueAsNew, proxyActivities } from '@temporalio/workflow';
import {
  ChannelRelationshipGradeActivity,
  ChannelRelationshipGradeCandidate,
} from '@gitroom/orchestrator/activities/channel-relationship-grade.activity';
import { RelationshipGradeScheduleConfig } from '@gitroom/nestjs-libraries/temporal/relationship-grade.schedule';

export type ChannelRelationshipGradeWorkflowV2Request = {
  after?: string;
  cadence?: RelationshipGradeScheduleConfig;
  active?: {
    candidate: ChannelRelationshipGradeCandidate;
    snapshotAt: string;
  };
};

const { listDueCandidatesV2, snapshotNextBatchV2 } =
  proxyActivities<ChannelRelationshipGradeActivity>({
    startToCloseTimeout: '2 minutes',
    taskQueue: 'main',
    retry: {
      maximumAttempts: 3,
      initialInterval: '10 seconds',
      backoffCoefficient: 2,
    },
  });

export async function channelRelationshipGradeWorkflowV2(
  request: ChannelRelationshipGradeWorkflowV2Request = {}
): Promise<void> {
  const cadence = request.cadence;

  if (request.active) {
    const { candidate, snapshotAt } = request.active;
    try {
      const batch = await snapshotNextBatchV2({
        candidate,
        snapshotAt,
        cadence,
      });
      if (batch.hasMore) {
        return continueAsNew<typeof channelRelationshipGradeWorkflowV2>({
          after: request.after,
          cadence,
          active: { candidate, snapshotAt: batch.snapshotAt },
        });
      }
    } catch {
      // Activity retries run first; isolate a persistently failing integration.
    }
    return continueAsNew<typeof channelRelationshipGradeWorkflowV2>({
      after: candidate.id,
      cadence,
    });
  }

  const discovered = await listDueCandidatesV2({
    after: request.after,
    cadence,
  });
  const candidate = discovered.candidates[0];
  if (!candidate) {
    return;
  }

  const snapshotAt = discovered.asOf;
  try {
    const batch = await snapshotNextBatchV2({
      candidate,
      snapshotAt,
      cadence,
    });
    if (batch.hasMore) {
      return continueAsNew<typeof channelRelationshipGradeWorkflowV2>({
        after: request.after,
        cadence,
        active: { candidate, snapshotAt: batch.snapshotAt },
      });
    }
  } catch {
    // Activity retries run first; isolate a persistently failing integration.
  }

  return continueAsNew<typeof channelRelationshipGradeWorkflowV2>({
    after: candidate.id,
    cadence,
  });
}

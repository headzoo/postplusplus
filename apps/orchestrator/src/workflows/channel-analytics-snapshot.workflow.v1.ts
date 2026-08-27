import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import {
  ChannelAnalyticsCaptureMode,
  ChannelAnalyticsSnapshotActivity,
  ChannelAnalyticsSnapshotCandidate,
} from '@gitroom/orchestrator/activities/channel-analytics-snapshot.activity';

const SCAN_CADENCE_MS = 60 * 60 * 1000;

type CandidateBatch = {
  candidates: ChannelAnalyticsSnapshotCandidate[];
  index: number;
  snapshotAt: string;
};

type ActiveCapture = {
  candidate: ChannelAnalyticsSnapshotCandidate;
  snapshotAt: string;
  mode?: ChannelAnalyticsCaptureMode;
  cursor?: string;
};

export type ChannelAnalyticsSnapshotWorkflowRequest = {
  after?: string;
  batch?: CandidateBatch;
  active?: ActiveCapture;
};

const {
  capturePersistPage,
  finalizeCapture,
  listDueCandidates,
  recordCandidateFailure,
} = proxyActivities<ChannelAnalyticsSnapshotActivity>({
  startToCloseTimeout: '2 minutes',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
  },
});

export async function channelAnalyticsSnapshotWorkflowV1(
  request: ChannelAnalyticsSnapshotWorkflowRequest = {}
): Promise<never> {
  const batch = request.batch;
  const candidate = request.active?.candidate ?? batch?.candidates[batch.index];

  if (candidate) {
    const snapshotAt = request.active?.snapshotAt ?? batch!.snapshotAt;
    try {
      const page = await capturePersistPage({
        candidate,
        snapshotAt,
        ...(request.active?.cursor ? { cursor: request.active.cursor } : {}),
        ...(request.active?.mode ? { mode: request.active.mode } : {}),
      });
      if (request.active?.mode && request.active.mode !== page.mode) {
        throw new Error('Analytics capture mode changed during pagination');
      }
      if (page.hasMore) {
        if (!page.nextCursor) {
          throw new Error(
            'Analytics page indicated more results without a cursor'
          );
        }
        return continueAsNew<typeof channelAnalyticsSnapshotWorkflowV1>({
          after: request.after,
          batch,
          active: {
            candidate,
            snapshotAt,
            mode: page.mode,
            cursor: page.nextCursor,
          },
        });
      }
      await finalizeCapture({ candidate, snapshotAt, mode: page.mode });
    } catch (error) {
      try {
        await recordCandidateFailure({
          candidate,
          message: error instanceof Error ? error.message : undefined,
        });
      } catch {
        // A failure record is best effort; the next cadence remains safe.
      }
    }
    return advanceCandidate(request, candidate);
  }

  const discovered = await listDueCandidates(request.after);
  if (!discovered.candidates.length) {
    await sleep(SCAN_CADENCE_MS);
    return continueAsNew<typeof channelAnalyticsSnapshotWorkflowV1>({});
  }
  return continueAsNew<typeof channelAnalyticsSnapshotWorkflowV1>({
    after: request.after,
    batch: {
      candidates: discovered.candidates,
      index: 0,
      snapshotAt: discovered.asOf,
    },
  });
}

function advanceCandidate(
  request: ChannelAnalyticsSnapshotWorkflowRequest,
  candidate: ChannelAnalyticsSnapshotCandidate
): Promise<never> {
  if (
    request.batch &&
    request.batch.index + 1 < request.batch.candidates.length
  ) {
    return continueAsNew<typeof channelAnalyticsSnapshotWorkflowV1>({
      after: request.after,
      batch: { ...request.batch, index: request.batch.index + 1 },
    });
  }
  return continueAsNew<typeof channelAnalyticsSnapshotWorkflowV1>({
    after: candidate.id,
  });
}

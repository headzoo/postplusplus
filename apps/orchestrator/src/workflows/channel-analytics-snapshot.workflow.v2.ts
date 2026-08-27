import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import {
  ChannelAnalyticsCaptureMode,
  ChannelAnalyticsSnapshotActivity,
  ChannelAnalyticsSnapshotCandidate,
} from '@gitroom/orchestrator/activities/channel-analytics-snapshot.activity';
import { channelAnalyticsSnapshotSignal } from '@gitroom/orchestrator/signals/channel-analytics-snapshot.signal';

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

export type ChannelAnalyticsSnapshotWorkflowV2Request = {
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

export async function channelAnalyticsSnapshotWorkflowV2(
  request: ChannelAnalyticsSnapshotWorkflowV2Request = {}
): Promise<never> {
  let poked = false;
  setHandler(channelAnalyticsSnapshotSignal, () => {
    poked = true;
  });

  const nextRequest = (
    next: ChannelAnalyticsSnapshotWorkflowV2Request
  ): Promise<never> =>
    continueAsNew<typeof channelAnalyticsSnapshotWorkflowV2>(poked ? {} : next);

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
        return nextRequest({
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
    return advanceCandidate(request, candidate, poked);
  }

  const discovered = await listDueCandidates(request.after);
  if (!discovered.candidates.length) {
    await condition(() => poked, SCAN_CADENCE_MS);
    return continueAsNew<typeof channelAnalyticsSnapshotWorkflowV2>({});
  }
  return nextRequest({
    after: request.after,
    batch: {
      candidates: discovered.candidates,
      index: 0,
      snapshotAt: discovered.asOf,
    },
  });
}

function advanceCandidate(
  request: ChannelAnalyticsSnapshotWorkflowV2Request,
  candidate: ChannelAnalyticsSnapshotCandidate,
  poked: boolean
): Promise<never> {
  if (poked) {
    return continueAsNew<typeof channelAnalyticsSnapshotWorkflowV2>({});
  }
  if (
    request.batch &&
    request.batch.index + 1 < request.batch.candidates.length
  ) {
    return continueAsNew<typeof channelAnalyticsSnapshotWorkflowV2>({
      after: request.after,
      batch: { ...request.batch, index: request.batch.index + 1 },
    });
  }
  return continueAsNew<typeof channelAnalyticsSnapshotWorkflowV2>({
    after: candidate.id,
  });
}

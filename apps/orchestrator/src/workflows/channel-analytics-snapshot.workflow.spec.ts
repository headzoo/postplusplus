const listDueCandidates = jest.fn();
const capturePersistPage = jest.fn();
const finalizeCapture = jest.fn();
const recordCandidateFailure = jest.fn();
const sleep = jest.fn();
const continueAsNew = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    listDueCandidates,
    capturePersistPage,
    finalizeCapture,
    recordCandidateFailure,
  }),
  sleep,
  continueAsNew,
}));

import { channelAnalyticsSnapshotWorkflowV1 } from './channel-analytics-snapshot.workflow.v1';

describe('channelAnalyticsSnapshotWorkflowV1', () => {
  const candidate = { id: 'integration', organizationId: 'organization' };
  const nextCandidate = {
    id: 'next-integration',
    organizationId: 'organization',
  };
  const snapshotAt = '2026-08-15T12:00:00.000Z';
  const batch = {
    candidates: [candidate, nextCandidate],
    index: 0,
    snapshotAt,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    continueAsNew.mockResolvedValue(undefined);
    sleep.mockResolvedValue(undefined);
  });

  it('continues each provider page with its pinned mode and cursor', async () => {
    capturePersistPage.mockResolvedValue({
      mode: 'post_lifetime',
      hasMore: true,
      nextCursor: 'next',
    });

    await channelAnalyticsSnapshotWorkflowV1({
      after: 'before',
      batch,
      active: {
        candidate,
        snapshotAt,
        mode: 'post_lifetime',
        cursor: 'current',
      },
    });

    expect(capturePersistPage).toHaveBeenCalledWith({
      candidate,
      snapshotAt,
      mode: 'post_lifetime',
      cursor: 'current',
    });
    expect(continueAsNew).toHaveBeenCalledWith({
      after: 'before',
      batch,
      active: { candidate, snapshotAt, mode: 'post_lifetime', cursor: 'next' },
    });
  });

  it('finalizes a completed capture before advancing sequentially in its batch', async () => {
    capturePersistPage.mockResolvedValue({ mode: 'daily', hasMore: false });

    await channelAnalyticsSnapshotWorkflowV1({ after: 'before', batch });

    expect(finalizeCapture).toHaveBeenCalledWith({
      candidate,
      snapshotAt,
      mode: 'daily',
    });
    expect(continueAsNew).toHaveBeenCalledWith({
      after: 'before',
      batch: { ...batch, index: 1 },
    });
  });

  it('records an exhausted candidate failure and advances without blocking later channels', async () => {
    capturePersistPage.mockRejectedValue(new Error('provider unavailable'));

    await channelAnalyticsSnapshotWorkflowV1({ after: 'before', batch });

    expect(recordCandidateFailure).toHaveBeenCalledWith({
      candidate,
      message: 'provider unavailable',
    });
    expect(continueAsNew).toHaveBeenCalledWith({
      after: 'before',
      batch: { ...batch, index: 1 },
    });
  });

  it('starts a bounded batch from a scan result', async () => {
    listDueCandidates.mockResolvedValue({
      asOf: snapshotAt,
      candidates: [candidate],
    });

    await channelAnalyticsSnapshotWorkflowV1({ after: 'before' });

    expect(continueAsNew).toHaveBeenCalledWith({
      after: 'before',
      batch: { candidates: [candidate], index: 0, snapshotAt },
    });
  });

  it('waits hourly and resets the scan when no candidates are due', async () => {
    listDueCandidates.mockResolvedValue({ asOf: snapshotAt, candidates: [] });

    await channelAnalyticsSnapshotWorkflowV1({ after: 'before' });

    expect(sleep).toHaveBeenCalledWith(60 * 60 * 1000);
    expect(continueAsNew).toHaveBeenCalledWith({});
  });

  it('advances a completed final batch candidate by its identifier', async () => {
    capturePersistPage.mockResolvedValue({ mode: 'daily', hasMore: false });
    const finalBatch = { candidates: [candidate], index: 0, snapshotAt };

    await channelAnalyticsSnapshotWorkflowV1({
      after: 'before',
      batch: finalBatch,
    });

    expect(continueAsNew).toHaveBeenCalledWith({ after: candidate.id });
  });
});

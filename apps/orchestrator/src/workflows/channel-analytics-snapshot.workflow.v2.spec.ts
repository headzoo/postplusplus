const listDueCandidates = jest.fn();
const capturePersistPage = jest.fn();
const finalizeCapture = jest.fn();
const recordCandidateFailure = jest.fn();
const condition = jest.fn();
const continueAsNew = jest.fn();
const setHandler = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    listDueCandidates,
    capturePersistPage,
    finalizeCapture,
    recordCandidateFailure,
  }),
  condition,
  continueAsNew,
  setHandler,
  defineSignal: (name: string) => name,
}));

import { channelAnalyticsSnapshotWorkflowV2 } from './channel-analytics-snapshot.workflow.v2';

describe('channelAnalyticsSnapshotWorkflowV2', () => {
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
  let signalHandler: (() => void) | undefined;

  beforeEach(() => {
    jest.resetAllMocks();
    signalHandler = undefined;
    setHandler.mockImplementation((_signal, handler) => {
      signalHandler = handler;
    });
    continueAsNew.mockResolvedValue(undefined);
    condition.mockResolvedValue(false);
  });

  it('continues each provider page with its pinned mode and cursor', async () => {
    capturePersistPage.mockResolvedValue({
      mode: 'post_lifetime',
      hasMore: true,
      nextCursor: 'next',
    });

    await channelAnalyticsSnapshotWorkflowV2({
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

    await channelAnalyticsSnapshotWorkflowV2({ after: 'before', batch });

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

    await channelAnalyticsSnapshotWorkflowV2({ after: 'before', batch });

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

    await channelAnalyticsSnapshotWorkflowV2({ after: 'before' });

    expect(continueAsNew).toHaveBeenCalledWith({
      after: 'before',
      batch: { candidates: [candidate], index: 0, snapshotAt },
    });
  });

  it('waits for a poke or hourly cadence when no candidates are due', async () => {
    listDueCandidates.mockResolvedValue({ asOf: snapshotAt, candidates: [] });

    await channelAnalyticsSnapshotWorkflowV2({ after: 'before' });

    expect(condition).toHaveBeenCalledWith(
      expect.any(Function),
      60 * 60 * 1000
    );
    expect(setHandler).toHaveBeenCalled();
    expect(continueAsNew).toHaveBeenCalledWith({});
  });

  it('advances a completed final batch candidate by its identifier', async () => {
    capturePersistPage.mockResolvedValue({ mode: 'daily', hasMore: false });
    const finalBatch = { candidates: [candidate], index: 0, snapshotAt };

    await channelAnalyticsSnapshotWorkflowV2({
      after: 'before',
      batch: finalBatch,
    });

    expect(continueAsNew).toHaveBeenCalledWith({ after: candidate.id });
  });

  it('restarts scanning from the beginning after a poke during capture', async () => {
    capturePersistPage.mockImplementation(async () => {
      signalHandler?.();
      return { mode: 'daily', hasMore: true, nextCursor: 'next' };
    });

    await channelAnalyticsSnapshotWorkflowV2({
      after: 'before',
      batch,
      active: { candidate, snapshotAt, mode: 'daily', cursor: 'current' },
    });

    expect(continueAsNew).toHaveBeenCalledWith({});
  });
});

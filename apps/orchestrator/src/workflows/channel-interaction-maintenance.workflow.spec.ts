const listCandidates = jest.fn();
const reconcileSubscriptions = jest.fn();
const beginFollowerSync = jest.fn();
const fetchAndApplyFollowerPage = jest.fn();
const completeFollowerSync = jest.fn();
const abortFollowerSync = jest.fn();
const rebuildWindow = jest.fn();
const condition = jest.fn();
const continueAsNew = jest.fn();
const setHandler = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    listCandidates,
    reconcileSubscriptions,
    beginFollowerSync,
    fetchAndApplyFollowerPage,
    completeFollowerSync,
    abortFollowerSync,
    rebuildWindow,
  }),
  condition,
  continueAsNew,
  setHandler,
  defineSignal: (name: string) => name,
}));

import { channelInteractionMaintenanceWorkflowV1 } from './channel-interaction-maintenance.workflow.v1';
import { channelInteractionMaintenanceWorkflowV2 } from './channel-interaction-maintenance.workflow.v2';

describe('channelInteractionMaintenanceWorkflowV1', () => {
  const candidate = {
    id: 'integration',
    organizationId: 'organization',
    maintenance: 'active' as const,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    continueAsNew.mockResolvedValue(undefined);
  });

  it('continues a follower generation without committing a partial snapshot', async () => {
    fetchAndApplyFollowerPage.mockResolvedValue({
      hasMore: true,
      nextCursor: 'next-page',
    });

    await channelInteractionMaintenanceWorkflowV1({
      after: 'before',
      followerSync: {
        candidate,
        generation: 'generation',
        cursor: 'current-page',
      },
    });

    expect(fetchAndApplyFollowerPage).toHaveBeenCalledWith({
      candidate,
      generation: 'generation',
      cursor: 'current-page',
    });
    expect(completeFollowerSync).not.toHaveBeenCalled();
    expect(abortFollowerSync).not.toHaveBeenCalled();
    expect(continueAsNew).toHaveBeenCalledWith({
      after: 'before',
      followerSync: {
        candidate,
        generation: 'generation',
        cursor: 'next-page',
      },
    });
  });

  it('aborts a failed follower generation before maintaining summaries', async () => {
    fetchAndApplyFollowerPage.mockRejectedValue(new Error('provider failure'));

    await channelInteractionMaintenanceWorkflowV1({
      followerSync: { candidate, generation: 'generation' },
    });

    expect(abortFollowerSync).toHaveBeenCalledWith({
      candidate,
      generation: 'generation',
    });
    expect(completeFollowerSync).not.toHaveBeenCalled();
    expect(rebuildWindow).toHaveBeenCalledTimes(4);
    expect(continueAsNew).toHaveBeenCalledWith({ after: candidate.id });
  });

  it('starts a follower generation after reconciling one candidate', async () => {
    listCandidates.mockResolvedValue({ candidates: [candidate] });
    reconcileSubscriptions.mockResolvedValue({
      supported: true,
      state: 'active',
    });
    beginFollowerSync.mockResolvedValue({
      supported: true,
      generation: 'generation',
    });

    await channelInteractionMaintenanceWorkflowV1({ after: 'before' });

    expect(reconcileSubscriptions).toHaveBeenCalledWith(candidate);
    expect(continueAsNew).toHaveBeenCalledWith({
      after: 'before',
      followerSync: { candidate, generation: 'generation' },
    });
  });

  it('retries cleanup candidates without follower syncs or rollups', async () => {
    const cleanupCandidate = { ...candidate, maintenance: 'cleanup' as const };
    listCandidates.mockResolvedValue({ candidates: [cleanupCandidate] });
    reconcileSubscriptions.mockRejectedValue(new Error('provider failure'));

    await channelInteractionMaintenanceWorkflowV1({ after: 'before' });

    expect(reconcileSubscriptions).toHaveBeenCalledWith(cleanupCandidate);
    expect(beginFollowerSync).not.toHaveBeenCalled();
    expect(rebuildWindow).not.toHaveBeenCalled();
    expect(continueAsNew).toHaveBeenCalledWith({
      after: cleanupCandidate.id,
    });
  });

  it('waits for an hourly cadence when no candidates exist', async () => {
    listCandidates.mockResolvedValue({ candidates: [] });
    condition.mockResolvedValue(false);

    await channelInteractionMaintenanceWorkflowV1();

    expect(condition).toHaveBeenCalledWith(
      expect.any(Function),
      60 * 60 * 1000
    );
    expect(setHandler).toHaveBeenCalled();
    expect(continueAsNew).toHaveBeenCalledWith({});
  });
});

describe('channelInteractionMaintenanceWorkflowV2', () => {
  const candidate = {
    id: 'integration',
    organizationId: 'organization',
    maintenance: 'active' as const,
  };
  let signalHandler: (() => void) | undefined;

  beforeEach(() => {
    jest.resetAllMocks();
    signalHandler = undefined;
    setHandler.mockImplementation((_signal, handler) => {
      signalHandler = handler;
    });
    continueAsNew.mockResolvedValue(undefined);
  });

  it('restarts scanning from the beginning after a poke during a candidate pass', async () => {
    listCandidates.mockResolvedValue({ candidates: [candidate] });
    reconcileSubscriptions.mockImplementation(async () => {
      signalHandler?.();
      return { supported: true, state: 'active' };
    });
    beginFollowerSync.mockResolvedValue({ supported: false });

    await channelInteractionMaintenanceWorkflowV2({ after: 'before' });

    expect(reconcileSubscriptions).toHaveBeenCalledWith(candidate);
    expect(continueAsNew).toHaveBeenCalledWith({});
  });

  it('restarts scanning from the beginning after a poke during follower sync', async () => {
    fetchAndApplyFollowerPage.mockImplementation(async () => {
      signalHandler?.();
      return { hasMore: true, nextCursor: 'next-page' };
    });

    await channelInteractionMaintenanceWorkflowV2({
      after: 'before',
      followerSync: {
        candidate,
        generation: 'generation',
        cursor: 'current-page',
      },
    });

    expect(fetchAndApplyFollowerPage).toHaveBeenCalledWith({
      candidate,
      generation: 'generation',
      cursor: 'current-page',
    });
    expect(continueAsNew).toHaveBeenCalledWith({});
  });
});

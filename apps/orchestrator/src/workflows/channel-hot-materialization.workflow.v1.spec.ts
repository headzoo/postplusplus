const resolveSweepHourV1 = jest.fn();
const listDueCandidatesV1 = jest.fn();
const materializeHotPicksV1 = jest.fn();
const continueAsNew = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  continueAsNew,
  proxyActivities: jest.fn(() => ({
    resolveSweepHourV1,
    listDueCandidatesV1,
    materializeHotPicksV1,
  })),
}));

import { channelHotMaterializationWorkflowV1 } from './channel-hot-materialization.workflow.v1';

describe('channelHotMaterializationWorkflowV1', () => {
  const hour = '2026-08-25T13';
  const candidate = {
    id: 'integration-1',
    organizationId: 'org-1',
    providerIdentifier: 'x',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    continueAsNew.mockResolvedValue(undefined);
    resolveSweepHourV1.mockResolvedValue({ hour });
  });

  it('establishes the sweep hour and completes when no candidates remain', async () => {
    listDueCandidatesV1.mockResolvedValue({ candidates: [], hour });

    await expect(channelHotMaterializationWorkflowV1({})).resolves.toBeUndefined();

    expect(resolveSweepHourV1).toHaveBeenCalled();
    expect(listDueCandidatesV1).toHaveBeenCalledWith({ hour, after: undefined });
    expect(materializeHotPicksV1).not.toHaveBeenCalled();
    expect(continueAsNew).not.toHaveBeenCalled();
  });

  it('reuses the same hour across continue-as-new runs', async () => {
    listDueCandidatesV1.mockResolvedValue({ candidates: [candidate], hour });
    materializeHotPicksV1.mockResolvedValue({
      skipped: false,
      hour,
      candidateCount: 4,
      pickCount: 2,
    });

    await channelHotMaterializationWorkflowV1({ hour, after: 'integration-0' });

    expect(resolveSweepHourV1).not.toHaveBeenCalled();
    expect(listDueCandidatesV1).toHaveBeenCalledWith({
      hour,
      after: 'integration-0',
    });
    expect(continueAsNew).toHaveBeenCalledWith({
      hour,
      after: candidate.id,
    });
  });

  it('materializes one candidate and advances the keyset cursor', async () => {
    listDueCandidatesV1.mockResolvedValue({ candidates: [candidate], hour });
    materializeHotPicksV1.mockResolvedValue({
      skipped: false,
      hour,
      candidateCount: 10,
      pickCount: 5,
    });

    await channelHotMaterializationWorkflowV1({});

    expect(materializeHotPicksV1).toHaveBeenCalledWith({ hour, candidate });
    expect(continueAsNew).toHaveBeenCalledWith({
      hour,
      after: candidate.id,
    });
  });

  it('isolates a persistently failing integration after activity retries', async () => {
    listDueCandidatesV1.mockResolvedValue({ candidates: [candidate], hour });
    materializeHotPicksV1.mockRejectedValue(new Error('materialize failed'));

    await channelHotMaterializationWorkflowV1({ hour });

    expect(continueAsNew).toHaveBeenCalledWith({
      hour,
      after: candidate.id,
    });
  });
});

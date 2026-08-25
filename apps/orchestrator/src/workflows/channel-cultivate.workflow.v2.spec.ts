const resolveSweepHourV2 = jest.fn();
const listDueCandidatesV2 = jest.fn();
const materializeCultivatePicksV2 = jest.fn();
const continueAsNew = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  continueAsNew,
  proxyActivities: jest.fn(() => ({
    resolveSweepHourV2,
    listDueCandidatesV2,
    materializeCultivatePicksV2,
  })),
}));

import { channelCultivateWorkflowV2 } from './channel-cultivate.workflow.v2';

describe('channelCultivateWorkflowV2', () => {
  const hour = '2026-08-25T13';
  const candidate = {
    id: 'integration-1',
    organizationId: 'org-1',
    providerIdentifier: 'x',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    continueAsNew.mockResolvedValue(undefined);
    resolveSweepHourV2.mockResolvedValue({ hour });
  });

  it('establishes the sweep hour and completes when no candidates remain', async () => {
    listDueCandidatesV2.mockResolvedValue({ candidates: [], hour });

    await expect(channelCultivateWorkflowV2({})).resolves.toBeUndefined();

    expect(resolveSweepHourV2).toHaveBeenCalled();
    expect(listDueCandidatesV2).toHaveBeenCalledWith({ hour, after: undefined });
    expect(materializeCultivatePicksV2).not.toHaveBeenCalled();
    expect(continueAsNew).not.toHaveBeenCalled();
  });

  it('materializes one candidate and advances the keyset cursor', async () => {
    listDueCandidatesV2.mockResolvedValue({ candidates: [candidate], hour });
    materializeCultivatePicksV2.mockResolvedValue({
      skipped: false,
      hour,
      candidateCount: 10,
      pickCount: 5,
    });

    await channelCultivateWorkflowV2({});

    expect(materializeCultivatePicksV2).toHaveBeenCalledWith({ hour, candidate });
    expect(continueAsNew).toHaveBeenCalledWith({
      hour,
      after: candidate.id,
    });
  });
});

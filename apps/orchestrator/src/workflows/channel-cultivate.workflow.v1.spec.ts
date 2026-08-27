const listDueCandidatesV1 = jest.fn();
const materializeDailyPicksV1 = jest.fn();
const continueAsNew = jest.fn((args) =>
  Promise.resolve({ continued: true, args })
);

jest.mock('@temporalio/workflow', () => ({
  continueAsNew,
  condition: jest.fn(() => Promise.resolve(false)),
  defineSignal: jest.fn((name: string) => name),
  setHandler: jest.fn(),
  proxyActivities: jest.fn(() => ({
    listDueCandidatesV1,
    materializeDailyPicksV1,
  })),
}));

jest.mock('@gitroom/orchestrator/signals/channel-cultivate.signal', () => ({
  channelCultivateSignal: 'channelCultivate',
}));

import { channelCultivateWorkflowV1 } from './channel-cultivate.workflow.v1';

describe('channelCultivateWorkflowV1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    continueAsNew.mockImplementation((args) =>
      Promise.resolve({ continued: true, args })
    );
  });

  it('idles when no candidates remain', async () => {
    listDueCandidatesV1.mockResolvedValue({ candidates: [] });
    await expect(channelCultivateWorkflowV1({})).resolves.toEqual({
      continued: true,
      args: {},
    });
    expect(materializeDailyPicksV1).not.toHaveBeenCalled();
  });

  it('materializes daily picks and continues after the candidate', async () => {
    listDueCandidatesV1.mockResolvedValue({
      candidates: [
        {
          id: 'integration-1',
          organizationId: 'org-1',
          providerIdentifier: 'x',
        },
      ],
    });
    materializeDailyPicksV1.mockResolvedValue({
      skipped: false,
      pickCount: 12,
    });

    await expect(channelCultivateWorkflowV1({})).resolves.toEqual({
      continued: true,
      args: { after: 'integration-1' },
    });
    expect(materializeDailyPicksV1).toHaveBeenCalledWith({
      candidate: {
        id: 'integration-1',
        organizationId: 'org-1',
        providerIdentifier: 'x',
      },
    });
  });
});

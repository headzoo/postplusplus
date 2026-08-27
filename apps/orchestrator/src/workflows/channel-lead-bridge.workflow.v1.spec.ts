const listDueCandidatesV1 = jest.fn();
const crawlNextWarmFollowerV1 = jest.fn();
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
    crawlNextWarmFollowerV1,
  })),
}));

jest.mock('@gitroom/orchestrator/signals/channel-lead-bridge.signal', () => ({
  channelLeadBridgeSignal: 'channelLeadBridge',
}));

import { channelLeadBridgeWorkflowV1 } from './channel-lead-bridge.workflow.v1';

describe('channelLeadBridgeWorkflowV1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    continueAsNew.mockImplementation((args) =>
      Promise.resolve({ continued: true, args })
    );
  });

  it('idles when no candidates remain', async () => {
    listDueCandidatesV1.mockResolvedValue({ candidates: [] });
    await expect(channelLeadBridgeWorkflowV1({})).resolves.toEqual({
      continued: true,
      args: {},
    });
    expect(crawlNextWarmFollowerV1).not.toHaveBeenCalled();
  });

  it('crawls the next warm follower and continues after the candidate', async () => {
    listDueCandidatesV1.mockResolvedValue({
      candidates: [
        {
          id: 'integration-1',
          organizationId: 'org-1',
          providerIdentifier: 'x',
        },
      ],
    });
    crawlNextWarmFollowerV1.mockResolvedValue({
      skipped: false,
      processed: 1,
      applied: 3,
    });

    await expect(channelLeadBridgeWorkflowV1({})).resolves.toEqual({
      continued: true,
      args: { after: 'integration-1' },
    });
    expect(crawlNextWarmFollowerV1).toHaveBeenCalledWith({
      candidate: {
        id: 'integration-1',
        organizationId: 'org-1',
        providerIdentifier: 'x',
      },
    });
  });
});

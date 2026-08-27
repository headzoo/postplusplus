const clearDiscoveredLeadsV1 = jest.fn();
const crawlNextWarmFollowerBurstV1 = jest.fn();
const resumeIdleLeadBridgeV1 = jest.fn();
const continueAsNew = jest.fn((args) =>
  Promise.resolve({ continued: true, args })
);

jest.mock('@temporalio/workflow', () => ({
  continueAsNew,
  proxyActivities: jest.fn(() => ({
    clearDiscoveredLeadsV1,
    crawlNextWarmFollowerBurstV1,
    resumeIdleLeadBridgeV1,
  })),
}));

import { channelLeadBridgeAdminTriggerWorkflowV1 } from './channel-lead-bridge-admin-trigger.workflow.v1';

describe('channelLeadBridgeAdminTriggerWorkflowV1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    continueAsNew.mockImplementation((args) =>
      Promise.resolve({ continued: true, args })
    );
  });

  it('clears discovered leads on the first pass then continues', async () => {
    clearDiscoveredLeadsV1.mockResolvedValue({
      bridgesDeleted: 2,
      orphansDeleted: 1,
    });

    await expect(channelLeadBridgeAdminTriggerWorkflowV1({})).resolves.toEqual({
      continued: true,
      args: { cleared: true, applied: 0 },
    });
    expect(clearDiscoveredLeadsV1).toHaveBeenCalled();
    expect(crawlNextWarmFollowerBurstV1).not.toHaveBeenCalled();
  });

  it('crawls until the burst target then resumes the idle workflow', async () => {
    crawlNextWarmFollowerBurstV1.mockResolvedValue({
      exhausted: false,
      applied: 20,
      candidateId: 'integration-1',
    });
    resumeIdleLeadBridgeV1.mockResolvedValue({ resumed: true });

    await expect(
      channelLeadBridgeAdminTriggerWorkflowV1({
        cleared: true,
        applied: 0,
      })
    ).resolves.toBeUndefined();

    expect(crawlNextWarmFollowerBurstV1).toHaveBeenCalledWith({
      after: undefined,
      maxApplied: 20,
    });
    expect(resumeIdleLeadBridgeV1).toHaveBeenCalledWith({
      applied: 20,
      reachedTarget: true,
    });
  });

  it('resumes the idle workflow when candidates are exhausted before the target', async () => {
    crawlNextWarmFollowerBurstV1.mockResolvedValue({
      exhausted: true,
      applied: 0,
      candidateId: undefined,
    });
    resumeIdleLeadBridgeV1.mockResolvedValue({ resumed: true });

    await expect(
      channelLeadBridgeAdminTriggerWorkflowV1({
        cleared: true,
        applied: 5,
      })
    ).resolves.toBeUndefined();

    expect(resumeIdleLeadBridgeV1).toHaveBeenCalledWith({
      applied: 5,
      reachedTarget: false,
    });
  });

  it('continues as new when a crawl applies some leads but not enough', async () => {
    crawlNextWarmFollowerBurstV1.mockResolvedValue({
      exhausted: false,
      applied: 7,
      candidateId: 'integration-1',
    });

    await expect(
      channelLeadBridgeAdminTriggerWorkflowV1({
        cleared: true,
        applied: 5,
      })
    ).resolves.toEqual({
      continued: true,
      args: {
        cleared: true,
        applied: 12,
        after: 'integration-1',
      },
    });
    expect(resumeIdleLeadBridgeV1).not.toHaveBeenCalled();
  });
});

const searchForMissingThreeHoursPosts = jest.fn();
const sleep = jest.fn();
const continueAsNew = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({ searchForMissingThreeHoursPosts }),
  sleep,
  continueAsNew,
}));

import { missingPostWorkflowV2 } from './missing.post.workflow.v2';

describe('missingPostWorkflowV2', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sleep.mockResolvedValue(undefined);
    continueAsNew.mockResolvedValue(undefined);
  });

  it('scans, sleeps an hour, and continues as new', async () => {
    await missingPostWorkflowV2();

    expect(searchForMissingThreeHoursPosts).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith('1 hour');
    expect(continueAsNew).toHaveBeenCalledWith();
  });

  it('keeps the hourly cadence when the scan fails', async () => {
    searchForMissingThreeHoursPosts.mockRejectedValue(new Error('db down'));

    await missingPostWorkflowV2();

    expect(sleep).toHaveBeenCalledWith('1 hour');
    expect(continueAsNew).toHaveBeenCalledWith();
  });
});

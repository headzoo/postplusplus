const autoPost = jest.fn();
const sleep = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({ autoPost }),
  sleep,
}));

import { autoPostWorkflowV2 } from './autopost.workflow.v2';

describe('autoPostWorkflowV2', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sleep.mockRejectedValue(new Error('stop workflow'));
  });

  it('runs the first check immediately when requested', async () => {
    await expect(
      autoPostWorkflowV2({ id: 'feed', immediately: true })
    ).rejects.toThrow('stop workflow');

    expect(autoPost).toHaveBeenCalledWith('feed');
    expect(sleep).toHaveBeenCalledWith(3600000);
  });

  it('checks hourly after the immediate run', async () => {
    sleep
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('stop workflow'));

    await expect(
      autoPostWorkflowV2({ id: 'feed', immediately: true })
    ).rejects.toThrow('stop workflow');

    expect(autoPost).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 3600000);
    expect(sleep).toHaveBeenNthCalledWith(2, 3600000);
  });
});

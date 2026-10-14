const autoPost = jest.fn();
const sleep = jest.fn();
const continueAsNew = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({ autoPost }),
  sleep,
  continueAsNew,
}));

import { autoPostWorkflowV3 } from './autopost.workflow.v3';

describe('autoPostWorkflowV3', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sleep.mockResolvedValue(undefined);
    continueAsNew.mockResolvedValue(undefined);
  });

  it('checks once, sleeps an hour, and continues as new', async () => {
    await autoPostWorkflowV3({ id: 'feed', immediately: true });

    expect(autoPost).toHaveBeenCalledWith('feed');
    expect(sleep).toHaveBeenCalledWith(3600000);
    expect(continueAsNew).toHaveBeenCalledWith({
      id: 'feed',
      immediately: true,
    });
  });

  it('waits for the first hour when not run immediately', async () => {
    await autoPostWorkflowV3({ id: 'feed', immediately: false });

    expect(autoPost).not.toHaveBeenCalled();
    expect(sleep).toHaveBeenCalledWith(3600000);
    expect(continueAsNew).toHaveBeenCalledWith({
      id: 'feed',
      immediately: true,
    });
  });

  it('keeps the hourly cadence when the autopost fails', async () => {
    autoPost.mockRejectedValue(new Error('feed unavailable'));

    await autoPostWorkflowV3({ id: 'feed', immediately: true });

    expect(continueAsNew).toHaveBeenCalledWith({
      id: 'feed',
      immediately: true,
    });
  });
});

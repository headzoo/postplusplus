const claimDueJobs = jest.fn();
const evaluateClaimedJob = jest.fn();
const reclaimStaleJobs = jest.fn();
const cleanup = jest.fn();
const condition = jest.fn();
const continueAsNew = jest.fn();
const setHandler = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    claimDueJobs,
    evaluateClaimedJob,
    reclaimStaleJobs,
    cleanup,
  }),
  condition,
  continueAsNew,
  setHandler,
  defineSignal: (name: string) => name,
}));

import { conversionEvaluationWorkflowV1 } from './conversion-evaluation.workflow.v1';

describe('conversionEvaluationWorkflowV1', () => {
  let signalHandler: (() => void) | undefined;

  beforeEach(() => {
    jest.resetAllMocks();
    signalHandler = undefined;
    setHandler.mockImplementation((_signal, handler) => {
      signalHandler = handler;
    });
    reclaimStaleJobs.mockResolvedValue({ count: 0 });
    cleanup.mockResolvedValue({ completedJobs: 0, clickAttributions: 0 });
    claimDueJobs.mockResolvedValue([]);
    condition.mockResolvedValue(false);
    continueAsNew.mockResolvedValue(undefined);
  });

  it('waits on a short cadence or signal when no jobs are due', async () => {
    await conversionEvaluationWorkflowV1();

    expect(reclaimStaleJobs).toHaveBeenCalledWith({});
    expect(cleanup).toHaveBeenCalledWith({});
    expect(claimDueJobs).toHaveBeenCalledWith({ limit: 25 });
    expect(condition).toHaveBeenCalledWith(expect.any(Function), 30 * 1000);
    expect(continueAsNew).toHaveBeenCalledWith({});
  });

  it('resets to a fresh history after an idle signal', async () => {
    condition.mockImplementation(async (predicate: () => boolean) => {
      signalHandler?.();
      return predicate();
    });

    await conversionEvaluationWorkflowV1();

    expect(condition.mock.calls[0][0]()).toBe(true);
    expect(continueAsNew).toHaveBeenCalledWith({});
  });

  it('continues as new with only bounded claim identifiers', async () => {
    const claims = [
      { jobId: 'job-1', claimToken: 'token-1' },
      { jobId: 'job-2', claimToken: 'token-2' },
    ];
    claimDueJobs.mockResolvedValue(claims);

    await conversionEvaluationWorkflowV1();

    expect(continueAsNew).toHaveBeenCalledWith({ claims });
  });

  it('isolates one failed job and evaluates the rest of the batch', async () => {
    const claims = [
      { jobId: 'job-1', claimToken: 'token-1' },
      { jobId: 'job-2', claimToken: 'token-2' },
    ];
    evaluateClaimedJob
      .mockRejectedValueOnce(new Error('poison job'))
      .mockResolvedValueOnce({ status: 'complete' });

    await conversionEvaluationWorkflowV1({ claims });

    expect(evaluateClaimedJob).toHaveBeenCalledTimes(2);
    expect(evaluateClaimedJob).toHaveBeenNthCalledWith(2, claims[1]);
    expect(continueAsNew).toHaveBeenCalledWith({});
  });

  it('keeps discovery alive when maintenance or claiming is unavailable', async () => {
    reclaimStaleJobs.mockRejectedValue(new Error('database unavailable'));
    claimDueJobs.mockRejectedValue(new Error('database unavailable'));

    await expect(conversionEvaluationWorkflowV1()).resolves.toBeUndefined();
    expect(condition).toHaveBeenCalled();
    expect(continueAsNew).toHaveBeenCalledWith({});
  });
});

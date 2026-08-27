import { ConversionEvaluationActivity } from './conversion-evaluation.activity';

describe('ConversionEvaluationActivity', () => {
  let repository: {
    claimDueJobsBatch: jest.Mock;
    getClaimedJob: jest.Mock;
    reclaimStaleProcessingJobs: jest.Mock;
    cleanupCompletedJobs: jest.Mock;
    cleanupExpiredClickAttributions: jest.Mock;
  };
  let conversionService: { evaluateJob: jest.Mock };
  let activity: ConversionEvaluationActivity;

  beforeEach(() => {
    repository = {
      claimDueJobsBatch: jest.fn().mockResolvedValue([]),
      getClaimedJob: jest.fn(),
      reclaimStaleProcessingJobs: jest.fn().mockResolvedValue({ count: 1 }),
      cleanupCompletedJobs: jest.fn().mockResolvedValue({ count: 2 }),
      cleanupExpiredClickAttributions: jest
        .fn()
        .mockResolvedValue({ count: 3 }),
    };
    conversionService = { evaluateJob: jest.fn() };
    activity = new ConversionEvaluationActivity(
      repository as any,
      conversionService as any
    );
  });

  it('claims only the fixed maximum batch using a stale-claim lease', async () => {
    await activity.claimDueJobs({ limit: 1000 });

    expect(repository.claimDueJobsBatch).toHaveBeenCalledWith(
      25,
      expect.any(Date),
      5 * 60 * 1000
    );
  });

  it('evaluates an active claim using the database row', async () => {
    const claim = { jobId: 'job', claimToken: 'token' };
    const job = { id: 'job', claimToken: 'token' };
    repository.getClaimedJob.mockResolvedValue(job);
    conversionService.evaluateJob.mockResolvedValue({ status: 'complete' });

    await expect(activity.evaluateClaimedJob(claim)).resolves.toEqual({
      status: 'complete',
    });
    expect(conversionService.evaluateJob).toHaveBeenCalledWith(job);
  });

  it('makes a retried evaluation idempotent after the claim was settled', async () => {
    repository.getClaimedJob.mockResolvedValue(null);

    await expect(
      activity.evaluateClaimedJob({ jobId: 'job', claimToken: 'old-token' })
    ).resolves.toEqual({ status: 'settled' });
    expect(conversionService.evaluateJob).not.toHaveBeenCalled();
  });

  it('reclaims stale work and cleans durable maintenance rows', async () => {
    await activity.reclaimStaleJobs({});
    await expect(activity.cleanup({})).resolves.toEqual({
      completedJobs: 2,
      clickAttributions: 3,
    });

    expect(repository.reclaimStaleProcessingJobs).toHaveBeenCalledWith(
      expect.any(Date),
      5 * 60 * 1000
    );
    expect(repository.cleanupCompletedJobs).toHaveBeenCalledWith(
      expect.any(Date)
    );
    expect(repository.cleanupExpiredClickAttributions).toHaveBeenCalledWith(
      expect.any(Date)
    );
  });
});

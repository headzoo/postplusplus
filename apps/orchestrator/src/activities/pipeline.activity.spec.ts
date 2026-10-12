jest.mock('nestjs-temporal-core', () => ({
  Activity: () => () => undefined,
  ActivityMethod: () => () => undefined,
}));

import { PipelineActivity } from './pipeline.activity';

describe('PipelineActivity.discoverDuePipelineSlots', () => {
  it('skips logging for empty ticks and logs when candidates exist', async () => {
    const discoverDueSlots = jest
      .fn()
      .mockResolvedValueOnce({ candidates: [], next: undefined })
      .mockResolvedValueOnce({
        candidates: [{ pipelineId: 'p1' }],
        next: undefined,
      });
    const append = jest.fn().mockResolvedValue(undefined);
    const activity = new PipelineActivity(
      { discoverDueSlots } as any,
      { append } as any,
      { inAppNotificationOnce: jest.fn() } as any
    );

    await activity.discoverDuePipelineSlots({
      nowUtc: '2026-08-22T00:00:00.000Z',
      maximumCandidates: 100,
    });
    expect(append).not.toHaveBeenCalled();

    await activity.discoverDuePipelineSlots({
      nowUtc: '2026-08-22T00:00:30.000Z',
      maximumCandidates: 100,
    });
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'post-workflows',
        message: expect.stringContaining('1 due pipeline slot'),
      })
    );
  });

  it('logs errors when discovery fails', async () => {
    const discoverDueSlots = jest
      .fn()
      .mockRejectedValue(new Error('discovery failed'));
    const append = jest.fn().mockResolvedValue(undefined);
    const activity = new PipelineActivity(
      { discoverDueSlots } as any,
      { append } as any,
      { inAppNotificationOnce: jest.fn() } as any
    );

    await expect(
      activity.discoverDuePipelineSlots({
        nowUtc: '2026-08-22T00:00:00.000Z',
        maximumCandidates: 100,
      })
    ).rejects.toThrow('discovery failed');
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'post-workflows',
        level: 'ERROR',
      })
    );
  });
});

describe('PipelineActivity failure reporting', () => {
  const context = {
    executionId: 'execution-1',
    pipelineId: 'pipeline-1',
    pipelineName: 'Daily updates',
    organizationId: 'org-1',
    queueItemId: 'item-1',
    scheduledFor: '2026-10-09T23:00:00.000Z',
    postIds: ['post-1'],
    hasPostError: false,
  };

  it('notifies and logs when a slot fails before dispatch', async () => {
    const repository = {
      claimSlot: jest.fn().mockResolvedValue({
        outcome: 'FAILED',
        executionId: context.executionId,
        roots: [],
        reason: 'The channel is disabled',
      }),
      getFailureContext: jest.fn().mockResolvedValue(context),
    };
    const append = jest.fn().mockResolvedValue(undefined);
    const inAppNotificationOnce = jest.fn().mockResolvedValue(undefined);
    const activity = new PipelineActivity(
      repository as any,
      { append } as any,
      { inAppNotificationOnce } as any
    );

    await activity.claimPipelineSlot({
      pipelineId: context.pipelineId,
      scheduleRevision: 1,
      scheduledFor: context.scheduledFor,
      nowUtc: context.scheduledFor,
    });

    expect(inAppNotificationOnce).toHaveBeenCalledWith(
      context.organizationId,
      `pipeline-publish-failure:${context.executionId}`,
      expect.stringContaining('The channel is disabled')
    );
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        message: 'Pipeline publish failed during claim',
      })
    );
  });

  it('records and reports a child workflow dispatch failure', async () => {
    const repository = {
      recordDispatchFailureV1: jest.fn().mockResolvedValue(context),
    };
    const append = jest.fn().mockResolvedValue(undefined);
    const inAppNotificationOnce = jest.fn().mockResolvedValue(undefined);
    const activity = new PipelineActivity(
      repository as any,
      { append } as any,
      { inAppNotificationOnce } as any
    );

    await activity.recordPipelineSlotDispatchFailureV1({
      executionId: context.executionId,
      postId: 'post-1',
      reason: 'Workflow already started',
    });

    expect(repository.recordDispatchFailureV1).toHaveBeenCalledWith({
      executionId: context.executionId,
      postId: 'post-1',
      reason: 'Workflow already started',
    });
    expect(inAppNotificationOnce).toHaveBeenCalledWith(
      context.organizationId,
      `pipeline-publish-failure:${context.executionId}`,
      expect.stringContaining('Workflow already started')
    );
  });

  it('notifies when publishing fails after the post is already marked failed', async () => {
    const repository = {
      finalizeSlot: jest.fn().mockResolvedValue({
        outcome: 'FAILED',
        reason: 'X rejected the post',
      }),
      getFailureContext: jest
        .fn()
        .mockResolvedValue({ ...context, hasPostError: true }),
    };
    const append = jest.fn().mockResolvedValue(undefined);
    const inAppNotificationOnce = jest.fn().mockResolvedValue(undefined);
    const activity = new PipelineActivity(
      repository as any,
      { append } as any,
      { inAppNotificationOnce } as any
    );

    await activity.finalizePipelineSlot({
      executionId: context.executionId,
    });

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        message: 'Pipeline publish failed during finalize',
      })
    );
    expect(inAppNotificationOnce).toHaveBeenCalledWith(
      context.organizationId,
      `pipeline-publish-failure:${context.executionId}`,
      expect.stringContaining('X rejected the post')
    );
  });

  it('notifies when a due slot is abandoned and the post stays queued', async () => {
    const repository = {
      claimSlot: jest.fn().mockResolvedValue({
        outcome: 'SKIPPED',
        roots: [],
        reason: 'MISSED',
        organizationId: context.organizationId,
        pipelineName: context.pipelineName,
      }),
    };
    const append = jest.fn().mockResolvedValue(undefined);
    const inAppNotificationOnce = jest.fn().mockResolvedValue(undefined);
    const activity = new PipelineActivity(
      repository as any,
      { append } as any,
      { inAppNotificationOnce } as any
    );

    await activity.claimPipelineSlot({
      pipelineId: context.pipelineId,
      scheduleRevision: 1,
      scheduledFor: context.scheduledFor,
      nowUtc: context.scheduledFor,
    });

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        message: 'Pipeline slot skipped: MISSED',
      })
    );
    expect(inAppNotificationOnce).toHaveBeenCalledWith(
      context.organizationId,
      `pipeline-slot-skipped:${context.pipelineId}:${context.scheduledFor}:MISSED`,
      expect.stringContaining('still in the Pipeline queue')
    );
  });
});

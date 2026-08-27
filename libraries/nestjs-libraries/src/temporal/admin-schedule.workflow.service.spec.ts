import { AdminScheduleWorkflowService } from './admin-schedule.workflow.service';

describe('AdminScheduleWorkflowService', () => {
  const createService = (
    workflow: {
      getHandle: jest.Mock;
      start: jest.Mock;
    },
    autopostRepository: { countActiveAutoposts: jest.Mock },
    adminScheduleLogService: { append: jest.Mock } = {
      append: jest.fn().mockResolvedValue(undefined),
    }
  ) =>
    new AdminScheduleWorkflowService(
      {
        client: { getRawClient: () => ({ workflow }) },
      } as any,
      autopostRepository as any,
      adminScheduleLogService as any
    );

  it('describes the missing post recovery workflow', async () => {
    const describe = jest.fn().mockResolvedValue({
      status: { name: 'RUNNING' },
      startTime: new Date('2026-08-21T00:00:00.000Z'),
    });
    const service = createService(
      {
        getHandle: jest.fn().mockReturnValue({ describe }),
        start: jest.fn(),
      },
      { countActiveAutoposts: jest.fn() }
    );

    const status = await service.getMissingPostRecoveryStatus();
    expect(status.workflowId).toBe('missing-post-workflow');
    expect(status.exists).toBe(true);
    expect(status.status).toBe('RUNNING');
    expect(status.cadence.interval).toBe(1);
  });

  it('starts a one-shot missing post recovery workflow', async () => {
    const describe = jest.fn().mockResolvedValue({
      status: { name: 'RUNNING' },
      startTime: new Date('2026-08-21T00:00:00.000Z'),
    });
    const start = jest.fn().mockResolvedValue(undefined);
    const append = jest.fn().mockResolvedValue(undefined);
    const service = createService(
      {
        getHandle: jest.fn().mockReturnValue({ describe }),
        start,
      },
      { countActiveAutoposts: jest.fn() },
      { append }
    );

    await service.triggerMissingPostRecovery();
    expect(start).toHaveBeenCalledWith(
      'missingPostRecoveryWorkflowV1',
      expect.objectContaining({
        taskQueue: 'main',
      })
    );
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'missing-post-recovery',
      })
    );
  });

  it('starts a one-shot pipeline scheduler tick', async () => {
    const describe = jest.fn().mockResolvedValue({
      status: { name: 'RUNNING' },
      startTime: new Date('2026-08-21T00:00:00.000Z'),
    });
    const start = jest.fn().mockResolvedValue(undefined);
    const service = createService(
      {
        getHandle: jest.fn().mockReturnValue({ describe }),
        start,
      },
      { countActiveAutoposts: jest.fn() }
    );

    await service.triggerPostWorkflowTick();
    expect(start).toHaveBeenCalledWith(
      'pipelineSchedulerTickWorkflowV1',
      expect.objectContaining({
        taskQueue: 'main',
      })
    );
  });

  it('returns active autopost counts and can force-run them', async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    const service = createService(
      {
        getHandle: jest.fn(),
        start,
      },
      { countActiveAutoposts: jest.fn().mockResolvedValue(4) }
    );

    const status = await service.getAutopostWorkflowStatus();
    expect(status.activeCount).toBe(4);
    expect(status.exists).toBe(true);

    await service.triggerAutopostWorkflows();
    expect(start).toHaveBeenCalledWith(
      'autopostAdminTriggerWorkflowV1',
      expect.objectContaining({
        taskQueue: 'main',
      })
    );
  });

  it('describes the lead bridge workflow', async () => {
    const describe = jest.fn().mockResolvedValue({
      status: { name: 'RUNNING' },
      startTime: new Date('2026-08-21T00:00:00.000Z'),
    });
    const service = createService(
      {
        getHandle: jest.fn().mockReturnValue({ describe }),
        start: jest.fn(),
      },
      { countActiveAutoposts: jest.fn() }
    );

    const status = await service.getLeadBridgeStatus();
    expect(status.workflowId).toBe('channel-lead-bridge-workflow-v1');
    expect(status.exists).toBe(true);
    expect(status.status).toBe('RUNNING');
    expect(status.cadence.label).toContain('warm crawls');
  });

  it('terminates the idle lead bridge workflow and starts an admin burst', async () => {
    const describe = jest.fn().mockResolvedValue({
      status: { name: 'RUNNING' },
      startTime: new Date('2026-08-21T00:00:00.000Z'),
    });
    const terminate = jest.fn().mockResolvedValue(undefined);
    const start = jest.fn().mockResolvedValue(undefined);
    const append = jest.fn().mockResolvedValue(undefined);
    const service = createService(
      {
        getHandle: jest.fn().mockReturnValue({ describe, terminate }),
        start,
      },
      { countActiveAutoposts: jest.fn() },
      { append }
    );

    await service.triggerLeadBridge();
    expect(terminate).toHaveBeenCalledWith(
      'Admin lead discovery burst trigger'
    );
    expect(start).toHaveBeenCalledWith(
      'channelLeadBridgeAdminTriggerWorkflowV1',
      expect.objectContaining({
        taskQueue: 'main',
        args: [{}],
      })
    );
    expect(String(start.mock.calls[0][1].workflowId)).toContain(
      'channel-lead-bridge-admin-trigger-v1-'
    );
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'lead-bridge',
        message: expect.stringContaining('burst triggered'),
      })
    );
  });

  it('starts an admin burst when the idle workflow is missing', async () => {
    const describe = jest.fn().mockRejectedValue({
      name: 'WorkflowNotFoundError',
      message: 'not found',
    });
    const start = jest.fn().mockResolvedValue(undefined);
    const service = createService(
      {
        getHandle: jest.fn().mockReturnValue({ describe }),
        start,
      },
      { countActiveAutoposts: jest.fn() }
    );

    await service.triggerLeadBridge();
    expect(start).toHaveBeenCalledWith(
      'channelLeadBridgeAdminTriggerWorkflowV1',
      expect.objectContaining({
        taskQueue: 'main',
      })
    );
  });
});

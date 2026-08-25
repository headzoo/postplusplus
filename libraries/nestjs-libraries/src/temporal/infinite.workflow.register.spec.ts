import { InfiniteWorkflowRegister } from './infinite.workflow.register';

describe('InfiniteWorkflowRegister', () => {
  const previousRunCron = process.env.RUN_CRON;

  const createRegister = (
    workflow: {
      getHandle: jest.Mock;
      start: jest.Mock;
    },
    relationshipGradeScheduleService = {
      install: jest.fn().mockResolvedValue(undefined),
    },
    followerBotScoreScheduleService = {
      install: jest.fn().mockResolvedValue(undefined),
    },
    hotMaterializationScheduleService = {
      install: jest.fn().mockResolvedValue(undefined),
    },
    cultivateMaterializationScheduleService = {
      install: jest.fn().mockResolvedValue(undefined),
    }
  ) =>
    new InfiniteWorkflowRegister(
      {
        client: { getRawClient: () => ({ workflow }) },
      } as any,
      relationshipGradeScheduleService as any,
      followerBotScoreScheduleService as any,
      hotMaterializationScheduleService as any,
      cultivateMaterializationScheduleService as any
    );

  const steadyStateWorkflow = () => ({
    getHandle: jest.fn().mockReturnValue({
      describe: jest.fn().mockRejectedValue(
        Object.assign(new Error('workflow not found'), {
          name: 'WorkflowNotFoundError',
        })
      ),
      signal: jest.fn().mockResolvedValue(undefined),
    }),
    start: jest.fn().mockResolvedValue(undefined),
  });

  afterEach(() => {
    if (previousRunCron === undefined) {
      delete process.env.RUN_CRON;
    } else {
      process.env.RUN_CRON = previousRunCron;
    }
  });

  it('installs Temporal schedules when cron execution is enabled', async () => {
    const workflow = steadyStateWorkflow();
    const relationshipGradeScheduleService = {
      install: jest.fn().mockResolvedValue(undefined),
    };
    const followerBotScoreScheduleService = {
      install: jest.fn().mockResolvedValue(undefined),
    };
    const hotMaterializationScheduleService = {
      install: jest.fn().mockResolvedValue(undefined),
    };
    const cultivateMaterializationScheduleService = {
      install: jest.fn().mockResolvedValue(undefined),
    };
    const register = createRegister(
      workflow,
      relationshipGradeScheduleService,
      followerBotScoreScheduleService,
      hotMaterializationScheduleService,
      cultivateMaterializationScheduleService
    );
    process.env.RUN_CRON = '1';

    await register.onModuleInit();

    expect(relationshipGradeScheduleService.install).toHaveBeenCalled();
    expect(followerBotScoreScheduleService.install).toHaveBeenCalled();
    expect(hotMaterializationScheduleService.install).toHaveBeenCalled();
    expect(cultivateMaterializationScheduleService.install).toHaveBeenCalled();
    expect(workflow.start).not.toHaveBeenCalledWith(
      'channelCultivateWorkflowV1',
      expect.anything()
    );
    expect(workflow.start).toHaveBeenCalledWith(
      'channelInteractionMaintenanceWorkflowV2',
      expect.objectContaining({
        workflowId: 'channel-interaction-maintenance-workflow-v2',
        taskQueue: 'main',
        args: [{}],
      })
    );
    expect(workflow.start).toHaveBeenCalledWith(
      'channelAnalyticsSnapshotWorkflowV2',
      expect.objectContaining({
        workflowId: 'channel-analytics-snapshot-workflow-v2',
        taskQueue: 'main',
        args: [{}],
      })
    );
    expect(workflow.start).toHaveBeenCalledWith(
      'channelLeadBridgeWorkflowV1',
      expect.objectContaining({
        workflowId: 'channel-lead-bridge-workflow-v1',
        taskQueue: 'main',
        args: [{}],
      })
    );
    expect(workflow.getHandle).toHaveBeenCalledWith(
      'channel-analytics-snapshot-workflow-v2'
    );
    expect(workflow.getHandle).toHaveBeenCalledWith(
      'channel-lead-bridge-workflow-v1'
    );
    expect(workflow.getHandle().signal).toHaveBeenCalledWith(
      'channelAnalyticsSnapshot'
    );
    expect(workflow.getHandle().signal).toHaveBeenCalledWith(
      'channelLeadBridge'
    );
  });

  it('treats an already-started analytics workflow as steady state', async () => {
    const workflow = steadyStateWorkflow();
    workflow.start.mockImplementation(async (type: string) => {
      if (type === 'channelAnalyticsSnapshotWorkflowV2') {
        throw Object.assign(new Error('workflow already started'), {
          name: 'WorkflowExecutionAlreadyStartedError',
        });
      }
    });
    const register = createRegister(workflow);
    process.env.RUN_CRON = '1';

    await expect(register.onModuleInit()).resolves.toBeUndefined();
    expect(workflow.start).toHaveBeenCalledWith(
      'channelLeadBridgeWorkflowV1',
      expect.objectContaining({
        workflowId: 'channel-lead-bridge-workflow-v1',
      })
    );
    expect(workflow.start).not.toHaveBeenCalledWith(
      'channelCultivateWorkflowV1',
      expect.anything()
    );
    expect(workflow.start).toHaveBeenCalledWith(
      'channelAnalyticsSnapshotWorkflowV2',
      expect.objectContaining({
        workflowId: 'channel-analytics-snapshot-workflow-v2',
      })
    );
  });

  it('does not start maintenance workflows when cron execution is disabled', async () => {
    const workflow = steadyStateWorkflow();
    const hotMaterializationScheduleService = {
      install: jest.fn().mockResolvedValue(undefined),
    };
    const register = createRegister(
      workflow,
      undefined,
      undefined,
      hotMaterializationScheduleService
    );
    delete process.env.RUN_CRON;

    await register.onModuleInit();

    expect(workflow.start).not.toHaveBeenCalled();
    expect(hotMaterializationScheduleService.install).not.toHaveBeenCalled();
  });
});

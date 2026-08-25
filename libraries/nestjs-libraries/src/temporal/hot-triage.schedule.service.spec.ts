import { ScheduleOverlapPolicy } from '@temporalio/client';
import { HotMaterializationScheduleService } from './hot-triage.schedule.service';
import {
  DEFAULT_HOT_MATERIALIZATION_SCHEDULE,
  HOT_MATERIALIZATION_SCHEDULE_ID,
  HOT_MATERIALIZATION_WORKFLOW_ID,
  HOT_MATERIALIZATION_WORKFLOW_TYPE,
} from './hot-triage.schedule';

describe('HotMaterializationScheduleService', () => {
  const createService = (schedule: {
    create: jest.Mock;
    getHandle: jest.Mock;
  }) =>
    new HotMaterializationScheduleService({
      client: { getRawClient: () => ({ schedule }) },
    } as any);

  it('creates an hourly schedule with overlap skipped when none exists', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const describe = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('not found'), { name: 'ScheduleNotFoundError' })
      )
      .mockResolvedValue({
        state: { paused: false },
        memo: { cadence: DEFAULT_HOT_MATERIALIZATION_SCHEDULE },
        info: { nextActionTimes: [new Date('2026-08-25T14:00:00.000Z')] },
      });
    const schedule = {
      create,
      getHandle: jest.fn().mockReturnValue({ describe }),
    };
    const service = createService(schedule);

    await service.install();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: HOT_MATERIALIZATION_SCHEDULE_ID,
        spec: {
          intervals: [{ every: 60 * 60 * 1000 }],
        },
        action: expect.objectContaining({
          type: 'startWorkflow',
          workflowType: HOT_MATERIALIZATION_WORKFLOW_TYPE,
          workflowId: HOT_MATERIALIZATION_WORKFLOW_ID,
          taskQueue: 'main',
          args: [{}],
        }),
        policies: {
          overlap: ScheduleOverlapPolicy.SKIP,
        },
      })
    );
  });

  it('does not recreate an existing schedule', async () => {
    const create = jest.fn();
    const describe = jest.fn().mockResolvedValue({
      state: { paused: false },
      memo: { cadence: DEFAULT_HOT_MATERIALIZATION_SCHEDULE },
      info: { nextActionTimes: [] },
    });
    const schedule = {
      create,
      getHandle: jest.fn().mockReturnValue({ describe }),
    };
    const service = createService(schedule);

    await service.install();

    expect(create).not.toHaveBeenCalled();
  });

  it('treats an already-running schedule create as steady state', async () => {
    const create = jest.fn().mockRejectedValue(
      Object.assign(new Error('already running'), {
        name: 'ScheduleAlreadyRunning',
      })
    );
    const describe = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('not found'), { name: 'ScheduleNotFoundError' })
      );
    const schedule = {
      create,
      getHandle: jest.fn().mockReturnValue({ describe }),
    };
    const service = createService(schedule);

    await expect(service.install()).resolves.toBeUndefined();
  });
});

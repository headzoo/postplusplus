import { ScheduleOverlapPolicy } from '@temporalio/client';
import { CultivateMaterializationScheduleService } from './cultivate.schedule.service';
import {
  CULTIVATE_MATERIALIZATION_SCHEDULE_ID,
  CULTIVATE_MATERIALIZATION_WORKFLOW_ID,
  CULTIVATE_MATERIALIZATION_WORKFLOW_TYPE,
  DEFAULT_CULTIVATE_MATERIALIZATION_SCHEDULE,
} from './cultivate.schedule';

describe('CultivateMaterializationScheduleService', () => {
  const createService = (
    schedule: {
      create: jest.Mock;
      getHandle: jest.Mock;
    },
    workflow: {
      getHandle: jest.Mock;
    } = {
      getHandle: jest.fn().mockReturnValue({
        describe: jest.fn().mockRejectedValue(
          Object.assign(new Error('not found'), {
            name: 'WorkflowNotFoundError',
          })
        ),
      }),
    }
  ) =>
    new CultivateMaterializationScheduleService(
      {
        client: { getRawClient: () => ({ schedule, workflow }) },
      } as any,
      { append: jest.fn() } as any
    );

  it('creates an hourly schedule with overlap skipped when none exists', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const describe = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('not found'), { name: 'ScheduleNotFoundError' })
      )
      .mockResolvedValue({
        state: { paused: false },
        memo: { cadence: DEFAULT_CULTIVATE_MATERIALIZATION_SCHEDULE },
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
        scheduleId: CULTIVATE_MATERIALIZATION_SCHEDULE_ID,
        spec: {
          intervals: [{ every: 60 * 60 * 1000 }],
        },
        action: expect.objectContaining({
          type: 'startWorkflow',
          workflowType: CULTIVATE_MATERIALIZATION_WORKFLOW_TYPE,
          workflowId: CULTIVATE_MATERIALIZATION_WORKFLOW_ID,
          taskQueue: 'main',
          args: [{}],
        }),
        policies: {
          overlap: ScheduleOverlapPolicy.SKIP,
        },
      })
    );
  });
});

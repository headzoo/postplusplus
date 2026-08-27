import { RelationshipGradeScheduleService } from './relationship-grade.schedule.service';
import { DEFAULT_RELATIONSHIP_GRADE_SCHEDULE } from './relationship-grade.schedule';

describe('RelationshipGradeScheduleService', () => {
  const createService = (
    schedule: {
      create: jest.Mock;
      getHandle: jest.Mock;
    },
    workflow: {
      getHandle: jest.Mock;
    }
  ) =>
    new RelationshipGradeScheduleService(
      {
        client: { getRawClient: () => ({ schedule, workflow }) },
      } as any,
      { append: jest.fn().mockResolvedValue(undefined) } as any
    );

  it('creates a default schedule when none exists', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const describe = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('not found'), { name: 'ScheduleNotFoundError' })
      )
      .mockResolvedValue({
        state: { paused: false },
        action: { args: [{ cadence: DEFAULT_RELATIONSHIP_GRADE_SCHEDULE }] },
        info: { nextActionTimes: [new Date('2026-08-22T00:00:00.000Z')] },
      });
    const update = jest.fn();
    const trigger = jest.fn();
    const schedule = {
      create,
      getHandle: jest.fn().mockReturnValue({ describe, update, trigger }),
    };
    const workflow = {
      getHandle: jest.fn().mockReturnValue({
        describe: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('not found'), {
              name: 'WorkflowNotFoundError',
            })
          ),
      }),
    };
    const service = createService(schedule, workflow);

    await service.install();
    const status = await service.getStatus();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 'channel-relationship-grade-schedule-v1',
        action: expect.objectContaining({
          type: 'startWorkflow',
          workflowType: 'channelRelationshipGradeWorkflowV2',
        }),
      })
    );
    expect(status.exists).toBe(true);
    expect(status.cadence).toEqual(DEFAULT_RELATIONSHIP_GRADE_SCHEDULE);
    expect(status.nextRunTimes).toEqual(['2026-08-22T00:00:00.000Z']);
  });

  it('updates an existing schedule cadence', async () => {
    const cadence = { unit: 'hour' as const, interval: 1 };
    const describe = jest.fn().mockResolvedValue({
      state: { paused: false },
      policies: { catchupWindow: 60000, pauseOnFailure: false },
      action: { args: [{ cadence }] },
      info: { nextActionTimes: [] },
    });
    const update = jest.fn().mockImplementation(async (updater) => {
      updater({
        state: { paused: false },
        policies: { catchupWindow: 60000, pauseOnFailure: false },
      });
    });
    const schedule = {
      create: jest.fn(),
      getHandle: jest.fn().mockReturnValue({
        describe,
        update,
        trigger: jest.fn(),
      }),
    };
    const service = createService(schedule, {
      getHandle: jest.fn(),
    });

    await service.update(cadence);
    expect(update).toHaveBeenCalled();
    expect(schedule.create).not.toHaveBeenCalled();
  });
});

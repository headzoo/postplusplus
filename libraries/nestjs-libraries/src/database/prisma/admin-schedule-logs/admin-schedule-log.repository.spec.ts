import { AdminScheduleLogKey, AdminScheduleLogLevel } from '@prisma/client';
import {
  ADMIN_SCHEDULE_LOG_KEEP,
  AdminScheduleLogRepository,
} from './admin-schedule-log.repository';

const repository = (adminScheduleLog: Record<string, jest.Mock>) =>
  new AdminScheduleLogRepository({
    model: { adminScheduleLog },
  } as any);

describe('AdminScheduleLogRepository', () => {
  it('creates and lists logs by schedule key', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'log-1' });
    const findMany = jest.fn().mockResolvedValue([{ id: 'log-1' }]);
    const logs = repository({ create, findMany });

    await logs.create({
      scheduleKey: AdminScheduleLogKey.LEAD_BRIDGE,
      level: AdminScheduleLogLevel.INFO,
      message: 'hello',
      meta: '{}',
    });
    const listed = await logs.listByKey(AdminScheduleLogKey.LEAD_BRIDGE, 50);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scheduleKey: AdminScheduleLogKey.LEAD_BRIDGE,
        message: 'hello',
      }),
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scheduleKey: AdminScheduleLogKey.LEAD_BRIDGE },
        take: 50,
        orderBy: { createdAt: 'desc' },
      })
    );
    expect(listed.items).toEqual([{ id: 'log-1' }]);
  });

  it('prunes older rows beyond the keep limit', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const logs = repository({ findMany, deleteMany });

    const deleted = await logs.pruneByKey(
      AdminScheduleLogKey.POST_WORKFLOWS,
      ADMIN_SCHEDULE_LOG_KEEP
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scheduleKey: AdminScheduleLogKey.POST_WORKFLOWS },
        skip: ADMIN_SCHEDULE_LOG_KEEP,
        select: { id: true },
      })
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1', 'old-2'] } },
    });
    expect(deleted).toBe(2);
  });
});

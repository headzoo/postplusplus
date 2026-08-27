import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { AdminScheduleLogKey, AdminScheduleLogLevel } from '@prisma/client';

export const ADMIN_SCHEDULE_LOG_KEEP = 500;

export type CreateAdminScheduleLogInput = {
  scheduleKey: AdminScheduleLogKey;
  level: AdminScheduleLogLevel;
  message: string;
  meta: string;
};

@Injectable()
export class AdminScheduleLogRepository {
  constructor(
    private _adminScheduleLog: PrismaRepository<'adminScheduleLog'>
  ) {}

  create(data: CreateAdminScheduleLogInput) {
    return this._adminScheduleLog.model.adminScheduleLog.create({ data });
  }

  async listByKey(scheduleKey: AdminScheduleLogKey, limit = 100) {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const items = await this._adminScheduleLog.model.adminScheduleLog.findMany({
      where: { scheduleKey },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });
    return {
      items,
      limit: safeLimit,
    };
  }

  async pruneByKey(
    scheduleKey: AdminScheduleLogKey,
    keep = ADMIN_SCHEDULE_LOG_KEEP
  ) {
    const safeKeep = Math.max(1, keep);
    const overflow =
      await this._adminScheduleLog.model.adminScheduleLog.findMany({
        where: { scheduleKey },
        orderBy: { createdAt: 'desc' },
        skip: safeKeep,
        select: { id: true },
      });
    if (!overflow.length) {
      return 0;
    }
    const result =
      await this._adminScheduleLog.model.adminScheduleLog.deleteMany({
        where: {
          id: { in: overflow.map((row) => row.id) },
        },
      });
    return result.count;
  }
}

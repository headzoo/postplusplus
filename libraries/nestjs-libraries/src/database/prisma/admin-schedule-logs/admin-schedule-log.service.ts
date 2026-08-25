import { Injectable } from '@nestjs/common';
import {
  AdminScheduleLogKey,
  AdminScheduleLogLevel,
} from '@prisma/client';
import {
  AdminScheduleLogRepository,
} from './admin-schedule-log.repository';
import {
  AdminScheduleLogSlug,
  adminScheduleLogKeyFromSlug,
} from './admin-schedule-log.keys';

export const MAX_ADMIN_SCHEDULE_LOG_MESSAGE = 2000;
export const MAX_ADMIN_SCHEDULE_LOG_META = 16 * 1024;

export type AppendAdminScheduleLogInput = {
  scheduleKey: AdminScheduleLogKey | AdminScheduleLogSlug;
  level?: AdminScheduleLogLevel | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  meta?: unknown;
};

@Injectable()
export class AdminScheduleLogService {
  constructor(private _repository: AdminScheduleLogRepository) { }

  async append(input: AppendAdminScheduleLogInput) {
    try {
      const scheduleKey = this.resolveKey(input.scheduleKey);
      const level = this.resolveLevel(input.level);
      const message = this.capMessage(input.message);
      const meta = this.serializeMeta(input.meta);
      const row = await this._repository.create({
        scheduleKey,
        level,
        message,
        meta,
      });
      void this._repository.pruneByKey(scheduleKey).catch(() => {
        /** prune must never break logging */
      });
      return row;
    } catch {
      /** logging must never break schedules or activities */
      return undefined;
    }
  }

  list(scheduleKey: AdminScheduleLogKey | AdminScheduleLogSlug, limit = 100) {
    return this._repository.listByKey(this.resolveKey(scheduleKey), limit);
  }

  private resolveKey(
    value: AdminScheduleLogKey | AdminScheduleLogSlug
  ): AdminScheduleLogKey {
    if (
      value === 'relationship-grades' ||
      value === 'follower-bot-scores' ||
      value === 'hot-triage' ||
      value === 'follower-cultivate' ||
      value === 'lead-bridge' ||
      value === 'missing-post-recovery' ||
      value === 'post-workflows' ||
      value === 'autopost-workflows'
    ) {
      return adminScheduleLogKeyFromSlug(value);
    }
    return value;
  }

  private resolveLevel(
    value?: AdminScheduleLogLevel | 'INFO' | 'WARN' | 'ERROR'
  ): AdminScheduleLogLevel {
    if (value === 'WARN') {
      return AdminScheduleLogLevel.WARN;
    }
    if (value === 'ERROR') {
      return AdminScheduleLogLevel.ERROR;
    }
    return AdminScheduleLogLevel.INFO;
  }

  private capMessage(value: string) {
    const trimmed = String(value || '').trim() || '(empty)';
    return trimmed.length <= MAX_ADMIN_SCHEDULE_LOG_MESSAGE
      ? trimmed
      : trimmed.slice(0, MAX_ADMIN_SCHEDULE_LOG_MESSAGE);
  }

  private serializeMeta(meta: unknown) {
    if (meta === undefined || meta === null) {
      return '{}';
    }
    try {
      const serialized =
        typeof meta === 'string' ? meta : JSON.stringify(meta);
      return serialized.length <= MAX_ADMIN_SCHEDULE_LOG_META
        ? serialized
        : serialized.slice(0, MAX_ADMIN_SCHEDULE_LOG_META);
    } catch {
      return '{}';
    }
  }
}

import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ApplicationFailure, Context } from '@temporalio/activity';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';

const AUTOPOST_MAX_ATTEMPTS = 3;

const isNonRetryableAutopostError = (error: unknown) => {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    return status >= 400 && status < 500;
  }
  return error instanceof ApplicationFailure && error.nonRetryable;
};

const isFinalAutopostAttempt = (attempt?: number) => {
  const currentAttempt = attempt ?? readAutopostAttempt();
  return currentAttempt >= AUTOPOST_MAX_ATTEMPTS;
};

const readAutopostAttempt = () => {
  try {
    return Context.current().info.attempt;
  } catch {
    return AUTOPOST_MAX_ATTEMPTS;
  }
};

@Injectable()
@Activity()
export class AutopostActivity {
  private readonly _logger = new Logger(AutopostActivity.name);

  constructor(
    private _autoPostService: AutopostService,
    private _adminScheduleLogService: AdminScheduleLogService
  ) {}

  @ActivityMethod()
  async autoPost(id: string) {
    try {
      return await this._autoPostService.startAutopost(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nonRetryable = isNonRetryableAutopostError(error);
      const finalAttempt = isFinalAutopostAttempt();
      this._logger.error(`Autopost failed for config ${id}: ${message}`);
      await this._adminScheduleLogService.append({
        scheduleKey: 'autopost-workflows',
        level: 'ERROR',
        message: `Autopost failed for config ${id}: ${message}`,
        meta: {
          autopostId: id,
          error: message,
          nonRetryable,
          finalAttempt,
        },
      });
      if (nonRetryable || finalAttempt) {
        await this._autoPostService
          .notifyAutopostFailure(id, message)
          .catch(() => undefined);
      }
      if (nonRetryable) {
        throw new ApplicationFailure(message, 'AutopostFailed', true);
      }
      throw error;
    }
  }

  @ActivityMethod()
  async listActiveAutopostIdsForAdmin(
    request: { after?: string; take?: number } = {}
  ) {
    const page = await this._autoPostService.listActiveAutopostIds(
      request.after,
      request.take ?? 50
    );
    await this._adminScheduleLogService.append({
      scheduleKey: 'autopost-workflows',
      message: `Admin trigger listed ${page.ids.length} active autopost(s)`,
      meta: {
        after: request.after ?? null,
        count: page.ids.length,
        hasMore: !!page.next,
      },
    });
    return page;
  }
}

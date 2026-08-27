import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';

@Injectable()
@Activity()
export class AutopostActivity {
  constructor(
    private _autoPostService: AutopostService,
    private _adminScheduleLogService: AdminScheduleLogService
  ) {}

  @ActivityMethod()
  async autoPost(id: string) {
    try {
      return await this._autoPostService.startAutopost(id);
    } catch (error) {
      await this._adminScheduleLogService.append({
        scheduleKey: 'autopost-workflows',
        level: 'ERROR',
        message: `Autopost failed for config ${id}`,
        meta: {
          autopostId: id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
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

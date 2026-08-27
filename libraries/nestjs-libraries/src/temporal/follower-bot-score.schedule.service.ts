import { Injectable, Logger } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { ScheduleOverlapPolicy } from '@temporalio/client';
import {
  DEFAULT_FOLLOWER_BOT_SCORE_SCHEDULE,
  FOLLOWER_BOT_SCORE_SCHEDULE_ID,
  FOLLOWER_BOT_SCORE_WORKFLOW_ID,
  FOLLOWER_BOT_SCORE_WORKFLOW_TYPE,
  FollowerBotScoreScheduleConfig,
  normalizeFollowerBotScoreSchedule,
  toFollowerBotScoreScheduleSpec,
} from './follower-bot-score.schedule';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';

export type FollowerBotScoreScheduleStatus = {
  scheduleId: string;
  exists: boolean;
  paused: boolean;
  cadence: FollowerBotScoreScheduleConfig;
  nextRunTimes: string[];
  note?: string;
};

@Injectable()
export class FollowerBotScoreScheduleService {
  private readonly _logger = new Logger(FollowerBotScoreScheduleService.name);

  constructor(
    private _temporalService: TemporalService,
    private _adminScheduleLogService: AdminScheduleLogService
  ) {}

  async install() {
    try {
      await this.describe();
    } catch (error) {
      if (!this.isMissing(error)) {
        throw error;
      }
      await this.create(DEFAULT_FOLLOWER_BOT_SCORE_SCHEDULE);
    }
  }

  async getStatus(): Promise<FollowerBotScoreScheduleStatus> {
    try {
      return this.mapStatus(await this.describe(), true);
    } catch (error) {
      if (!this.isMissing(error)) {
        throw error;
      }
      return {
        scheduleId: FOLLOWER_BOT_SCORE_SCHEDULE_ID,
        exists: false,
        paused: false,
        cadence: DEFAULT_FOLLOWER_BOT_SCORE_SCHEDULE,
        nextRunTimes: [],
      };
    }
  }

  async update(cadence: FollowerBotScoreScheduleConfig) {
    const config = normalizeFollowerBotScoreSchedule(cadence);
    try {
      await this.getHandle().update((previous) => ({
        spec: toFollowerBotScoreScheduleSpec(config),
        action: {
          type: 'startWorkflow',
          workflowType: FOLLOWER_BOT_SCORE_WORKFLOW_TYPE,
          taskQueue: 'main',
          workflowId: FOLLOWER_BOT_SCORE_WORKFLOW_ID,
          args: [{}],
        },
        policies: {
          overlap: ScheduleOverlapPolicy.SKIP,
          catchupWindow: previous.policies.catchupWindow,
          pauseOnFailure: previous.policies.pauseOnFailure,
        },
        state: {
          paused: previous.state.paused,
          note: previous.state.note,
          remainingActions: previous.state.remainingActions,
        },
        memo: { cadence: config },
      }));
    } catch (error) {
      if (!this.isMissing(error)) {
        await this._adminScheduleLogService.append({
          scheduleKey: 'follower-bot-scores',
          level: 'ERROR',
          message: 'Failed to update follower bot score schedule',
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
      await this.create(config);
    }
    await this._adminScheduleLogService.append({
      scheduleKey: 'follower-bot-scores',
      message: 'Follower bot score schedule updated',
      meta: { cadence: config },
    });
    return this.getStatus();
  }

  async trigger() {
    try {
      await this.getHandle().trigger(ScheduleOverlapPolicy.SKIP);
    } catch (error) {
      if (!this.isMissing(error)) {
        await this._adminScheduleLogService.append({
          scheduleKey: 'follower-bot-scores',
          level: 'ERROR',
          message: 'Failed to trigger follower bot score schedule',
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
      await this.create(DEFAULT_FOLLOWER_BOT_SCORE_SCHEDULE);
      await this.getHandle().trigger(ScheduleOverlapPolicy.SKIP);
    }
    await this._adminScheduleLogService.append({
      scheduleKey: 'follower-bot-scores',
      message: 'Follower bot score schedule triggered',
    });
    return this.getStatus();
  }

  private async create(cadence: FollowerBotScoreScheduleConfig) {
    const config = normalizeFollowerBotScoreSchedule(cadence);
    try {
      await this.scheduleClient().create({
        scheduleId: FOLLOWER_BOT_SCORE_SCHEDULE_ID,
        spec: toFollowerBotScoreScheduleSpec(config),
        action: {
          type: 'startWorkflow',
          workflowType: FOLLOWER_BOT_SCORE_WORKFLOW_TYPE,
          taskQueue: 'main',
          workflowId: FOLLOWER_BOT_SCORE_WORKFLOW_ID,
          args: [{}],
        },
        policies: {
          overlap: ScheduleOverlapPolicy.SKIP,
        },
        memo: { cadence: config },
      });
    } catch (error) {
      if (!this.isAlreadyRunning(error)) {
        this._logger.error(
          'Failed to create follower bot score schedule',
          error
        );
        await this._adminScheduleLogService.append({
          scheduleKey: 'follower-bot-scores',
          level: 'ERROR',
          message: 'Failed to create follower bot score schedule',
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    }
  }

  private describe() {
    return this.getHandle().describe();
  }

  private mapStatus(
    description: Awaited<
      ReturnType<
        ReturnType<FollowerBotScoreScheduleService['getHandle']>['describe']
      >
    >,
    exists: boolean
  ): FollowerBotScoreScheduleStatus {
    return {
      scheduleId: FOLLOWER_BOT_SCORE_SCHEDULE_ID,
      exists,
      paused: description.state.paused,
      cadence: this.cadenceFromDescription(description),
      nextRunTimes: (description.info.nextActionTimes || []).map((value) =>
        value.toISOString()
      ),
      note: description.state.note,
    };
  }

  private cadenceFromDescription(description: {
    memo?: Record<string, unknown>;
  }) {
    try {
      return normalizeFollowerBotScoreSchedule(
        this.cadenceFromUnknown(description.memo?.cadence)
      );
    } catch {
      return DEFAULT_FOLLOWER_BOT_SCORE_SCHEDULE;
    }
  }

  private cadenceFromUnknown(
    value: unknown
  ): Partial<FollowerBotScoreScheduleConfig> | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    if ('cadence' in value) {
      return this.cadenceFromUnknown((value as { cadence?: unknown }).cadence);
    }
    return value as Partial<FollowerBotScoreScheduleConfig>;
  }

  private getHandle() {
    return this.scheduleClient().getHandle(FOLLOWER_BOT_SCORE_SCHEDULE_ID);
  }

  private scheduleClient() {
    const client = this.rawClient()?.schedule;
    if (!client) {
      throw new Error(
        'Temporal schedule client unavailable during bot score schedule install'
      );
    }
    return client;
  }

  private rawClient() {
    return this._temporalService.client?.getRawClient();
  }

  private isMissing(error: unknown) {
    const value = error as { name?: string; message?: string };
    const message = value?.message?.toLowerCase() || '';
    return (
      value?.name === 'ScheduleNotFoundError' ||
      message.includes('not found') ||
      message.includes('no rows')
    );
  }

  private isAlreadyRunning(error: unknown) {
    const value = error as { name?: string; message?: string };
    const message = value?.message?.toLowerCase() || '';
    return (
      value?.name === 'ScheduleAlreadyRunning' ||
      message.includes('already exists') ||
      message.includes('already running')
    );
  }
}

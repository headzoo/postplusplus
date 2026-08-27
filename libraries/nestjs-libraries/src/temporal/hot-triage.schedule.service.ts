import { Injectable, Logger } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { ScheduleOverlapPolicy } from '@temporalio/client';
import {
  DEFAULT_HOT_MATERIALIZATION_SCHEDULE,
  HOT_MATERIALIZATION_SCHEDULE_ID,
  HOT_MATERIALIZATION_WORKFLOW_ID,
  HOT_MATERIALIZATION_WORKFLOW_TYPE,
  HotMaterializationScheduleConfig,
  normalizeHotMaterializationSchedule,
  toHotMaterializationScheduleSpec,
} from './hot-triage.schedule';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';

export type HotMaterializationScheduleStatus = {
  scheduleId: string;
  exists: boolean;
  paused: boolean;
  cadence: HotMaterializationScheduleConfig;
  nextRunTimes: string[];
  note?: string;
};

@Injectable()
export class HotMaterializationScheduleService {
  private readonly _logger = new Logger(HotMaterializationScheduleService.name);

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
      await this.create(DEFAULT_HOT_MATERIALIZATION_SCHEDULE);
    }
  }

  async getStatus(): Promise<HotMaterializationScheduleStatus> {
    try {
      return this.mapStatus(await this.describe(), true);
    } catch (error) {
      if (!this.isMissing(error)) {
        throw error;
      }
      return {
        scheduleId: HOT_MATERIALIZATION_SCHEDULE_ID,
        exists: false,
        paused: false,
        cadence: DEFAULT_HOT_MATERIALIZATION_SCHEDULE,
        nextRunTimes: [],
      };
    }
  }

  async update(cadence: HotMaterializationScheduleConfig) {
    const config = normalizeHotMaterializationSchedule(cadence);
    try {
      await this.getHandle().update((previous) => ({
        spec: toHotMaterializationScheduleSpec(config),
        action: {
          type: 'startWorkflow',
          workflowType: HOT_MATERIALIZATION_WORKFLOW_TYPE,
          taskQueue: 'main',
          workflowId: HOT_MATERIALIZATION_WORKFLOW_ID,
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
          scheduleKey: 'hot-triage',
          level: 'ERROR',
          message: 'Failed to update Hot triage schedule',
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
      await this.create(config);
    }
    await this._adminScheduleLogService.append({
      scheduleKey: 'hot-triage',
      message: 'Hot triage schedule updated',
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
          scheduleKey: 'hot-triage',
          level: 'ERROR',
          message: 'Failed to trigger Hot triage schedule',
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
      await this.create(DEFAULT_HOT_MATERIALIZATION_SCHEDULE);
      await this.getHandle().trigger(ScheduleOverlapPolicy.SKIP);
    }
    await this._adminScheduleLogService.append({
      scheduleKey: 'hot-triage',
      message: 'Hot triage schedule triggered',
    });
    return this.getStatus();
  }

  private async create(cadence: HotMaterializationScheduleConfig) {
    const config = normalizeHotMaterializationSchedule(cadence);
    try {
      await this.scheduleClient().create({
        scheduleId: HOT_MATERIALIZATION_SCHEDULE_ID,
        spec: toHotMaterializationScheduleSpec(config),
        action: {
          type: 'startWorkflow',
          workflowType: HOT_MATERIALIZATION_WORKFLOW_TYPE,
          taskQueue: 'main',
          workflowId: HOT_MATERIALIZATION_WORKFLOW_ID,
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
          'Failed to create Hot materialization schedule',
          error
        );
        await this._adminScheduleLogService.append({
          scheduleKey: 'hot-triage',
          level: 'ERROR',
          message: 'Failed to create Hot triage schedule',
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
        ReturnType<HotMaterializationScheduleService['getHandle']>['describe']
      >
    >,
    exists: boolean
  ): HotMaterializationScheduleStatus {
    return {
      scheduleId: HOT_MATERIALIZATION_SCHEDULE_ID,
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
      return normalizeHotMaterializationSchedule(
        this.cadenceFromUnknown(description.memo?.cadence)
      );
    } catch {
      return DEFAULT_HOT_MATERIALIZATION_SCHEDULE;
    }
  }

  private cadenceFromUnknown(
    value: unknown
  ): Partial<HotMaterializationScheduleConfig> | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    if ('cadence' in value) {
      return this.cadenceFromUnknown((value as { cadence?: unknown }).cadence);
    }
    return value as Partial<HotMaterializationScheduleConfig>;
  }

  private getHandle() {
    return this.scheduleClient().getHandle(HOT_MATERIALIZATION_SCHEDULE_ID);
  }

  private scheduleClient() {
    const client = this.rawClient()?.schedule;
    if (!client) {
      throw new Error('Temporal schedule client unavailable');
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

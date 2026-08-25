import { Injectable, Logger } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { ScheduleOverlapPolicy } from '@temporalio/client';
import {
  CULTIVATE_LEGACY_WORKFLOW_ID,
  CULTIVATE_MATERIALIZATION_SCHEDULE_ID,
  CULTIVATE_MATERIALIZATION_WORKFLOW_ID,
  CULTIVATE_MATERIALIZATION_WORKFLOW_TYPE,
  CultivateMaterializationScheduleConfig,
  DEFAULT_CULTIVATE_MATERIALIZATION_SCHEDULE,
  normalizeCultivateMaterializationSchedule,
  toCultivateMaterializationScheduleSpec,
} from './cultivate.schedule';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';

export type CultivateMaterializationScheduleStatus = {
  scheduleId: string;
  exists: boolean;
  paused: boolean;
  cadence: CultivateMaterializationScheduleConfig;
  nextRunTimes: string[];
  note?: string;
};

@Injectable()
export class CultivateMaterializationScheduleService {
  private readonly _logger = new Logger(
    CultivateMaterializationScheduleService.name
  );

  constructor(
    private _temporalService: TemporalService,
    private _adminScheduleLogService: AdminScheduleLogService
  ) { }

  async install() {
    await this.terminateLegacyWorkflow();
    try {
      await this.describe();
    } catch (error) {
      if (!this.isMissing(error)) {
        throw error;
      }
      await this.create(DEFAULT_CULTIVATE_MATERIALIZATION_SCHEDULE);
    }
  }

  async getStatus(): Promise<CultivateMaterializationScheduleStatus> {
    try {
      return this.mapStatus(await this.describe(), true);
    } catch (error) {
      if (!this.isMissing(error)) {
        throw error;
      }
      return {
        scheduleId: CULTIVATE_MATERIALIZATION_SCHEDULE_ID,
        exists: false,
        paused: false,
        cadence: DEFAULT_CULTIVATE_MATERIALIZATION_SCHEDULE,
        nextRunTimes: [],
      };
    }
  }

  async update(cadence: CultivateMaterializationScheduleConfig) {
    const config = normalizeCultivateMaterializationSchedule(cadence);
    try {
      await this.getHandle().update((previous) => ({
        spec: toCultivateMaterializationScheduleSpec(config),
        action: {
          type: 'startWorkflow',
          workflowType: CULTIVATE_MATERIALIZATION_WORKFLOW_TYPE,
          taskQueue: 'main',
          workflowId: CULTIVATE_MATERIALIZATION_WORKFLOW_ID,
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
          scheduleKey: 'follower-cultivate',
          level: 'ERROR',
          message: 'Failed to update follower cultivate schedule',
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
      await this.create(config);
    }
    await this._adminScheduleLogService.append({
      scheduleKey: 'follower-cultivate',
      message: 'Follower cultivate schedule updated',
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
          scheduleKey: 'follower-cultivate',
          level: 'ERROR',
          message: 'Failed to trigger follower cultivate schedule',
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
      await this.create(DEFAULT_CULTIVATE_MATERIALIZATION_SCHEDULE);
      await this.getHandle().trigger(ScheduleOverlapPolicy.SKIP);
    }
    await this._adminScheduleLogService.append({
      scheduleKey: 'follower-cultivate',
      message: 'Follower cultivate schedule triggered',
    });
    return this.getStatus();
  }

  private async create(cadence: CultivateMaterializationScheduleConfig) {
    const config = normalizeCultivateMaterializationSchedule(cadence);
    try {
      await this.scheduleClient().create({
        scheduleId: CULTIVATE_MATERIALIZATION_SCHEDULE_ID,
        spec: toCultivateMaterializationScheduleSpec(config),
        action: {
          type: 'startWorkflow',
          workflowType: CULTIVATE_MATERIALIZATION_WORKFLOW_TYPE,
          taskQueue: 'main',
          workflowId: CULTIVATE_MATERIALIZATION_WORKFLOW_ID,
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
          'Failed to create follower cultivate materialization schedule',
          error
        );
        await this._adminScheduleLogService.append({
          scheduleKey: 'follower-cultivate',
          level: 'ERROR',
          message: 'Failed to create follower cultivate schedule',
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    }
  }

  private async terminateLegacyWorkflow() {
    const workflow = this.rawClient()?.workflow;
    if (!workflow) {
      throw new Error(
        'Temporal workflow client unavailable during cultivate schedule install'
      );
    }
    try {
      const handle = workflow.getHandle(CULTIVATE_LEGACY_WORKFLOW_ID);
      const description = await handle.describe();
      if (description.status.name === 'RUNNING') {
        await handle.terminate(
          'Migrating Channel cultivate daily picks to hourly Temporal Schedule v2'
        );
      }
    } catch (error) {
      const value = error as { name?: string; message?: string };
      const message = value?.message?.toLowerCase() || '';
      if (
        value?.name !== 'WorkflowNotFoundError' &&
        value?.name !== 'WorkflowExecutionAlreadyCompletedError' &&
        !message.includes('not found') &&
        !message.includes('already completed') &&
        !message.includes('already closed')
      ) {
        this._logger.error('Failed to stop Channel cultivate V1', error);
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
        ReturnType<CultivateMaterializationScheduleService['getHandle']>['describe']
      >
    >,
    exists: boolean
  ): CultivateMaterializationScheduleStatus {
    return {
      scheduleId: CULTIVATE_MATERIALIZATION_SCHEDULE_ID,
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
      return normalizeCultivateMaterializationSchedule(
        this.cadenceFromUnknown(description.memo?.cadence)
      );
    } catch {
      return DEFAULT_CULTIVATE_MATERIALIZATION_SCHEDULE;
    }
  }

  private cadenceFromUnknown(
    value: unknown
  ): Partial<CultivateMaterializationScheduleConfig> | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    if ('cadence' in value) {
      return this.cadenceFromUnknown(
        (value as { cadence?: unknown }).cadence
      );
    }
    return value as Partial<CultivateMaterializationScheduleConfig>;
  }

  private getHandle() {
    return this.scheduleClient().getHandle(CULTIVATE_MATERIALIZATION_SCHEDULE_ID);
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

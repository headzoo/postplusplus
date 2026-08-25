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

@Injectable()
export class HotMaterializationScheduleService {
  private readonly _logger = new Logger(HotMaterializationScheduleService.name);

  constructor(private _temporalService: TemporalService) {}

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
        this._logger.error('Failed to create Hot materialization schedule', error);
        throw error;
      }
    }
  }

  private describe() {
    return this.getHandle().describe();
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

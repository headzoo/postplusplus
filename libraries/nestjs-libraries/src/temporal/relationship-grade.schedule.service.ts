import { Injectable, Logger } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { ScheduleOverlapPolicy } from '@temporalio/client';
import {
  DEFAULT_RELATIONSHIP_GRADE_SCHEDULE,
  RELATIONSHIP_GRADE_LEGACY_WORKFLOW_ID,
  RELATIONSHIP_GRADE_SCHEDULE_ID,
  RELATIONSHIP_GRADE_WORKFLOW_ID,
  RELATIONSHIP_GRADE_WORKFLOW_TYPE,
  RelationshipGradeScheduleConfig,
  normalizeRelationshipGradeSchedule,
  toRelationshipGradeScheduleSpec,
} from './relationship-grade.schedule';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';

export type RelationshipGradeScheduleStatus = {
  scheduleId: string;
  exists: boolean;
  paused: boolean;
  cadence: RelationshipGradeScheduleConfig;
  nextRunTimes: string[];
  note?: string;
};

@Injectable()
export class RelationshipGradeScheduleService {
  private readonly _logger = new Logger(RelationshipGradeScheduleService.name);

  constructor(
    private _temporalService: TemporalService,
    private _adminScheduleLogService: AdminScheduleLogService
  ) {}

  async install() {
    await this.terminateLegacyWorkflow();
    try {
      await this.describe();
    } catch (error) {
      if (!this.isMissing(error)) {
        throw error;
      }
      await this.create(DEFAULT_RELATIONSHIP_GRADE_SCHEDULE);
    }
  }

  async getStatus(): Promise<RelationshipGradeScheduleStatus> {
    try {
      return this.mapStatus(await this.describe(), true);
    } catch (error) {
      if (!this.isMissing(error)) {
        throw error;
      }
      return {
        scheduleId: RELATIONSHIP_GRADE_SCHEDULE_ID,
        exists: false,
        paused: false,
        cadence: DEFAULT_RELATIONSHIP_GRADE_SCHEDULE,
        nextRunTimes: [],
      };
    }
  }

  async update(cadence: RelationshipGradeScheduleConfig) {
    const config = normalizeRelationshipGradeSchedule(cadence);
    try {
      await this.getHandle().update((previous) => ({
        spec: toRelationshipGradeScheduleSpec(config),
        action: {
          type: 'startWorkflow',
          workflowType: RELATIONSHIP_GRADE_WORKFLOW_TYPE,
          taskQueue: 'main',
          workflowId: RELATIONSHIP_GRADE_WORKFLOW_ID,
          args: [{ cadence: config }],
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
      }));
    } catch (error) {
      if (!this.isMissing(error)) {
        await this._adminScheduleLogService.append({
          scheduleKey: 'relationship-grades',
          level: 'ERROR',
          message: 'Failed to update relationship grade schedule',
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
      await this.create(config);
    }
    await this._adminScheduleLogService.append({
      scheduleKey: 'relationship-grades',
      message: 'Relationship grade schedule updated',
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
          scheduleKey: 'relationship-grades',
          level: 'ERROR',
          message: 'Failed to trigger relationship grade schedule',
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
      await this.create(DEFAULT_RELATIONSHIP_GRADE_SCHEDULE);
      await this.getHandle().trigger(ScheduleOverlapPolicy.SKIP);
    }
    await this._adminScheduleLogService.append({
      scheduleKey: 'relationship-grades',
      message: 'Relationship grade schedule triggered',
    });
    return this.getStatus();
  }

  private async create(cadence: RelationshipGradeScheduleConfig) {
    const config = normalizeRelationshipGradeSchedule(cadence);
    try {
      await this.scheduleClient().create({
        scheduleId: RELATIONSHIP_GRADE_SCHEDULE_ID,
        spec: toRelationshipGradeScheduleSpec(config),
        action: {
          type: 'startWorkflow',
          workflowType: RELATIONSHIP_GRADE_WORKFLOW_TYPE,
          taskQueue: 'main',
          workflowId: RELATIONSHIP_GRADE_WORKFLOW_ID,
          args: [{ cadence: config }],
        },
        policies: {
          overlap: ScheduleOverlapPolicy.SKIP,
        },
        memo: { cadence: config },
      });
    } catch (error) {
      if (!this.isAlreadyRunning(error)) {
        this._logger.error(
          'Failed to create relationship grade schedule',
          error
        );
        await this._adminScheduleLogService.append({
          scheduleKey: 'relationship-grades',
          level: 'ERROR',
          message: 'Failed to create relationship grade schedule',
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
        'Temporal workflow client unavailable during schedule install'
      );
    }
    try {
      const handle = workflow.getHandle(RELATIONSHIP_GRADE_LEGACY_WORKFLOW_ID);
      const description = await handle.describe();
      if (description.status.name === 'RUNNING') {
        await handle.terminate(
          'Migrating Channel relationship grade to Temporal Schedule v2'
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
        this._logger.error(
          'Failed to stop Channel relationship grade V1',
          error
        );
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
        ReturnType<RelationshipGradeScheduleService['getHandle']>['describe']
      >
    >,
    exists: boolean
  ): RelationshipGradeScheduleStatus {
    return {
      scheduleId: RELATIONSHIP_GRADE_SCHEDULE_ID,
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
    action?: { args?: readonly unknown[] };
    memo?: Record<string, unknown>;
  }) {
    try {
      return normalizeRelationshipGradeSchedule(
        this.cadenceFromUnknown(description.action?.args?.[0]) ??
          this.cadenceFromUnknown(description.memo?.cadence)
      );
    } catch {
      return DEFAULT_RELATIONSHIP_GRADE_SCHEDULE;
    }
  }

  private cadenceFromUnknown(
    value: unknown
  ): Partial<RelationshipGradeScheduleConfig> | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    if ('cadence' in value) {
      return this.cadenceFromUnknown((value as { cadence?: unknown }).cadence);
    }
    return value as Partial<RelationshipGradeScheduleConfig>;
  }

  private getHandle() {
    return this.scheduleClient().getHandle(RELATIONSHIP_GRADE_SCHEDULE_ID);
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
    return (
      value?.name === 'ScheduleNotFoundError' ||
      !!value?.message?.toLowerCase().includes('not found')
    );
  }

  private isAlreadyRunning(error: unknown) {
    const value = error as { name?: string; message?: string };
    const message = value?.message?.toLowerCase() || '';
    return (
      value?.name === 'ScheduleAlreadyRunning' ||
      message.includes('already running') ||
      message.includes('already exists')
    );
  }
}

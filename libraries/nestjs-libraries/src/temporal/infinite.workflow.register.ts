import {
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { RelationshipGradeScheduleService } from './relationship-grade.schedule.service';
import { FollowerBotScoreScheduleService } from './follower-bot-score.schedule.service';
import { AdminScheduleWorkflowService } from './admin-schedule.workflow.service';
import {
  LEAD_BRIDGE_WORKFLOW_ID,
  LEAD_BRIDGE_WORKFLOW_TYPE,
} from './lead-bridge.schedule';
import { HotMaterializationScheduleService } from './hot-triage.schedule.service';
import { CultivateMaterializationScheduleService } from './cultivate.schedule.service';

@Injectable()
export class InfiniteWorkflowRegister implements OnModuleInit {
  private readonly _logger = new Logger(InfiniteWorkflowRegister.name);

  constructor(
    private _temporalService: TemporalService,
    private _relationshipGradeScheduleService: RelationshipGradeScheduleService,
    private _followerBotScoreScheduleService: FollowerBotScoreScheduleService,
    private _hotMaterializationScheduleService: HotMaterializationScheduleService,
    private _cultivateMaterializationScheduleService: CultivateMaterializationScheduleService
  ) { }

  async onModuleInit(): Promise<void> {
    if (!!process.env.RUN_CRON) {
      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('missingPostWorkflow', {
            workflowId: 'missing-post-workflow',
            taskQueue: 'main',
          });
      } catch (err) { }
      await this.handoffPipelineScheduler();
      await this.startChannelInteractionMaintenance();
      await this.startChannelRelationshipGrade();
      await this.startChannelFollowerBotScore();
      await this.startChannelLeadBridge();
      await this.startChannelCultivate();
      await this.startChannelAnalyticsSnapshot();
      await this.startChannelHotMaterialization();
    }
  }

  private async handoffPipelineScheduler() {
    const workflow = this._temporalService.client?.getRawClient()?.workflow;
    if (!workflow) {
      throw new Error('Temporal workflow client unavailable during scheduler handoff');
    }

    try {
      const v1 = workflow.getHandle('pipeline-scheduler-workflow-v1');
      const description = await v1.describe();
      if (description.status.name === 'RUNNING') {
        await v1.terminate('Migrating Pipeline scheduler to V2');
      }
    } catch (error) {
      if (!this.isMissingOrClosed(error)) {
        this._logger.error('Failed to stop Pipeline scheduler V1', error);
        throw error;
      }
    }

    try {
      await workflow.start('pipelineSchedulerWorkflowV2', {
        workflowId: 'pipeline-scheduler-workflow-v2',
        taskQueue: 'main',
        args: [{}],
      });
    } catch (error) {
      if (!this.isAlreadyStarted(error)) {
        this._logger.error('Failed to start Pipeline scheduler V2', error);
        throw error;
      }
    }
  }

  private async startChannelInteractionMaintenance() {
    const workflow = this._temporalService.client?.getRawClient()?.workflow;
    if (!workflow) {
      throw new Error('Temporal workflow client unavailable during maintenance start');
    }
    try {
      const v1 = workflow.getHandle('channel-interaction-maintenance-workflow-v1');
      const description = await v1.describe();
      if (description.status.name === 'RUNNING') {
        await v1.terminate('Migrating Channel interaction maintenance to V2');
      }
    } catch (error) {
      if (!this.isMissingOrClosed(error)) {
        this._logger.error('Failed to stop Channel interaction maintenance V1', error);
        throw error;
      }
    }

    try {
      await workflow.start('channelInteractionMaintenanceWorkflowV2', {
        workflowId: 'channel-interaction-maintenance-workflow-v2',
        taskQueue: 'main',
        args: [{}],
      });
    } catch (error) {
      if (!this.isAlreadyStarted(error)) {
        this._logger.error('Failed to start Channel interaction maintenance', error);
        throw error;
      }
    }
    try {
      await workflow
        .getHandle('channel-interaction-maintenance-workflow-v2')
        .signal('channelInteractionMaintenance');
    } catch (error) {
      this._logger.warn(
        'Channel interaction maintenance was not poked after start',
        error
      );
    }
  }

  private async startChannelRelationshipGrade() {
    await this._relationshipGradeScheduleService.install();
  }

  private async startChannelFollowerBotScore() {
    await this._followerBotScoreScheduleService.install();
  }

  private async startChannelLeadBridge() {
    const workflow = this._temporalService.client?.getRawClient()?.workflow;
    if (!workflow) {
      throw new Error(
        'Temporal workflow client unavailable during lead bridge start'
      );
    }
    try {
      await workflow.start(LEAD_BRIDGE_WORKFLOW_TYPE, {
        workflowId: LEAD_BRIDGE_WORKFLOW_ID,
        taskQueue: 'main',
        args: [{}],
      });
    } catch (error) {
      if (!this.isAlreadyStarted(error)) {
        this._logger.error('Failed to start Channel lead bridge crawl', error);
        throw error;
      }
    }
    try {
      await workflow
        .getHandle(LEAD_BRIDGE_WORKFLOW_ID)
        .signal('channelLeadBridge');
    } catch (error) {
      this._logger.warn(
        'Channel lead bridge crawl was not poked after start',
        error
      );
    }
  }

  private async startChannelCultivate() {
    await this._cultivateMaterializationScheduleService.install();
  }

  private async startChannelHotMaterialization() {
    await this._hotMaterializationScheduleService.install();
  }

  private async startChannelAnalyticsSnapshot() {
    const workflow = this._temporalService.client?.getRawClient()?.workflow;
    if (!workflow) {
      throw new Error(
        'Temporal workflow client unavailable during analytics snapshot start'
      );
    }
    try {
      const v1 = workflow.getHandle('channel-analytics-snapshot-workflow-v1');
      const description = await v1.describe();
      if (description.status.name === 'RUNNING') {
        await v1.terminate('Migrating Channel analytics snapshot to V2');
      }
    } catch (error) {
      if (!this.isMissingOrClosed(error)) {
        this._logger.error('Failed to stop Channel analytics snapshot V1', error);
        throw error;
      }
    }

    try {
      await workflow.start('channelAnalyticsSnapshotWorkflowV2', {
        workflowId: 'channel-analytics-snapshot-workflow-v2',
        taskQueue: 'main',
        args: [{}],
      });
    } catch (error) {
      if (!this.isAlreadyStarted(error)) {
        this._logger.error('Failed to start Channel analytics snapshot', error);
        throw error;
      }
    }
    try {
      await workflow
        .getHandle('channel-analytics-snapshot-workflow-v2')
        .signal('channelAnalyticsSnapshot');
    } catch (error) {
      this._logger.warn(
        'Channel analytics snapshot was not poked after start',
        error
      );
    }
  }

  private isMissingOrClosed(error: unknown) {
    const value = error as { name?: string; message?: string };
    const message = value?.message?.toLowerCase() || '';
    return (
      value?.name === 'WorkflowNotFoundError' ||
      value?.name === 'WorkflowExecutionAlreadyCompletedError' ||
      message.includes('not found') ||
      message.includes('already completed') ||
      message.includes('already closed')
    );
  }

  private isAlreadyStarted(error: unknown) {
    const value = error as { name?: string; message?: string };
    return (
      value?.name === 'WorkflowExecutionAlreadyStartedError' ||
      !!value?.message?.toLowerCase().includes('already started')
    );
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [
    InfiniteWorkflowRegister,
    FollowerBotScoreScheduleService,
    HotMaterializationScheduleService,
    CultivateMaterializationScheduleService,
    AdminScheduleWorkflowService,
  ],
  get exports() {
    return this.providers;
  },
})
export class InfiniteWorkflowRegisterModule { }

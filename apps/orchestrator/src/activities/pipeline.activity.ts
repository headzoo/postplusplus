import { Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { PipelineExecutionRepository } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.execution.repository';
import {
  ClaimPipelineSlotRequest,
  ClaimPipelineSlotResponse,
  ClaimPipelineSlotV2Request,
  DiscoverDuePipelineSlotsRequest,
  DiscoverDuePipelineSlotsResponse,
  FinalizePipelineSlotRequest,
  FinalizePipelineSlotResponse,
  GetPipelinePostStateV1Request,
  PipelinePostStateV1,
  PipelineSlotFailureContext,
  RecordPipelineSlotDispatchFailureV1Request,
} from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.execution';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';

@Injectable()
@Activity()
export class PipelineActivity {
  private readonly _logger = new Logger(PipelineActivity.name);

  constructor(
    private _pipelineExecutionRepository: PipelineExecutionRepository,
    private _adminScheduleLogService: AdminScheduleLogService,
    private _notificationService: NotificationService
  ) {}

  @ActivityMethod()
  async discoverDuePipelineSlots(
    request: DiscoverDuePipelineSlotsRequest
  ): Promise<DiscoverDuePipelineSlotsResponse> {
    try {
      const discovered =
        await this._pipelineExecutionRepository.discoverDueSlots(request);
      if (discovered.candidates.length > 0) {
        await this._adminScheduleLogService.append({
          scheduleKey: 'post-workflows',
          message: `Discovered ${discovered.candidates.length} due pipeline slot(s)`,
          meta: {
            nowUtc: request.nowUtc,
            candidateCount: discovered.candidates.length,
            hasMore: !!discovered.next,
          },
        });
      }
      return discovered;
    } catch (error) {
      await this._adminScheduleLogService.append({
        scheduleKey: 'post-workflows',
        level: 'ERROR',
        message: 'Failed to discover due pipeline slots',
        meta: {
          nowUtc: request.nowUtc,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  @ActivityMethod()
  async claimPipelineSlot(
    request: ClaimPipelineSlotRequest
  ): Promise<ClaimPipelineSlotResponse> {
    const result = await this._pipelineExecutionRepository.claimSlot(request);
    if (result.outcome === 'FAILED' && result.executionId) {
      const context = await this._pipelineExecutionRepository.getFailureContext(
        result.executionId
      );
      await this.reportFailure(
        context,
        result.reason ||
          'Pipeline content could not be prepared for publishing',
        'claim',
        true
      );
    }
    return result;
  }

  @ActivityMethod()
  async claimPipelineSlotV2(
    request: ClaimPipelineSlotV2Request
  ): Promise<ClaimPipelineSlotResponse> {
    const result = await this._pipelineExecutionRepository.claimSlotV2(request);
    if (result.outcome === 'FAILED' && result.executionId) {
      const context = await this._pipelineExecutionRepository.getFailureContext(
        result.executionId
      );
      await this.reportFailure(
        context,
        result.reason ||
          'Pipeline content could not be prepared for publishing',
        'claim',
        true
      );
    }
    return result;
  }

  @ActivityMethod()
  async finalizePipelineSlot(
    request: FinalizePipelineSlotRequest
  ): Promise<FinalizePipelineSlotResponse> {
    const result = await this._pipelineExecutionRepository.finalizeSlot(
      request.executionId
    );
    if (result.outcome === 'FAILED') {
      const context = await this._pipelineExecutionRepository.getFailureContext(
        request.executionId
      );
      await this.reportFailure(
        context,
        result.reason || 'One or more Pipeline channel posts did not publish',
        'finalize',
        !context?.hasPostError
      );
    }
    return result;
  }

  @ActivityMethod()
  async recordPipelineSlotDispatchFailureV1(
    request: RecordPipelineSlotDispatchFailureV1Request
  ): Promise<void> {
    const context =
      await this._pipelineExecutionRepository.recordDispatchFailureV1(request);
    await this.reportFailure(context, request.reason, 'dispatch', true);
  }

  @ActivityMethod()
  getPipelinePostStateV1(
    request: GetPipelinePostStateV1Request
  ): Promise<PipelinePostStateV1> {
    return this._pipelineExecutionRepository.getPipelinePostStateV1(request);
  }

  private async reportFailure(
    context: PipelineSlotFailureContext | undefined,
    reason: string,
    phase: 'claim' | 'dispatch' | 'finalize',
    notify: boolean
  ) {
    const normalizedReason =
      reason.replace(/\s+/g, ' ').trim().slice(0, 2000) ||
      'Pipeline publishing failed';
    const meta = {
      phase,
      executionId: context?.executionId,
      pipelineId: context?.pipelineId,
      pipelineName: context?.pipelineName,
      queueItemId: context?.queueItemId,
      scheduledFor: context?.scheduledFor,
      postIds: context?.postIds || [],
      reason: normalizedReason,
    };
    this._logger.error(`Pipeline publish failed: ${JSON.stringify(meta)}`);
    await this._adminScheduleLogService.append({
      scheduleKey: 'post-workflows',
      level: 'ERROR',
      message: `Pipeline publish failed during ${phase}`,
      meta,
    });

    if (!notify || !context) {
      return;
    }
    await this._notificationService.inAppNotificationOnce(
      context.organizationId,
      `pipeline-publish-failure:${context.executionId}`,
      `Postiz could not publish the scheduled item from Pipeline "${context.pipelineName}" at ${context.scheduledFor}. ${normalizedReason} Open the Pipeline's Failed section to review the item.`
    );
  }
}

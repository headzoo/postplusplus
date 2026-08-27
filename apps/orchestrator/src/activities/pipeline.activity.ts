import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { PipelineExecutionRepository } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.execution.repository';
import {
  ClaimPipelineSlotRequest,
  ClaimPipelineSlotResponse,
  DiscoverDuePipelineSlotsRequest,
  DiscoverDuePipelineSlotsResponse,
  FinalizePipelineSlotRequest,
  FinalizePipelineSlotResponse,
} from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.execution';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';

@Injectable()
@Activity()
export class PipelineActivity {
  constructor(
    private _pipelineExecutionRepository: PipelineExecutionRepository,
    private _adminScheduleLogService: AdminScheduleLogService
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
  claimPipelineSlot(
    request: ClaimPipelineSlotRequest
  ): Promise<ClaimPipelineSlotResponse> {
    return this._pipelineExecutionRepository.claimSlot(request);
  }

  @ActivityMethod()
  finalizePipelineSlot(
    request: FinalizePipelineSlotRequest
  ): Promise<FinalizePipelineSlotResponse> {
    return this._pipelineExecutionRepository.finalizeSlot(request.executionId);
  }
}

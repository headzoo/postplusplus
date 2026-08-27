import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ChannelInteractionRepository } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.repository';
import { ChannelInteractionService } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.service';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';

export type ChannelFollowerBotScoreCandidate = {
  id: string;
  organizationId: string;
};

@Injectable()
@Activity()
export class ChannelFollowerBotScoreActivity {
  constructor(
    private _repository: ChannelInteractionRepository,
    private _channelInteractionService: ChannelInteractionService,
    private _adminScheduleLogService: AdminScheduleLogService
  ) {}

  @ActivityMethod()
  async listDueCandidatesV1(request: { after?: string } = {}) {
    const result = await this._repository.listDueBotScoreCandidates(
      request.after,
      1
    );
    const candidates = result.candidates.map((candidate) => ({
      id: candidate.id,
      organizationId: candidate.organizationId,
    }));
    await this._adminScheduleLogService.append({
      scheduleKey: 'follower-bot-scores',
      message: candidates.length
        ? `Found due channel ${candidates[0].id} for bot scores`
        : 'No due channels for bot scores',
      meta: {
        after: request.after ?? null,
        candidateCount: candidates.length,
      },
    });
    return { candidates };
  }

  @ActivityMethod()
  async computeNextBatchV1(request: {
    candidate: ChannelFollowerBotScoreCandidate;
  }) {
    try {
      const result = await this._channelInteractionService.buildBotScoreBatch(
        request.candidate.organizationId,
        request.candidate.id
      );
      await this._adminScheduleLogService.append({
        scheduleKey: 'follower-bot-scores',
        message: `Bot score batch for channel ${
          request.candidate.id
        }: processed ${result.processed}${
          result.hasMore ? ' (more pending)' : ''
        }`,
        meta: {
          integrationId: request.candidate.id,
          organizationId: request.candidate.organizationId,
          processed: result.processed,
          hasMore: result.hasMore,
        },
      });
      return {
        gradedAt: result.gradedAt.toISOString(),
        processed: result.processed,
        hasMore: result.hasMore,
      };
    } catch (error) {
      await this._adminScheduleLogService.append({
        scheduleKey: 'follower-bot-scores',
        level: 'ERROR',
        message: `Bot score batch failed for channel ${request.candidate.id}`,
        meta: {
          integrationId: request.candidate.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}

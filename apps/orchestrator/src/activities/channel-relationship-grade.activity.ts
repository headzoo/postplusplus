import { BadRequestException, Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ChannelInteractionRepository } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.repository';
import { ChannelInteractionService } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.service';
import { RelationshipGradeScheduleConfig } from '@gitroom/nestjs-libraries/temporal/relationship-grade.schedule';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';

export type ChannelRelationshipGradeCandidate = {
  id: string;
  organizationId: string;
};

@Injectable()
@Activity()
export class ChannelRelationshipGradeActivity {
  constructor(
    private _repository: ChannelInteractionRepository,
    private _channelInteractionService: ChannelInteractionService,
    private _adminScheduleLogService: AdminScheduleLogService
  ) {}

  @ActivityMethod()
  async listDueCandidates(after?: string, asOf?: string) {
    const snapshotAt = this.parseTimestamp(asOf, 'asOf');
    const result = await this._repository.listDueRelationshipGradeCandidates(
      snapshotAt,
      after
    );
    return {
      asOf: snapshotAt.toISOString(),
      candidates: result.candidates.map((candidate) => ({
        id: candidate.id,
        organizationId: candidate.organizationId,
      })),
    };
  }

  @ActivityMethod()
  async snapshotNextBatch(request: {
    candidate: ChannelRelationshipGradeCandidate;
    snapshotAt: string;
  }) {
    const snapshotAt = this.parseTimestamp(request.snapshotAt, 'snapshotAt');
    const result =
      await this._channelInteractionService.buildRelationshipGradeSnapshotBatch(
        request.candidate.organizationId,
        request.candidate.id,
        snapshotAt
      );
    return {
      snapshotAt: result.snapshotAt.toISOString(),
      processed: result.processed,
      hasMore: result.hasMore,
    };
  }

  private parseTimestamp(value: string | undefined, field: string) {
    const parsed = value ? new Date(value) : new Date();
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid timestamp`);
    }
    return parsed;
  }

  @ActivityMethod()
  async listDueCandidatesV2(
    request: {
      after?: string;
      asOf?: string;
      cadence?: RelationshipGradeScheduleConfig;
    } = {}
  ) {
    const snapshotAt = this.parseTimestamp(request.asOf, 'asOf');
    const result = await this._repository.listDueRelationshipGradeCandidates(
      snapshotAt,
      request.after,
      1,
      request.cadence
    );
    const candidates = result.candidates.map((candidate) => ({
      id: candidate.id,
      organizationId: candidate.organizationId,
    }));
    await this._adminScheduleLogService.append({
      scheduleKey: 'relationship-grades',
      message: candidates.length
        ? `Found due channel ${candidates[0].id} for relationship grades`
        : 'No due channels for relationship grades',
      meta: {
        after: request.after ?? null,
        candidateCount: candidates.length,
      },
    });
    return {
      asOf: snapshotAt.toISOString(),
      candidates,
    };
  }

  @ActivityMethod()
  async snapshotNextBatchV2(request: {
    candidate: ChannelRelationshipGradeCandidate;
    snapshotAt: string;
    cadence?: RelationshipGradeScheduleConfig;
  }) {
    const snapshotAt = this.parseTimestamp(request.snapshotAt, 'snapshotAt');
    try {
      const result =
        await this._channelInteractionService.buildRelationshipGradeSnapshotBatch(
          request.candidate.organizationId,
          request.candidate.id,
          snapshotAt,
          request.cadence
        );
      await this._adminScheduleLogService.append({
        scheduleKey: 'relationship-grades',
        message: `Snapshot batch for channel ${
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
        snapshotAt: result.snapshotAt.toISOString(),
        processed: result.processed,
        hasMore: result.hasMore,
      };
    } catch (error) {
      await this._adminScheduleLogService.append({
        scheduleKey: 'relationship-grades',
        level: 'ERROR',
        message: `Snapshot batch failed for channel ${request.candidate.id}`,
        meta: {
          integrationId: request.candidate.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}

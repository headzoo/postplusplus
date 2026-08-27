import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import {
  ChannelInteractionRepository,
  utcHourKey,
} from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.repository';
import { ChannelInteractionService } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';
import { HOT_MATERIALIZATION_LIST_SCAN } from '@gitroom/nestjs-libraries/temporal/hot-triage.schedule';
import { trimHotPickAuditForLog } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/hot-pick-audit';

export type ChannelHotMaterializationCandidate = {
  id: string;
  organizationId: string;
  providerIdentifier: string;
};

@Injectable()
@Activity()
export class ChannelHotMaterializationActivity {
  constructor(
    private _repository: ChannelInteractionRepository,
    private _channelInteractionService: ChannelInteractionService,
    private _integrationService: IntegrationService,
    private _adminScheduleLogService: AdminScheduleLogService
  ) {}

  @ActivityMethod()
  async resolveSweepHourV1() {
    return { hour: utcHourKey() };
  }

  @ActivityMethod()
  async listDueCandidatesV1(
    request: { hour: string; after?: string } = {
      hour: utcHourKey(),
    }
  ) {
    const result = await this._repository.listHotMaterializeCandidates(
      request.after,
      HOT_MATERIALIZATION_LIST_SCAN,
      request.hour
    );
    const candidates: ChannelHotMaterializationCandidate[] = result.candidates
      .slice(0, 1)
      .map((candidate) => ({
        id: candidate.id,
        organizationId: candidate.organizationId,
        providerIdentifier: candidate.providerIdentifier,
      }));
    await this._adminScheduleLogService.append({
      scheduleKey: 'hot-triage',
      message: candidates.length
        ? `Found due channel ${candidates[0].id} for hot triage`
        : 'No due channels for hot triage',
      meta: {
        hour: request.hour,
        after: request.after ?? null,
        candidateCount: candidates.length,
        scanned: result.candidates.length,
      },
    });
    return {
      candidates,
      scanned: result.candidates.length,
      next: result.next,
      hour: request.hour,
    };
  }

  @ActivityMethod()
  async materializeHotPicksV1(request: {
    hour: string;
    candidate: ChannelHotMaterializationCandidate;
  }) {
    const integration = await this._integrationService.getIntegrationById(
      request.candidate.organizationId,
      request.candidate.id
    );
    if (!integration || integration.disabled || integration.deletedAt) {
      await this._adminScheduleLogService.append({
        scheduleKey: 'hot-triage',
        message: `Skipped disabled/deleted channel ${request.candidate.id} for hot triage`,
        meta: {
          hour: request.hour,
          integrationId: request.candidate.id,
          organizationId: request.candidate.organizationId,
        },
      });
      return {
        skipped: true as const,
        hour: request.hour,
        pickCount: 0,
        candidateCount: 0,
      };
    }
    const now = new Date(`${request.hour}:00:00.000Z`);
    try {
      const result =
        await this._channelInteractionService.materializeHotPicksForIntegration(
          integration.organizationId,
          integration.id,
          now
        );
      if (result.skipped === 'near_full') {
        await this._adminScheduleLogService.append({
          scheduleKey: 'hot-triage',
          message: `Hot triage near-full for channel ${request.candidate.id}`,
          meta: {
            hour: result.hour,
            integrationId: request.candidate.id,
            organizationId: request.candidate.organizationId,
            reason: 'near_full',
            visibleCount: result.visibleCount,
          },
        });
        return {
          skipped: true as const,
          reason: 'near_full' as const,
          hour: result.hour,
          visibleCount: result.visibleCount,
          pickCount: 0,
          candidateCount: 0,
        };
      }
      await this._adminScheduleLogService.append({
        scheduleKey: 'hot-triage',
        message: `Hot picks for channel ${request.candidate.id}: stored=${
          result.pickCount
        } candidates=${result.candidateCount} visible=${
          result.visibleCount ?? result.pickCount
        }`,
        meta: {
          hour: result.hour,
          organizationId: request.candidate.organizationId,
          integrationId: request.candidate.id,
          pickCount: result.pickCount,
          storedCount: result.storedCount ?? result.pickCount,
          candidateCount: result.candidateCount,
          visibleCount: result.visibleCount ?? result.pickCount,
          excludedCount: result.excludedCount ?? 0,
        },
      });
      if (result.audit && result.audit.excludedCount > 0) {
        await this._adminScheduleLogService.append({
          scheduleKey: 'hot-triage',
          message: `Hot visibility audit for channel ${request.candidate.id}: stored=${result.audit.storedCount} visible=${result.audit.visibleCount} excluded=${result.audit.excludedCount}`,
          meta: {
            hour: result.hour,
            organizationId: request.candidate.organizationId,
            integrationId: request.candidate.id,
            ...trimHotPickAuditForLog(result.audit),
          },
        });
      }
      return {
        skipped: false as const,
        hour: result.hour,
        candidateCount: result.candidateCount,
        pickCount: result.pickCount,
        visibleCount: result.visibleCount,
        excludedCount: result.excludedCount,
      };
    } catch (error) {
      await this._adminScheduleLogService.append({
        scheduleKey: 'hot-triage',
        level: 'ERROR',
        message: `Hot materialization failed for channel ${request.candidate.id}`,
        meta: {
          hour: request.hour,
          integrationId: request.candidate.id,
          organizationId: request.candidate.organizationId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}

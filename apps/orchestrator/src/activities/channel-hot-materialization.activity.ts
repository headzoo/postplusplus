import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import {
  ChannelInteractionRepository,
  utcHourKey,
} from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.repository';
import { ChannelInteractionService } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { HOT_MATERIALIZATION_LIST_SCAN } from '@gitroom/nestjs-libraries/temporal/hot-triage.schedule';

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
    private _integrationService: IntegrationService
  ) {}

  @ActivityMethod()
  async resolveSweepHourV1() {
    return { hour: utcHourKey() };
  }

  @ActivityMethod()
  async listDueCandidatesV1(request: { hour: string; after?: string } = {
    hour: utcHourKey(),
  }) {
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
      return {
        skipped: true as const,
        hour: request.hour,
        pickCount: 0,
        candidateCount: 0,
      };
    }
    const now = new Date(`${request.hour}:00:00.000Z`);
    const result =
      await this._channelInteractionService.materializeHotPicksForIntegration(
        integration.organizationId,
        integration.id,
        now
      );
    if (result.skipped === 'near_full') {
      return {
        skipped: true as const,
        reason: 'near_full' as const,
        hour: result.hour,
        visibleCount: result.visibleCount,
        pickCount: 0,
        candidateCount: 0,
      };
    }
    return {
      skipped: false as const,
      hour: result.hour,
      candidateCount: result.candidateCount,
      pickCount: result.pickCount,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ChannelInteractionRepository, utcHourKey } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.repository';
import { ChannelInteractionService } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CULTIVATE_MATERIALIZATION_LIST_SCAN } from '@gitroom/nestjs-libraries/temporal/cultivate.schedule';

export type ChannelCultivateCandidate = {
  id: string;
  organizationId: string;
  providerIdentifier: string;
};

@Injectable()
@Activity()
export class ChannelCultivateActivity {
  constructor(
    private _repository: ChannelInteractionRepository,
    private _channelInteractionService: ChannelInteractionService,
    private _integrationService: IntegrationService
  ) { }

  @ActivityMethod()
  async listDueCandidatesV1(request: { after?: string } = {}) {
    const result = await this._repository.listCultivateMaterializeCandidates(
      request.after,
      8
    );
    const candidates: ChannelCultivateCandidate[] = result.candidates
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
    };
  }

  @ActivityMethod()
  async materializeDailyPicksV1(request: {
    candidate: ChannelCultivateCandidate;
  }) {
    const integration = await this._integrationService.getIntegrationById(
      request.candidate.organizationId,
      request.candidate.id
    );
    if (!integration || integration.disabled || integration.deletedAt) {
      return { skipped: true as const, pickCount: 0 };
    }
    const result =
      await this._channelInteractionService.materializeCultivatePicksForIntegration(
        integration.organizationId,
        integration.id
      );
    if (result.skipped === 'near_full') {
      return {
        skipped: true as const,
        day: result.hour,
        pickCount: 0,
      };
    }
    return {
      skipped: false as const,
      day: result.hour,
      candidateCount: result.candidateCount,
      pickCount: result.pickCount,
    };
  }

  @ActivityMethod()
  async resolveSweepHourV2() {
    return { hour: utcHourKey() };
  }

  @ActivityMethod()
  async listDueCandidatesV2(request: { hour: string; after?: string } = {
    hour: utcHourKey(),
  }) {
    const result = await this._repository.listCultivateMaterializeCandidates(
      request.after,
      CULTIVATE_MATERIALIZATION_LIST_SCAN,
      request.hour
    );
    const candidates: ChannelCultivateCandidate[] = result.candidates
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
  async materializeCultivatePicksV2(request: {
    hour: string;
    candidate: ChannelCultivateCandidate;
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
      await this._channelInteractionService.materializeCultivatePicksForIntegration(
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

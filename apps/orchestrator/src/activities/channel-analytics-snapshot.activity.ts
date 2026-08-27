import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { ChannelAnalyticsRepository } from '@gitroom/nestjs-libraries/database/prisma/channel-analytics/channel-analytics.repository';
import { ChannelAnalyticsService } from '@gitroom/nestjs-libraries/database/prisma/channel-analytics/channel-analytics.service';
import { ChannelInteractionService } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { timer } from '@gitroom/helpers/utils/timer';
import {
  ChannelAnalyticsCapturePage,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';

const CANDIDATE_BATCH_SIZE = 25;
const PROVIDER_PAGE_SIZE = 100;
const CAPTURE_WINDOW_DAYS = 180;

export type ChannelAnalyticsSnapshotCandidate = {
  id: string;
  organizationId: string;
};

export type ChannelAnalyticsCaptureMode = ChannelAnalyticsCapturePage['kind'];

@Injectable()
@Activity()
export class ChannelAnalyticsSnapshotActivity {
  constructor(
    private _repository: ChannelAnalyticsRepository,
    private _channelAnalyticsService: ChannelAnalyticsService,
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _channelInteractionService: ChannelInteractionService
  ) {}

  @ActivityMethod()
  async listDueCandidates(after?: string) {
    const snapshotAt = new Date();
    const result = await this._repository.listDueCandidates(
      this._integrationManager.getAnalyticsSnapshotIntegrations(),
      snapshotAt,
      after,
      CANDIDATE_BATCH_SIZE
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
  async capturePersistPage(request: {
    candidate: ChannelAnalyticsSnapshotCandidate;
    snapshotAt: string;
    cursor?: string;
    mode?: ChannelAnalyticsCaptureMode;
  }) {
    const snapshotAt = this.parseTimestamp(request.snapshotAt, 'snapshotAt');
    const integration = await this.getIntegration(request.candidate);
    if (!this.isActiveSocialIntegration(integration)) {
      throw new Error('Integration is unavailable');
    }

    let provider: SocialProvider;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      throw new Error('Analytics provider is unavailable');
    }
    if (!provider.analyticsSnapshot) {
      throw new Error('Analytics capture is unavailable');
    }

    const page = await this.capturePage(
      integration,
      provider,
      snapshotAt,
      request.cursor
    );
    if (request.mode && request.mode !== page.kind) {
      throw new Error('Analytics capture mode changed during pagination');
    }
    await this._channelAnalyticsService.persistCapturePage(
      request.candidate.organizationId,
      request.candidate.id,
      snapshotAt,
      page
    );

    if (page.kind === 'post_lifetime' && provider.postLikers) {
      const tweetIds = Array.from(
        new Set<string>(page.points.map((point) => point.externalPostId))
      );
      if (tweetIds.length) {
        try {
          const liveIntegration = await this.withRefreshedToken(
            integration,
            provider
          );
          const result =
            await this._channelInteractionService.syncInboundLikesFromPosts(
              liveIntegration,
              tweetIds,
              snapshotAt
            );
          if (result.rateLimited) {
            console.log(
              `Liker sync rate-limited for integration ${request.candidate.id}; analytics capture continues`
            );
          }
        } catch (error) {
          console.log(
            `Failed to sync inbound likes for integration ${
              request.candidate.id
            }: ${error instanceof Error ? error.message : 'unknown error'}`
          );
        }
      }
    }

    return {
      mode: page.kind,
      hasMore: !!page.nextCursor,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  @ActivityMethod()
  finalizeCapture(request: {
    candidate: ChannelAnalyticsSnapshotCandidate;
    snapshotAt: string;
    mode: ChannelAnalyticsCaptureMode;
  }) {
    const snapshotAt = this.parseTimestamp(request.snapshotAt, 'snapshotAt');
    return this._channelAnalyticsService.finalizeCapture(
      request.candidate.organizationId,
      request.candidate.id,
      snapshotAt,
      request.mode,
      request.mode === 'daily' ? utcDay(snapshotAt) : undefined
    );
  }

  @ActivityMethod()
  recordCandidateFailure(request: {
    candidate: ChannelAnalyticsSnapshotCandidate;
    message?: string;
  }) {
    return this._channelAnalyticsService.recordFailure(
      request.candidate.organizationId,
      request.candidate.id,
      'capture',
      (request.message || 'Analytics capture failed').slice(0, 256)
    );
  }

  private getIntegration(candidate: ChannelAnalyticsSnapshotCandidate) {
    return this._integrationService.getIntegrationById(
      candidate.organizationId,
      candidate.id
    );
  }

  private isActiveSocialIntegration(integration: Integration | null) {
    return (
      !!integration &&
      integration.type === 'social' &&
      !integration.disabled &&
      !integration.deletedAt
    );
  }

  private async capturePage(
    integration: Integration,
    provider: SocialProvider,
    snapshotAt: Date,
    cursor?: string,
    forceRefresh = false
  ): Promise<ChannelAnalyticsCapturePage> {
    const liveIntegration = await this.withRefreshedToken(
      integration,
      provider,
      forceRefresh
    );
    try {
      const toDay = utcDay(snapshotAt);
      const fromDay = new Date(toDay);
      fromDay.setUTCDate(fromDay.getUTCDate() - (CAPTURE_WINDOW_DAYS - 1));
      return await provider.analyticsSnapshot!.capture({
        integration: liveIntegration,
        accessToken: liveIntegration.token,
        snapshotAt,
        fromDay,
        toDay,
        pageSize: PROVIDER_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      });
    } catch (error) {
      if (error instanceof RefreshToken && !forceRefresh) {
        return this.capturePage(
          integration,
          provider,
          snapshotAt,
          cursor,
          true
        );
      }
      throw error;
    }
  }

  private async withRefreshedToken(
    integration: Integration,
    provider: SocialProvider,
    forceRefresh = false
  ) {
    const liveIntegration = { ...integration };
    if (
      forceRefresh ||
      (!!liveIntegration.tokenExpiration &&
        dayjs(liveIntegration.tokenExpiration).isBefore(dayjs()))
    ) {
      const refreshed = await this._refreshIntegrationService.refresh(
        liveIntegration
      );
      if (!refreshed || !refreshed.accessToken) {
        throw new Error('Integration token refresh failed');
      }
      liveIntegration.token = refreshed.accessToken;
      if (provider.refreshWait) await timer(10000);
    }
    return liveIntegration;
  }

  private parseTimestamp(value: string, field: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${field} must be a valid timestamp`);
    }
    return parsed;
  }
}

const utcDay = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );

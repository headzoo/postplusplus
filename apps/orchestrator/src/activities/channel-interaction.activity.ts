import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import dayjs from 'dayjs';
import { ChannelInteractionRepository } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.repository';
import { ChannelInteractionService } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  ChannelInteractionWindow,
  FollowerPage,
  FollowerQuery,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { Integration } from '@prisma/client';
import { timer } from '@gitroom/helpers/utils/timer';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';

export type ChannelInteractionMaintenanceCandidate = {
  id: string;
  organizationId: string;
  maintenance: 'active' | 'cleanup';
};

@Injectable()
@Activity()
export class ChannelInteractionActivity {
  constructor(
    private _repository: ChannelInteractionRepository,
    private _channelInteractionService: ChannelInteractionService,
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _notificationService: NotificationService
  ) {}

  @ActivityMethod()
  listCandidates(after?: string) {
    return this._repository.listMaintenanceCandidates(after);
  }

  @ActivityMethod()
  async reconcileSubscriptions(
    candidate: ChannelInteractionMaintenanceCandidate
  ) {
    const integration = await this.getIntegration(candidate);
    if (!integration) return { supported: false };

    let provider: SocialProvider;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      return { supported: false };
    }
    const capability = provider.channelInteractionWebhooks;
    if (!capability) return { supported: false };

    const liveIntegration = await this.withRefreshedToken(
      integration,
      provider
    );
    if (!integration.disabled && !integration.deletedAt) {
      await this._channelInteractionService.requestReconciliation(
        liveIntegration
      );
    }
    const result = await capability.reconcileSubscriptions(
      liveIntegration,
      liveIntegration.token,
      await this._channelInteractionService.getInteractionAuthorizationToken(
        liveIntegration
      )
    );
    const newlyFailed = await this._repository.applySubscriptionReconciliation(
      candidate.organizationId,
      candidate.id,
      result,
      integration.disabled || !!integration.deletedAt
    );
    if (newlyFailed.length && !integration.disabled && !integration.deletedAt) {
      const failedLabels = newlyFailed
        .map((item) => item.replace(':', ' · '))
        .join(', ');
      const channelLabel =
        integration.profile ||
        integration.name ||
        integration.providerIdentifier;
      await this._notificationService.inAppNotification(
        candidate.organizationId,
        'Interaction tracking needs attention',
        `${channelLabel}: tracking setup failed for ${failedLabels}. Open Settings → Channels to review the provider error and reconnect if needed.`,
        false,
        false,
        'fail'
      );
    }
    return { supported: true, state: result.state };
  }

  @ActivityMethod()
  async beginFollowerSync(candidate: ChannelInteractionMaintenanceCandidate) {
    const integration = await this.getIntegration(candidate);
    if (!this.isActiveSocialIntegration(integration))
      return { supported: false };
    try {
      const provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
      if (!provider.followers) return { supported: false };
    } catch {
      return { supported: false };
    }
    return {
      supported: true,
      generation: await this._channelInteractionService.beginFollowerSync(
        candidate.organizationId,
        candidate.id
      ),
    };
  }

  @ActivityMethod()
  async fetchAndApplyFollowerPage(request: {
    candidate: ChannelInteractionMaintenanceCandidate;
    generation: string;
    cursor?: string;
  }) {
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
      throw new Error('Follower provider is unavailable');
    }
    if (!provider.followers) throw new Error('Followers are unavailable');

    const page = await this.getFollowerPage(integration, provider, {
      limit: 100,
      ...(request.cursor ? { cursor: request.cursor } : {}),
    });
    await this._channelInteractionService.applyFollowerSync(
      request.candidate.organizationId,
      request.candidate.id,
      request.generation,
      page.items
    );
    return {
      hasMore: page.hasMore,
      ...(page.hasMore && page.nextCursor
        ? { nextCursor: page.nextCursor }
        : {}),
    };
  }

  @ActivityMethod()
  completeFollowerSync(request: {
    candidate: ChannelInteractionMaintenanceCandidate;
    generation: string;
  }) {
    return this._channelInteractionService.completeFollowerSync(
      request.candidate.organizationId,
      request.candidate.id,
      request.generation
    );
  }

  @ActivityMethod()
  abortFollowerSync(request: {
    candidate: ChannelInteractionMaintenanceCandidate;
    generation: string;
  }) {
    return this._channelInteractionService.failFollowerSync(
      request.candidate.organizationId,
      request.candidate.id,
      request.generation
    );
  }

  @ActivityMethod()
  rebuildWindow(request: {
    candidate: ChannelInteractionMaintenanceCandidate;
    window: ChannelInteractionWindow;
  }) {
    return this.rebuildActiveWindow(request);
  }

  private async rebuildActiveWindow(request: {
    candidate: ChannelInteractionMaintenanceCandidate;
    window: ChannelInteractionWindow;
  }) {
    const integration = await this.getIntegration(request.candidate);
    if (!this.isActiveSocialIntegration(integration)) return { skipped: true };
    return this._channelInteractionService.rebuildWindowSummary(
      request.candidate.organizationId,
      request.candidate.id,
      request.window
    );
  }

  private getIntegration(candidate: ChannelInteractionMaintenanceCandidate) {
    return this._integrationService.getIntegrationById(
      candidate.organizationId,
      candidate.id
    );
  }

  private isActiveSocialIntegration(integration: Integration | null) {
    return !!integration && !integration.disabled && !integration.deletedAt;
  }

  private async getFollowerPage(
    integration: Integration,
    provider: SocialProvider,
    query: FollowerQuery,
    forceRefresh = false
  ): Promise<FollowerPage> {
    const liveIntegration = await this.withRefreshedToken(
      integration,
      provider,
      forceRefresh
    );
    try {
      return await provider.followers!(
        liveIntegration,
        liveIntegration.token,
        query
      );
    } catch (error) {
      if (error instanceof RefreshToken && !forceRefresh) {
        return this.getFollowerPage(integration, provider, query, true);
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
}

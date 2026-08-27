import { Injectable, Logger } from '@nestjs/common';
import {
  Activity,
  ActivityMethod,
  TemporalService,
} from 'nestjs-temporal-core';
import dayjs from 'dayjs';
import { ChannelInteractionRepository } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.repository';
import { ChannelInteractionService } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { SocialProvider } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { Integration } from '@prisma/client';
import { timer } from '@gitroom/helpers/utils/timer';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';
import {
  LEAD_BRIDGE_ADMIN_BURST_MIN_APPLIED,
  LEAD_BRIDGE_WORKFLOW_ID,
  LEAD_BRIDGE_WORKFLOW_TYPE,
} from '@gitroom/nestjs-libraries/temporal/lead-bridge.schedule';

export type ChannelLeadBridgeCandidate = {
  id: string;
  organizationId: string;
  providerIdentifier: string;
};

@Injectable()
@Activity()
export class ChannelLeadBridgeActivity {
  private readonly _logger = new Logger(ChannelLeadBridgeActivity.name);

  constructor(
    private _repository: ChannelInteractionRepository,
    private _channelInteractionService: ChannelInteractionService,
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _adminScheduleLogService: AdminScheduleLogService,
    private _temporalService: TemporalService
  ) {}

  @ActivityMethod()
  async listDueCandidatesV1(request: { after?: string } = {}) {
    const result = await this._repository.listLeadBridgeCrawlCandidates(
      request.after,
      8
    );
    const candidates: ChannelLeadBridgeCandidate[] = [];
    for (const candidate of result.candidates) {
      try {
        const provider = this._integrationManager.getSocialIntegration(
          candidate.providerIdentifier
        );
        if (provider.memberFollowers) {
          candidates.push({
            id: candidate.id,
            organizationId: candidate.organizationId,
            providerIdentifier: candidate.providerIdentifier,
          });
        }
      } catch {
        // Provider not registered; skip.
      }
      if (candidates.length >= 1) {
        break;
      }
    }
    if (!candidates.length) {
      this._logger.log(
        `Lead bridge scan found no eligible channels (scanned ${
          result.candidates.length
        }, after=${request.after ?? 'start'})`
      );
      await this._adminScheduleLogService.append({
        scheduleKey: 'lead-bridge',
        message: `Lead bridge scan found no eligible channels (scanned ${result.candidates.length})`,
        meta: {
          scanned: result.candidates.length,
          after: request.after ?? null,
        },
      });
    } else {
      await this._adminScheduleLogService.append({
        scheduleKey: 'lead-bridge',
        message: `Lead bridge selected channel ${candidates[0].id} (${candidates[0].providerIdentifier})`,
        meta: {
          integrationId: candidates[0].id,
          providerIdentifier: candidates[0].providerIdentifier,
          scanned: result.candidates.length,
        },
      });
    }
    return {
      candidates,
      scanned: result.candidates.length,
      next: result.next,
    };
  }

  @ActivityMethod()
  async crawlNextWarmFollowerV1(request: {
    candidate: ChannelLeadBridgeCandidate;
  }) {
    const integration = await this.getIntegration(request.candidate);
    if (!integration || integration.disabled || integration.deletedAt) {
      return { skipped: true as const, processed: 0, applied: 0 };
    }
    let provider: SocialProvider;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      return { skipped: true as const, processed: 0, applied: 0 };
    }
    if (!provider.memberFollowers) {
      return { skipped: true as const, processed: 0, applied: 0 };
    }
    const live = await this.withRefreshedToken(integration, provider);
    const result =
      await this._channelInteractionService.crawlLeadBridgesForIntegration(
        live
      );
    this._logger.log(
      `Lead bridge crawl for integration ${live.id} (${
        integration.providerIdentifier
      }): ${JSON.stringify(result)}`
    );
    await this._adminScheduleLogService.append({
      scheduleKey: 'lead-bridge',
      message: `Lead bridge crawl for ${live.id} (${integration.providerIdentifier})`,
      meta: { integrationId: live.id, result },
    });
    try {
      const backfill =
        await this._channelInteractionService.scoreUnscoredLeadsForIntegration({
          organizationId: live.organizationId,
          integrationId: live.id,
        });
      this._logger.log(
        `Lead fit scoring for integration ${live.id}: scored ${backfill.scored}/${backfill.candidates} unscored lead(s)`
      );
      await this._adminScheduleLogService.append({
        scheduleKey: 'lead-bridge',
        message: `Lead fit scoring for ${live.id}: scored ${backfill.scored}/${backfill.candidates}`,
        meta: {
          integrationId: live.id,
          scored: backfill.scored,
          candidates: backfill.candidates,
        },
      });
    } catch (error) {
      // Fit scoring is best-effort; discovery already succeeded.
      this._logger.error(
        `Lead fit scoring failed for integration ${live.id}`,
        error instanceof Error ? error.stack : String(error)
      );
      await this._adminScheduleLogService.append({
        scheduleKey: 'lead-bridge',
        level: 'ERROR',
        message: `Lead fit scoring failed for ${live.id}`,
        meta: {
          integrationId: live.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
    return result;
  }

  @ActivityMethod()
  async clearDiscoveredLeadsV1() {
    const result =
      await this._channelInteractionService.clearAllDiscoveredLeadsForAdminBurst();
    this._logger.log(
      `Lead discovery admin clear: bridges=${result.bridgesDeleted} orphans=${result.orphansDeleted} redis=${result.redisKeysDeleted}`
    );
    await this._adminScheduleLogService.append({
      scheduleKey: 'lead-bridge',
      message: `Lead discovery cleared ${result.bridgesDeleted} bridge(s) and ${result.orphansDeleted} orphan lead(s)`,
      meta: result,
    });
    return result;
  }

  @ActivityMethod()
  async crawlNextWarmFollowerBurstV1(
    request: {
      after?: string;
      maxApplied?: number;
    } = {}
  ) {
    const listed = await this.listDueCandidatesV1({ after: request.after });
    const candidate = listed.candidates[0] as
      | ChannelLeadBridgeCandidate
      | undefined;
    if (!candidate) {
      return {
        exhausted: true as const,
        applied: 0,
        candidateId: undefined as string | undefined,
      };
    }

    const integration = await this.getIntegration(candidate);
    if (!integration || integration.disabled || integration.deletedAt) {
      return {
        exhausted: false as const,
        applied: 0,
        candidateId: candidate.id,
      };
    }
    let provider: SocialProvider;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      return {
        exhausted: false as const,
        applied: 0,
        candidateId: candidate.id,
      };
    }
    if (!provider.memberFollowers) {
      return {
        exhausted: false as const,
        applied: 0,
        candidateId: candidate.id,
      };
    }

    const live = await this.withRefreshedToken(integration, provider);
    const maxApplied = Math.max(
      1,
      request.maxApplied ?? LEAD_BRIDGE_ADMIN_BURST_MIN_APPLIED
    );
    const result =
      await this._channelInteractionService.crawlLeadBridgesForIntegration(
        live,
        {
          ignoreDailyLimit: true,
          maxApplied,
        }
      );
    this._logger.log(
      `Lead discovery burst crawl for ${live.id} (${
        integration.providerIdentifier
      }): ${JSON.stringify(result)}`
    );
    await this._adminScheduleLogService.append({
      scheduleKey: 'lead-bridge',
      message: `Lead discovery burst crawl for ${live.id} (${integration.providerIdentifier}) applied ${result.applied}`,
      meta: { integrationId: live.id, result },
    });
    return {
      exhausted: false as const,
      applied: result.applied || 0,
      candidateId: candidate.id,
    };
  }

  @ActivityMethod()
  async resumeIdleLeadBridgeV1(request: {
    applied: number;
    reachedTarget: boolean;
  }) {
    const workflow = this._temporalService.client?.getRawClient()?.workflow;
    if (!workflow) {
      throw new Error(
        'Temporal workflow client unavailable during lead bridge resume'
      );
    }
    try {
      await workflow.start(LEAD_BRIDGE_WORKFLOW_TYPE, {
        workflowId: LEAD_BRIDGE_WORKFLOW_ID,
        taskQueue: 'main',
        args: [{}],
      });
    } catch (error) {
      const value = error as { name?: string; message?: string };
      const alreadyStarted =
        value?.name === 'WorkflowExecutionAlreadyStartedError' ||
        !!value?.message?.toLowerCase().includes('already started');
      if (!alreadyStarted) {
        throw error;
      }
    }
    try {
      await workflow
        .getHandle(LEAD_BRIDGE_WORKFLOW_ID)
        .signal('channelLeadBridge');
    } catch (error) {
      this._logger.warn(
        'Idle lead bridge workflow was not poked after admin burst',
        error
      );
    }

    const message = request.reachedTarget
      ? `Lead discovery burst finished with ${request.applied} new lead(s); idle workflow resumed`
      : `Lead discovery burst stopped at ${request.applied} lead(s) before reaching ${LEAD_BRIDGE_ADMIN_BURST_MIN_APPLIED}; idle workflow resumed`;
    await this._adminScheduleLogService.append({
      scheduleKey: 'lead-bridge',
      level: request.reachedTarget ? 'INFO' : 'WARN',
      message,
      meta: {
        applied: request.applied,
        target: LEAD_BRIDGE_ADMIN_BURST_MIN_APPLIED,
        reachedTarget: request.reachedTarget,
        workflowId: LEAD_BRIDGE_WORKFLOW_ID,
      },
    });
    return { resumed: true as const, ...request };
  }

  private getIntegration(candidate: ChannelLeadBridgeCandidate) {
    return this._integrationService.getIntegrationById(
      candidate.organizationId,
      candidate.id
    );
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
      try {
        const refreshed = await this._refreshIntegrationService.refresh(
          liveIntegration
        );
        if (!refreshed || !refreshed.accessToken) {
          throw new Error('Integration token refresh failed');
        }
        liveIntegration.token = refreshed.accessToken;
        if (provider.refreshWait) {
          await timer(10000);
        }
      } catch (error) {
        if (error instanceof RefreshToken && !forceRefresh) {
          return this.withRefreshedToken(integration, provider, true);
        }
        throw error;
      }
    }
    return liveIntegration;
  }
}

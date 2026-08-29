import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ChannelAudienceMembership as PrismaAudienceMembership,
  ChannelInteractionDirection as PrismaInteractionDirection,
  ChannelInteractionKind as PrismaInteractionKind,
  ChannelInteractionWindow as PrismaInteractionWindow,
} from '@prisma/client';
import {
  ChannelInteractionAuthorizationGrant,
  ChannelInteractionDirection,
  ChannelInteractionKind,
  ChannelInteractionPostSnapshot,
  ChannelInteractionWindow,
  ChannelWebhookChallengeRequest,
  ChannelWebhookDeliveryRequest,
  Follower,
  NormalizedChannelContentEvent,
  NormalizedChannelInteractionEvent,
  PostLiker,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  FOLLOWER_SEGMENT_COLORS,
  FollowerSegmentColorValue,
} from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';
import { Integration } from '@prisma/client';
import { LogsService } from '@gitroom/nestjs-libraries/database/prisma/logs/logs.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import {
  eventEndpoints,
  integrationIdentity,
  logEventType,
} from '@gitroom/nestjs-libraries/database/prisma/logs/http-log.serialize';
import { PostsRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository';
import {
  OpenaiService,
  TriageRerankInput,
} from '@gitroom/nestjs-libraries/openai/openai.service';
import { ContextDocumentService } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.service';
import {
  AudienceProfile,
  ChannelInteractionRepository,
  DesiredInteractionSubscription,
  HotPickInput,
  CultivatePickInput,
  RelationshipGradeBatch,
  RelationshipGradeSnapshotInput,
  RelationshipGradeStrategySelection,
  utcHourKey,
} from './channel-interaction.repository';
import {
  MANUAL_TRIAGE_PICK_REASON,
  MANUAL_TRIAGE_PICK_SOURCE,
} from './follower-column-pin';
import {
  classifyHotPickVisibility,
  HotPickAuditMember,
  trimHotPickAuditForLog,
} from './hot-pick-audit';
import {
  classifyCultivatePickVisibility,
  CultivatePickAuditMember,
  trimCultivatePickAuditForLog,
} from './cultivate-pick-audit';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';
import {
  applyPersonalRelationshipGrade,
  applyHotTriageMembershipGate,
  BOT_FORMULA_VERSION,
  calculateBotGrade,
  getChannelInteractionScore,
  isPersonalRelationshipGrade,
} from './channel-interaction.scoring';
import {
  calculateRelationshipGrade as calculateStrategyRelationshipGrade,
  createRelationshipInteractionCounts,
  scoreInteractionCounts,
} from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.scoring';
import {
  resolveChannelStrategy,
  resolveMaterializationConfig,
} from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.registry';
import {
  ChannelStrategy,
  ChannelStrategyId,
  RelationshipScoringProfile,
  StrategyScoringInput,
  TriagePipelineKind,
} from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.types';
import {
  selectExpertiseForTriage,
  SelectedExpertise,
} from '@gitroom/nestjs-libraries/channel-strategies/expertise.registry';
import { RelationshipGradeScheduleConfig } from '@gitroom/nestjs-libraries/temporal/relationship-grade.schedule';
import {
  LEAD_BRIDGE_DAILY_LIMIT,
  LEAD_BRIDGE_PAGE_SIZE,
  LEAD_BRIDGE_PER_SOURCE_CAP,
  LEAD_FIT_BACKFILL_LIMIT,
  LEAD_FIT_FEEDBACK_EXAMPLE_LIMIT,
  leadBridgeCursorKey,
  leadBridgeDailyCountKey,
  leadBridgeDailyTtlSeconds,
} from '@gitroom/nestjs-libraries/temporal/lead-bridge.schedule';
import { parseSkillFilename } from '@gitroom/nestjs-libraries/upload/context-document.upload.validation';
import { utcDayKey } from '@gitroom/nestjs-libraries/temporal/cultivate.schedule';
import { ConversionEvaluationTriggerService } from '@gitroom/nestjs-libraries/temporal/conversion-evaluation.trigger.service';

export {
  applyPersonalRelationshipGrade,
  applyHotTriageMembershipGate,
  calculateBotGrade,
  calculateRelationshipGrade,
  getChannelInteractionScore,
  getRelationshipTriage,
  scoreToStars,
} from './channel-interaction.scoring';

const MAX_DELIVERY_EVENTS = 500;
const MAX_METADATA_ENTRIES = 32;
const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;
const MAX_ID_LENGTH = 512;
const MAX_PROFILE_TEXT_LENGTH = 4096;
const MAX_METADATA_VALUE_LENGTH = 2048;
const MAX_AUDIENCE_NOTE_LENGTH = 4096;
const MAX_POST_CONTENT_LENGTH = 100000;
const MAX_SNAPSHOT_CONTENT_LENGTH = 10000;
const MAX_SNAPSHOT_MEDIA = 8;
// Renew tracking grants a little early so a reconciliation pass never starts
// with a token that expires mid-flight.
const AUTHORIZATION_REFRESH_SKEW_MS = 60 * 1000;
const AUTHORIZATION_REFRESH_LOCK_SECONDS = 60;
const LIKER_SYNC_PAUSE_FALLBACK_SECONDS = 15 * 60;
const TRIAGE_DOCUMENT_MAX_COUNT = 8;
const TRIAGE_DOCUMENT_MAX_CONTENT_LENGTH = 6_000;
const TRIAGE_REASON_MAX_LENGTH = 280;
const TRIAGE_CANDIDATE_NAME_MAX_LENGTH = 160;
const TRIAGE_CANDIDATE_USERNAME_MAX_LENGTH = 160;
const TRIAGE_CANDIDATE_BIO_MAX_LENGTH = 1_000;
const TRIAGE_CANDIDATE_RULES_REASON_MAX_LENGTH = 500;
const likerSyncPauseKey = (integrationId: string) =>
  `channel-interaction-liker-sync:${integrationId}`;

function getProviderErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const err = error as {
    code?: unknown;
    status?: unknown;
    rateLimitError?: unknown;
    response?: { status?: unknown };
  };
  const candidates = [err.code, err.status, err.response?.status];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return err.rateLimitError === true ? 429 : undefined;
}

function getProviderRateLimitResetMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const reset = (error as { rateLimit?: { reset?: unknown } }).rateLimit?.reset;
  if (typeof reset !== 'number' || !Number.isFinite(reset) || reset <= 0) {
    return undefined;
  }
  // twitter-api-v2 exposes reset as unix seconds.
  return reset > 1e12 ? reset : reset * 1000;
}

function formatProviderError(error: unknown): string {
  const status = getProviderErrorStatus(error);
  const message = error instanceof Error ? error.message : 'unknown error';
  return status ? `${message} (${status})` : message;
}

function isProviderRateLimitError(error: unknown): boolean {
  return getProviderErrorStatus(error) === 429;
}

const KIND_MAP: Record<ChannelInteractionKind, PrismaInteractionKind> = {
  like: PrismaInteractionKind.LIKE,
  reply: PrismaInteractionKind.REPLY,
  repost: PrismaInteractionKind.REPOST,
  follow: PrismaInteractionKind.FOLLOW,
  mention: PrismaInteractionKind.MENTION,
};

const DIRECTION_MAP: Record<
  ChannelInteractionDirection,
  PrismaInteractionDirection
> = {
  inbound: PrismaInteractionDirection.INBOUND,
  outbound: PrismaInteractionDirection.OUTBOUND,
};

const MEMBERSHIP_MAP = {
  follower: PrismaAudienceMembership.FOLLOWER,
  not_follower: PrismaAudienceMembership.NOT_FOLLOWER,
  unknown: PrismaAudienceMembership.UNKNOWN,
} as const;

const WINDOW_MAP: Record<
  ChannelInteractionWindow,
  {
    prisma: PrismaInteractionWindow;
    days: number;
  }
> = {
  week: { prisma: PrismaInteractionWindow.WEEK, days: 7 },
  month: { prisma: PrismaInteractionWindow.MONTH, days: 30 },
  '90_day': { prisma: PrismaInteractionWindow.NINETY_DAY, days: 90 },
  year: { prisma: PrismaInteractionWindow.YEAR, days: 365 },
};

@Injectable()
export class ChannelInteractionService {
  private readonly _logger = new Logger(ChannelInteractionService.name);

  constructor(
    private _repository: ChannelInteractionRepository,
    private _integrationManager?: IntegrationManager,
    private _logsService?: LogsService,
    private _postsRepository?: PostsRepository,
    private _openaiService?: OpenaiService,
    private _contextDocumentService?: ContextDocumentService,
    @Optional() private _adminScheduleLogService?: AdminScheduleLogService,
    @Optional()
    private _conversionEvaluationTrigger?: ConversionEvaluationTriggerService
  ) {}

  async handleChallenge(
    providerIdentifier: string,
    request: ChannelWebhookChallengeRequest
  ) {
    const capability = this.getWebhookCapability(providerIdentifier);
    const result = await capability.verifyChallenge(request);
    await this.logInboundRequest({
      providerIdentifier,
      method: 'GET',
      requestHeaders: request.query,
      requestBody: request.query,
      statusCode: result.accepted
        ? 200
        : ('statusCode' in result && result.statusCode) || 400,
      responseBody: result.accepted ? result.responseBody : undefined,
      error: result.accepted ? undefined : 'Channel webhook challenge rejected',
    });
    return { ...result, logged: true };
  }

  async handleDelivery(
    providerIdentifier: string,
    request: ChannelWebhookDeliveryRequest
  ) {
    const capability = this.getWebhookCapability(providerIdentifier);
    const delivery = await capability.verifyAndNormalizeDelivery(request);
    const connectedAccountId = delivery.accepted
      ? delivery.connectedAccountId
      : this.peekConnectedAccountId(request.rawBody);
    const matchedIntegrations = connectedAccountId
      ? await this._repository.getActiveIntegrationsForAccount(
          providerIdentifier,
          connectedAccountId
        )
      : [];

    if (delivery.accepted) {
      try {
        await Promise.all(
          matchedIntegrations.map((integration) =>
            this.recordNormalizedDelivery(
              integration.organizationId,
              integration.id,
              delivery.events
            )
          )
        );
      } catch {
        /** persist the inspectable log even if event recording fails */
      }
      try {
        await Promise.all(
          matchedIntegrations.map((integration) =>
            this.applyContentEvents(
              integration.organizationId,
              integration.id,
              providerIdentifier,
              delivery.contentEvents || []
            )
          )
        );
      } catch {
        /** persist the inspectable log even if calendar import fails */
      }
    }

    await this.logInboundRequest({
      providerIdentifier,
      method: 'POST',
      integrations: await this.resolveLogIntegrations(
        providerIdentifier,
        connectedAccountId,
        matchedIntegrations
      ),
      events: delivery.accepted ? delivery.events : undefined,
      requestHeaders: request.headers,
      requestBody: request.rawBody,
      statusCode: delivery.accepted
        ? 200
        : ('statusCode' in delivery && delivery.statusCode) || 400,
      responseBody: delivery.accepted ? { ok: true } : undefined,
      error: delivery.accepted
        ? undefined
        : 'Channel webhook delivery rejected',
    });
    return { ...delivery, logged: true };
  }

  async logInboundAttempt(input: {
    providerIdentifier: string;
    method: string;
    requestHeaders?: unknown;
    requestBody?: unknown;
    statusCode: number;
    error: string;
  }) {
    const connectedAccountId = Buffer.isBuffer(input.requestBody)
      ? this.peekConnectedAccountId(input.requestBody)
      : undefined;
    await this.logInboundRequest({
      providerIdentifier: input.providerIdentifier,
      method: input.method,
      integrations: await this.resolveLogIntegrations(
        input.providerIdentifier,
        connectedAccountId
      ),
      requestHeaders: input.requestHeaders,
      requestBody: input.requestBody,
      statusCode: input.statusCode,
      error: input.error,
    });
  }

  statusFromError(error: unknown) {
    if (error instanceof HttpException) {
      return error.getStatus();
    }
    return 500;
  }

  messageFromError(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        typeof (response as { message: unknown }).message === 'string'
      ) {
        return (response as { message: string }).message;
      }
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Channel webhook request failed';
  }

  private peekConnectedAccountId(rawBody: Buffer) {
    try {
      const body = JSON.parse(rawBody.toString('utf8'));
      const userId = body?.data?.filter?.user_id;
      if (typeof userId === 'string' || typeof userId === 'number') {
        const value = String(userId);
        return value && value.length <= 512 ? value : undefined;
      }
    } catch {
      /** body is only used to attach a rejected delivery to an org */
    }
    return undefined;
  }

  private async resolveLogIntegrations(
    providerIdentifier: string,
    connectedAccountId?: string,
    matchedIntegrations?: Array<{
      id: string;
      organizationId: string;
      name?: string | null;
      profile?: string | null;
    }>
  ) {
    if (matchedIntegrations?.length) {
      return matchedIntegrations;
    }
    if (connectedAccountId) {
      const matched = await this._repository.getActiveIntegrationsForAccount(
        providerIdentifier,
        connectedAccountId
      );
      if (matched.length) {
        return matched;
      }
    }
    const providerIntegrations =
      await this._repository.getActiveIntegrationsForProvider(
        providerIdentifier
      );
    const orgIds = new Set(
      providerIntegrations.map((integration) => integration.organizationId)
    );
    // Only fall back when a single org owns this provider, so a hosted
    // multi-tenant deploy does not leak one account's payload to others.
    return orgIds.size === 1 ? providerIntegrations : [];
  }

  private async logInboundRequest(input: {
    providerIdentifier: string;
    method: string;
    integrations?: Array<{
      id: string;
      organizationId: string;
      name?: string | null;
      profile?: string | null;
    }>;
    events?: NormalizedChannelInteractionEvent[];
    requestHeaders?: unknown;
    requestBody?: unknown;
    statusCode: number;
    responseBody?: unknown;
    error?: string;
  }) {
    try {
      if (!this._logsService) {
        return;
      }
      const integrations =
        input.integrations ||
        (await this.resolveLogIntegrations(input.providerIdentifier));
      if (!integrations.length) {
        return;
      }
      const orgs = new Map<
        string,
        {
          id: string;
          organizationId: string;
          name?: string | null;
          profile?: string | null;
        }
      >();
      for (const integration of integrations) {
        if (!orgs.has(integration.organizationId)) {
          orgs.set(integration.organizationId, integration);
        }
      }
      const firstEvent = input.events?.[0];
      await Promise.all(
        [...orgs.entries()].map(([organizationId, integration]) => {
          const endpoints = firstEvent
            ? eventEndpoints(firstEvent, integration)
            : (() => {
                const target = integrationIdentity(
                  integration.name,
                  integration.profile
                );
                return {
                  targetDisplayName: target.displayName,
                  targetUsername: target.username,
                };
              })();
          return this._logsService!.logInboundWebhook({
            organizationId,
            integrationId: integration.id,
            method: input.method,
            url: `/channel-webhooks/${input.providerIdentifier}`,
            statusCode: input.statusCode,
            requestHeaders: input.requestHeaders,
            requestBody: input.requestBody,
            responseHeaders: { 'content-type': 'application/json' },
            responseBody: input.responseBody,
            error: input.error,
            eventType: logEventType(firstEvent),
            ...endpoints,
          });
        })
      );
    } catch {
      /** logging must never break webhook delivery */
    }
  }

  async requestReconciliation(integration: Integration) {
    const capability = this.getWebhookCapabilityOrUndefined(
      integration.providerIdentifier
    );
    if (!capability || integration.type !== 'social') {
      return false;
    }
    const desiredSubscriptions: DesiredInteractionSubscription[] = capability
      .getDesiredSubscriptions(integration)
      .map((subscription) => ({
        eventKey: subscription.eventKey,
        direction: DIRECTION_MAP[subscription.direction],
      }));
    await this._repository.requestSubscriptionReconciliation(
      integration.organizationId,
      integration.id,
      desiredSubscriptions
    );
    return true;
  }

  getInteractionAuthorizationCapability(providerIdentifier: string) {
    return this.getWebhookCapabilityOrUndefined(providerIdentifier)
      ?.authorization;
  }

  async startInteractionAuthorization(integration: Integration) {
    return this.requireAuthorizationCapability(integration).generateAuthUrl();
  }

  async completeInteractionAuthorization(
    integration: Integration,
    params: { code: string; codeVerifier: string }
  ) {
    const grant = await this.requireAuthorizationCapability(
      integration
    ).authenticate(params);
    await this.saveInteractionAuthorization(integration, grant);
    return true;
  }

  async getInteractionAuthorizationToken(integration: Integration) {
    const capability = this.getInteractionAuthorizationCapability(
      integration.providerIdentifier
    );
    if (!capability) {
      return undefined;
    }
    const stored = await this._repository.getInteractionAuthorization(
      integration.organizationId,
      integration.id
    );
    if (!stored) {
      return undefined;
    }
    if (this.isUsableAuthorization(stored)) {
      return stored.token;
    }
    if (!stored.refreshToken) {
      return undefined;
    }

    // Refresh tokens are single-use, so the reconciliation passes running in
    // the orchestrator and the backend must not renew the same grant at once.
    const lockKey = `channel-interaction-authorization:${integration.id}`;
    const reserved = await ioRedis.set(
      lockKey,
      '1',
      'EX',
      AUTHORIZATION_REFRESH_LOCK_SECONDS,
      'NX'
    );
    if (!reserved) {
      const renewed = await this._repository.getInteractionAuthorization(
        integration.organizationId,
        integration.id
      );
      return renewed && this.isUsableAuthorization(renewed)
        ? renewed.token
        : undefined;
    }
    try {
      const grant = await capability.refreshToken(stored.refreshToken);
      await this.saveInteractionAuthorization(integration, grant);
      return grant.accessToken;
    } catch {
      // The grant has to be renewed by the user; reconciliation reports it.
      await ioRedis.del(lockKey);
      return undefined;
    }
  }

  private isUsableAuthorization(authorization: {
    tokenExpiration: Date | null;
  }) {
    return (
      !authorization.tokenExpiration ||
      authorization.tokenExpiration.getTime() - AUTHORIZATION_REFRESH_SKEW_MS >
        Date.now()
    );
  }

  async hasInteractionAuthorization(integration: Integration) {
    if (
      !this.getInteractionAuthorizationCapability(
        integration.providerIdentifier
      )
    ) {
      return false;
    }
    return !!(await this._repository.getInteractionAuthorization(
      integration.organizationId,
      integration.id
    ));
  }

  private requireAuthorizationCapability(integration: Integration) {
    const capability = this.getInteractionAuthorizationCapability(
      integration.providerIdentifier
    );
    if (!capability) {
      throw new BadRequestException(
        'This channel does not require a tracking authorization'
      );
    }
    return capability;
  }

  private saveInteractionAuthorization(
    integration: Integration,
    grant: ChannelInteractionAuthorizationGrant
  ) {
    return this._repository.saveInteractionAuthorization(
      integration.organizationId,
      integration.id,
      {
        token: grant.accessToken,
        refreshToken: grant.refreshToken,
        tokenExpiration: grant.expiresIn
          ? new Date(Date.now() + grant.expiresIn * 1000)
          : undefined,
        scopes: grant.scopes?.join(' '),
      }
    );
  }

  async requestSubscriptionRemoval(integration: Integration) {
    if (
      integration.type !== 'social' ||
      !this.getWebhookCapabilityOrUndefined(integration.providerIdentifier)
    ) {
      return false;
    }
    await this._repository.markSubscriptionsForRemoval(
      integration.organizationId,
      integration.id
    );
    return true;
  }

  async recordNormalizedDelivery(
    organizationId: string,
    integrationId: string,
    events: NormalizedChannelInteractionEvent[]
  ) {
    if (!Array.isArray(events) || events.length > MAX_DELIVERY_EVENTS) {
      throw new BadRequestException(
        `A delivery may contain at most ${MAX_DELIVERY_EVENTS} events`
      );
    }
    const normalized = events.map((event) => this.validateEvent(event));
    let created = 0;
    let duplicates = 0;
    let membershipOnly = 0;
    const dirtyExternalIds = new Set<string>();

    for (const event of normalized) {
      if (
        event.kind === PrismaInteractionKind.FOLLOW &&
        event.membershipUpdate === PrismaAudienceMembership.NOT_FOLLOWER
      ) {
        await this._repository.applyMembershipUpdate(
          organizationId,
          integrationId,
          event.counterparty,
          PrismaAudienceMembership.NOT_FOLLOWER
        );
        membershipOnly++;
        continue;
      }
      const result = await this._repository.recordNormalizedEvent(
        organizationId,
        integrationId,
        event
      );
      if (result.created) {
        created++;
        dirtyExternalIds.add(event.counterparty.externalId);
      } else {
        duplicates++;
      }
    }
    if (dirtyExternalIds.size) {
      await this._conversionEvaluationTrigger?.signal();
      try {
        await this.refreshRelationshipGradeProjections(
          organizationId,
          integrationId,
          [...dirtyExternalIds]
        );
      } catch {
        /** Temporal remains the fallback if live projection refresh fails */
      }
    }
    return { created, duplicates, membershipOnly };
  }

  async isLikerSyncPausedForIntegration(integrationId: string) {
    return this.isLikerSyncPaused(integrationId);
  }

  async syncInboundLikesFromPosts(
    integration: Integration,
    postIds: string[],
    syncedAt = new Date()
  ): Promise<{
    created: number;
    duplicates: number;
    skipped: boolean;
    rateLimited?: boolean;
  }> {
    if (!this._integrationManager) {
      return { created: 0, duplicates: 0, skipped: true, rateLimited: false };
    }

    let provider: SocialProvider;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      return { created: 0, duplicates: 0, skipped: true, rateLimited: false };
    }

    if (!provider.postLikers) {
      return { created: 0, duplicates: 0, skipped: true, rateLimited: false };
    }

    if (await this.isLikerSyncPaused(integration.id)) {
      return { created: 0, duplicates: 0, skipped: true, rateLimited: true };
    }

    const uniquePostIds = [
      ...new Set(
        postIds.filter(
          (id) => typeof id === 'string' && id.length > 0 && id !== 'missing'
        )
      ),
    ].slice(0, MAX_DELIVERY_EVENTS);

    if (!uniquePostIds.length) {
      return { created: 0, duplicates: 0, skipped: false };
    }

    let created = 0;
    let duplicates = 0;
    let rateLimited = false;
    const dirtyExternalIds = new Set<string>();

    for (const postId of uniquePostIds) {
      let likers: PostLiker[];
      try {
        likers = await provider.postLikers(
          integration,
          integration.token,
          postId
        );
      } catch (error) {
        if (isProviderRateLimitError(error)) {
          const resetMs =
            getProviderRateLimitResetMs(error) ??
            Date.now() + LIKER_SYNC_PAUSE_FALLBACK_SECONDS * 1000;
          await this.pauseLikerSync(integration.id, resetMs);
          rateLimited = true;
          console.log(
            `Rate limited loading likers for ${
              integration.providerIdentifier
            }; paused until ${new Date(resetMs).toISOString()}`
          );
          break;
        }
        console.log(
          `Failed to load likers for ${
            integration.providerIdentifier
          } post ${postId}: ${formatProviderError(error)}`
        );
        continue;
      }

      if (!Array.isArray(likers)) {
        continue;
      }

      for (const liker of likers.slice(0, MAX_DELIVERY_EVENTS)) {
        if (!liker?.id) {
          continue;
        }
        const result = await this._repository.recordPolledInboundLike(
          integration.organizationId,
          integration.id,
          postId,
          {
            externalId: String(liker.id).slice(0, MAX_ID_LENGTH),
            ...(liker.name
              ? { name: String(liker.name).slice(0, MAX_PROFILE_TEXT_LENGTH) }
              : {}),
            ...(liker.username
              ? {
                  username: String(liker.username).slice(
                    0,
                    MAX_PROFILE_TEXT_LENGTH
                  ),
                }
              : {}),
            ...(liker.picture
              ? {
                  picture: String(liker.picture).slice(
                    0,
                    MAX_PROFILE_TEXT_LENGTH
                  ),
                }
              : {}),
            ...(liker.profileUrl
              ? {
                  profileUrl: String(liker.profileUrl).slice(
                    0,
                    MAX_PROFILE_TEXT_LENGTH
                  ),
                }
              : {}),
          },
          syncedAt
        );
        if (result.created) {
          created++;
          dirtyExternalIds.add(String(liker.id).slice(0, MAX_ID_LENGTH));
        } else {
          duplicates++;
        }
      }
    }

    if (dirtyExternalIds.size) {
      await this._conversionEvaluationTrigger?.signal();
      try {
        await this.refreshRelationshipGradeProjections(
          integration.organizationId,
          integration.id,
          [...dirtyExternalIds],
          syncedAt
        );
      } catch {
        /** Temporal remains the fallback if live projection refresh fails */
      }
    }

    return {
      created,
      duplicates,
      skipped: false,
      ...(rateLimited ? { rateLimited: true } : {}),
    };
  }

  private async isLikerSyncPaused(integrationId: string) {
    return !!(await ioRedis.get(likerSyncPauseKey(integrationId)));
  }

  private async pauseLikerSync(integrationId: string, resetMs: number) {
    const ttlSeconds = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
    await ioRedis.set(likerSyncPauseKey(integrationId), '1', 'EX', ttlSeconds);
  }

  private async refreshRelationshipGradeProjections(
    organizationId: string,
    integrationId: string,
    externalIds: string[],
    snapshotAt = new Date()
  ) {
    const uniqueIds = [...new Set(externalIds)].slice(0, MAX_DELIVERY_EVENTS);
    if (!uniqueIds.length) {
      return;
    }
    const batch = await this._repository.getRelationshipScoresForMembers(
      organizationId,
      integrationId,
      uniqueIds,
      snapshotAt
    );
    const snapshots = await this.scoreRelationshipBatch(batch);
    await this.updateRelationshipProjectionsWithHotLogging(
      organizationId,
      integrationId,
      snapshotAt,
      snapshots
    );
  }

  private appendHotTriageAdminLog(
    message: string,
    meta: Record<string, unknown>
  ) {
    void this._adminScheduleLogService
      ?.append({
        scheduleKey: 'hot-triage',
        message,
        meta,
      })
      .catch(() => {
        /** logging must never break follower flows */
      });
  }

  private appendCultivateAdminLog(
    message: string,
    meta: Record<string, unknown>
  ) {
    void this._adminScheduleLogService
      ?.append({
        scheduleKey: 'follower-cultivate',
        message,
        meta,
      })
      .catch(() => {
        /** logging must never break follower flows */
      });
  }

  private logHotTriageDismissed(params: {
    organizationId: string;
    integrationId: string;
    externalId: string;
    createdByUserId?: string;
    snooze: boolean;
  }) {
    const meta = {
      organizationId: params.organizationId,
      integrationId: params.integrationId,
      externalId: params.externalId,
      userId: params.createdByUserId ?? null,
      snooze: params.snooze,
    };
    this._logger.log(
      `[hot-triage] Hot triage dismissed integration=${
        params.integrationId
      } externalId=${params.externalId} user=${
        params.createdByUserId ?? 'unknown'
      } snooze=${params.snooze}`
    );
    this.appendHotTriageAdminLog(
      `Hot triage dismissed for ${params.externalId} on channel ${params.integrationId}`,
      meta
    );
  }

  private logHotEligibilityLost(params: {
    organizationId: string;
    integrationId: string;
    externalId: string;
    username: string | null;
    previousTriage: string | null;
    nextTriage: string | null;
  }) {
    const meta = {
      organizationId: params.organizationId,
      integrationId: params.integrationId,
      externalId: params.externalId,
      username: params.username,
      previousTriage: params.previousTriage,
      nextTriage: params.nextTriage,
    };
    this._logger.log(
      `[hot-triage] Hot eligibility lost integration=${
        params.integrationId
      } externalId=${params.externalId} was=${
        params.previousTriage ?? 'null'
      } now=${params.nextTriage ?? 'null'}`
    );
    this.appendHotTriageAdminLog(
      `Hot eligibility lost for ${params.externalId} on channel ${params.integrationId}`,
      meta
    );
  }

  private logCultivateDismissed(params: {
    organizationId: string;
    integrationId: string;
    externalId: string;
    createdByUserId?: string;
    snooze: boolean;
  }) {
    const meta = {
      organizationId: params.organizationId,
      integrationId: params.integrationId,
      externalId: params.externalId,
      userId: params.createdByUserId ?? null,
      snooze: params.snooze,
    };
    this._logger.log(
      `[follower-cultivate] Cultivate dismissed integration=${
        params.integrationId
      } externalId=${params.externalId} user=${
        params.createdByUserId ?? 'unknown'
      } snooze=${params.snooze}`
    );
    this.appendCultivateAdminLog(
      `Cultivate dismissed for ${params.externalId} on channel ${params.integrationId}`,
      meta
    );
  }

  private logCultivateEligibilityLost(params: {
    organizationId: string;
    integrationId: string;
    externalId: string;
    username: string | null;
    previousTriage: string | null;
    nextTriage: string | null;
    previousGrade: number | null;
    nextGrade: number | null;
  }) {
    const meta = {
      organizationId: params.organizationId,
      integrationId: params.integrationId,
      externalId: params.externalId,
      username: params.username,
      previousTriage: params.previousTriage,
      nextTriage: params.nextTriage,
      previousGrade: params.previousGrade,
      nextGrade: params.nextGrade,
    };
    this._logger.log(
      `[follower-cultivate] Cultivate eligibility lost integration=${
        params.integrationId
      } externalId=${params.externalId} was=${
        params.previousTriage ?? 'null'
      } now=${params.nextTriage ?? 'null'} grade=${
        params.previousGrade ?? 'null'
      }->${params.nextGrade ?? 'null'}`
    );
    this.appendCultivateAdminLog(
      `Cultivate eligibility lost for ${params.externalId} on channel ${params.integrationId}`,
      meta
    );
  }

  private toCultivateAuditMember(
    member: HotPickAuditMember
  ): CultivatePickAuditMember {
    return {
      externalId: member.externalId,
      username: member.username,
      membershipState: member.membershipState,
      ignoredAt: member.ignoredAt,
      isBot: member.isBot,
      relationshipTriage: member.relationshipTriage,
      relationshipGrade: member.relationshipGrade ?? null,
      lastOutboundAt: member.lastOutboundAt ?? null,
      triageIgnores: member.triageIgnores,
    };
  }

  private async updateRelationshipProjectionsWithHotLogging(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    snapshots: RelationshipGradeSnapshotInput[],
    options?: { force?: boolean }
  ) {
    if (!snapshots.length) {
      return this._repository.updateCurrentRelationshipProjections(
        organizationId,
        integrationId,
        snapshotAt,
        snapshots,
        options
      );
    }
    const before = await this._repository.getHotPickAuditMembers(
      organizationId,
      integrationId,
      snapshots.map((snapshot) => snapshot.externalId)
    );
    const result = options
      ? await this._repository.updateCurrentRelationshipProjections(
          organizationId,
          integrationId,
          snapshotAt,
          snapshots,
          options
        )
      : await this._repository.updateCurrentRelationshipProjections(
          organizationId,
          integrationId,
          snapshotAt,
          snapshots
        );
    for (const snapshot of snapshots) {
      const prior = before.get(snapshot.externalId);
      if (!prior) {
        continue;
      }
      const wasHotVisible = classifyHotPickVisibility(prior) === 'visible';
      const afterHotMember: HotPickAuditMember = {
        ...prior,
        relationshipTriage: snapshot.triage,
        relationshipReciprocationScore: snapshot.reciprocationScore,
        relationshipEffortScore: snapshot.effortScore,
      };
      if (
        wasHotVisible &&
        classifyHotPickVisibility(afterHotMember) !== 'visible'
      ) {
        this.logHotEligibilityLost({
          organizationId,
          integrationId,
          externalId: snapshot.externalId,
          username: prior.username,
          previousTriage: prior.relationshipTriage,
          nextTriage: snapshot.triage,
        });
      }

      const priorCultivate = this.toCultivateAuditMember(prior);
      const wasCultivateVisible =
        classifyCultivatePickVisibility(priorCultivate) === 'visible';
      const afterCultivate: CultivatePickAuditMember = {
        ...priorCultivate,
        relationshipTriage: snapshot.triage,
        relationshipGrade: snapshot.grade,
      };
      if (
        wasCultivateVisible &&
        classifyCultivatePickVisibility(afterCultivate) !== 'visible'
      ) {
        this.logCultivateEligibilityLost({
          organizationId,
          integrationId,
          externalId: snapshot.externalId,
          username: prior.username,
          previousTriage: prior.relationshipTriage,
          nextTriage: snapshot.triage,
          previousGrade: prior.relationshipGrade ?? null,
          nextGrade: snapshot.grade,
        });
      }
    }
    return result;
  }

  async beginFollowerSync(organizationId: string, integrationId: string) {
    const generation = randomUUID();
    await this._repository.beginFollowerSync(
      organizationId,
      integrationId,
      generation
    );
    return generation;
  }

  async applyFollowerSync(
    organizationId: string,
    integrationId: string,
    generation: string,
    followers: Follower[]
  ) {
    this.validateGeneration(generation);
    if (!Array.isArray(followers) || followers.length > MAX_DELIVERY_EVENTS) {
      throw new BadRequestException(
        `A follower sync page may contain at most ${MAX_DELIVERY_EVENTS} followers`
      );
    }
    const profiles = followers.map((follower) =>
      this.validateFollower(follower)
    );
    const engagementById = await this._repository.getAudienceBotScoreInputs(
      organizationId,
      integrationId,
      profiles.map((profile) => profile.externalId)
    );
    const gradedAt = new Date();
    const scoredProfiles = profiles.map((profile) => {
      const existing = engagementById.get(profile.externalId);
      const score = calculateBotGrade({
        name: profile.name,
        username: profile.username,
        picture: profile.picture,
        bio: profile.bio,
        followersCount: profile.followersCount,
        followingCount: profile.followingCount,
        accountCreatedAt: profile.accountCreatedAt,
        // Missing members and existing zero-count rows must score the same on
        // first sync: treat absent engagement projections as zero, not unknown.
        inboundInteractionCount: existing?.inboundInteractionCount ?? 0,
        noteCount: existing?.noteCount ?? 0,
        likesCount: existing?.likesCount ?? 0,
        relationshipEffortScore: existing?.relationshipEffortScore ?? null,
        relationshipReciprocationScore:
          existing?.relationshipReciprocationScore ?? null,
        now: gradedAt,
      });
      return {
        ...profile,
        botGrade: score.botGrade,
        isBot: score.isBot,
        botConfidence: score.botConfidence,
        botFormulaVersion: score.botFormulaVersion,
        botGradedAt: gradedAt,
      };
    });
    const applied = await this._repository.applyFollowerSyncPage(
      organizationId,
      integrationId,
      generation,
      scoredProfiles
    );
    if (!applied) {
      throw new ConflictException(
        'Follower sync generation is no longer active'
      );
    }
    if (scoredProfiles.length) {
      await this._conversionEvaluationTrigger?.signal();
    }
    return { applied: scoredProfiles.length };
  }

  async completeFollowerSync(
    organizationId: string,
    integrationId: string,
    generation: string,
    completedAt = new Date()
  ) {
    this.validateGeneration(generation);
    const completed = await this._repository.completeFollowerSync(
      organizationId,
      integrationId,
      generation,
      completedAt
    );
    if (!completed) {
      throw new ConflictException(
        'Follower sync generation is no longer active'
      );
    }
    await this._conversionEvaluationTrigger?.signal();
    return { generation, completedAt };
  }

  failFollowerSync(
    organizationId: string,
    integrationId: string,
    generation: string
  ) {
    this.validateGeneration(generation);
    return this._repository.failFollowerSync(
      organizationId,
      integrationId,
      generation
    );
  }

  rebuildWindowSummary(
    organizationId: string,
    integrationId: string,
    window: ChannelInteractionWindow,
    computedAt = new Date()
  ) {
    const definition = WINDOW_MAP[window];
    if (!definition) {
      throw new BadRequestException('Unsupported interaction window');
    }
    const cutoffAt = new Date(
      computedAt.getTime() - definition.days * 24 * 60 * 60 * 1000
    );
    return this._repository.rebuildWindowSummary(
      organizationId,
      integrationId,
      definition.prisma,
      randomUUID(),
      cutoffAt,
      computedAt
    );
  }

  async buildRelationshipGradeSnapshotBatch(
    organizationId: string,
    integrationId: string,
    snapshotAt = new Date(),
    cadence?: RelationshipGradeScheduleConfig
  ) {
    if (Number.isNaN(snapshotAt.getTime())) {
      throw new BadRequestException('snapshotAt must be a valid timestamp');
    }
    const batch = await this._repository.getDueRelationshipGradeBatch(
      organizationId,
      integrationId,
      snapshotAt,
      undefined,
      cadence
    );
    const snapshots = await this.scoreRelationshipBatch(batch);
    await this._repository.createRelationshipGradeSnapshots(
      organizationId,
      integrationId,
      snapshotAt,
      snapshots
    );
    return {
      snapshotAt,
      processed: snapshots.length,
      hasMore: await this._repository.hasDueRelationshipGradeMembers(
        organizationId,
        integrationId,
        snapshotAt,
        cadence
      ),
    };
  }

  async buildBotScoreBatch(organizationId: string, integrationId: string) {
    const gradedAt = new Date();
    const batch = await this._repository.getDueBotScoreBatch(
      organizationId,
      integrationId
    );
    const projections = batch.members.map((member) => {
      const score = calculateBotGrade({
        name: member.name,
        username: member.username,
        picture: member.picture,
        bio: member.bio,
        followersCount: member.followersCount,
        followingCount: member.followingCount,
        accountCreatedAt: member.accountCreatedAt,
        inboundInteractionCount: member.inboundInteractionCount,
        noteCount: member.noteCount,
        likesCount: member.likesCount,
        relationshipEffortScore: member.relationshipEffortScore,
        relationshipReciprocationScore: member.relationshipReciprocationScore,
        now: gradedAt,
      });
      return {
        externalId: member.externalId,
        botGrade: score.botGrade,
        isBot: score.isBot,
        botConfidence: score.botConfidence,
        botFormulaVersion: score.botFormulaVersion,
      };
    });
    await this._repository.updateBotScoreProjections(
      organizationId,
      integrationId,
      gradedAt,
      projections
    );
    return {
      gradedAt,
      processed: projections.length,
      hasMore: await this._repository.hasDueBotScoreMembers(
        organizationId,
        integrationId
      ),
    };
  }

  async clearAllDiscoveredLeadsForAdminBurst() {
    const result = await this._repository.clearAllDiscoveredLeads();
    const redisKeysDeleted =
      (await this.deleteRedisKeysByPattern('lead-bridge-crawl:*')) +
      (await this.deleteRedisKeysByPattern('lead-bridge-cursor:*'));
    return {
      ...result,
      redisKeysDeleted,
    };
  }

  private async deleteRedisKeysByPattern(pattern: string) {
    let cursor = '0';
    let deleted = 0;
    do {
      const [nextCursor, keys] = await ioRedis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = String(nextCursor);
      if (keys.length) {
        deleted += await ioRedis.del(...keys);
      }
    } while (cursor !== '0');
    return deleted;
  }

  async crawlLeadBridgesForIntegration(
    integration: Integration,
    options: {
      ignoreDailyLimit?: boolean;
      maxApplied?: number;
    } = {}
  ) {
    if (!this._integrationManager) {
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

    const day = utcDayKey();
    const countKey = leadBridgeDailyCountKey(integration.id, day);
    const used = Number((await ioRedis.get(countKey)) || '0');
    if (!options.ignoreDailyLimit && used >= LEAD_BRIDGE_DAILY_LIMIT) {
      return {
        skipped: true as const,
        processed: 0,
        applied: 0,
        rateLimited: true,
      };
    }

    const cursorKey = leadBridgeCursorKey(integration.id);
    const afterExternalId = (await ioRedis.get(cursorKey)) || undefined;
    const warm = await this._repository.getNextWarmFollowerForLeadBridge(
      integration.organizationId,
      integration.id,
      afterExternalId || undefined
    );
    if (!warm) {
      return { skipped: true as const, processed: 0, applied: 0 };
    }

    let page: Awaited<
      ReturnType<NonNullable<SocialProvider['memberFollowers']>>
    >;
    try {
      page = await provider.memberFollowers(
        integration,
        integration.token,
        warm.externalId,
        { limit: LEAD_BRIDGE_PAGE_SIZE }
      );
    } catch {
      await ioRedis.set(cursorKey, warm.externalId);
      return {
        skipped: false as const,
        processed: 0,
        applied: 0,
        failed: true,
      };
    }

    const leads = (page.items || []).map((item) => ({
      externalId: String(item.id).slice(0, MAX_ID_LENGTH),
      ...(item.name
        ? { name: String(item.name).slice(0, MAX_PROFILE_TEXT_LENGTH) }
        : {}),
      ...(item.username
        ? { username: String(item.username).slice(0, MAX_PROFILE_TEXT_LENGTH) }
        : {}),
      ...(item.picture
        ? { picture: String(item.picture).slice(0, MAX_PROFILE_TEXT_LENGTH) }
        : {}),
      ...(item.profileUrl
        ? {
            profileUrl: String(item.profileUrl).slice(
              0,
              MAX_PROFILE_TEXT_LENGTH
            ),
          }
        : {}),
      ...(item.bio
        ? { bio: String(item.bio).slice(0, MAX_PROFILE_TEXT_LENGTH) }
        : {}),
      ...(Number.isSafeInteger(item.followersCount)
        ? { followersCount: item.followersCount! }
        : {}),
      ...(Number.isSafeInteger(item.followingCount)
        ? { followingCount: item.followingCount! }
        : {}),
      ...(item.accountCreatedAt
        ? { accountCreatedAt: new Date(item.accountCreatedAt) }
        : {}),
    }));

    const deduped = new Map<string, (typeof leads)[number]>();
    for (const lead of leads) {
      if (!lead.externalId || lead.externalId === warm.externalId) {
        continue;
      }
      if (!deduped.has(lead.externalId)) {
        deduped.set(lead.externalId, lead);
      }
    }
    const rankedLeads = [...deduped.values()].sort((left, right) => {
      const leftBio = left.bio?.trim().length ?? 0;
      const rightBio = right.bio?.trim().length ?? 0;
      if (leftBio !== rightBio) {
        return rightBio - leftBio;
      }
      const leftFollowers = left.followersCount ?? -1;
      const rightFollowers = right.followersCount ?? -1;
      return rightFollowers - leftFollowers;
    });

    const maxApplied = Math.max(
      0,
      options.maxApplied ?? LEAD_BRIDGE_PER_SOURCE_CAP
    );
    const result = await this._repository.applyLeadBridgeDiscoveries({
      organizationId: integration.organizationId,
      integrationId: integration.id,
      bridgeExternalId: warm.externalId,
      bridgeRelationshipGrade: warm.relationshipGrade,
      leads: rankedLeads,
      maxApplied,
    });

    await ioRedis.set(cursorKey, warm.externalId);
    if (!options.ignoreDailyLimit) {
      const nextCount = await ioRedis.incr(countKey);
      if (nextCount === 1) {
        await ioRedis.expire(countKey, leadBridgeDailyTtlSeconds());
      }
    }

    return {
      skipped: false as const,
      processed: 1,
      applied: result.applied,
      skippedLeads: result.skipped,
      appliedExternalIds: result.appliedExternalIds,
      bridgeExternalId: warm.externalId,
    };
  }

  async scoreLeadFitBatch(params: {
    organizationId: string;
    integrationId: string;
    externalIds: string[];
  }) {
    if (!this._openaiService || !this._contextDocumentService) {
      this._logger.warn(
        `Lead fit scoring skipped for integration ${params.integrationId}: OpenAI or context-document service is not available`
      );
      return { scored: 0, skipped: params.externalIds.length };
    }
    const candidates = await this._repository.listUnscoredLeadExternalIds({
      organizationId: params.organizationId,
      integrationId: params.integrationId,
      externalIds: params.externalIds,
    });
    const scored = await this.scoreLeadCandidates(
      params.organizationId,
      params.integrationId,
      candidates
    );
    return {
      scored,
      skipped: Math.max(0, params.externalIds.length - scored),
    };
  }

  async scoreUnscoredLeadsForIntegration(params: {
    organizationId: string;
    integrationId: string;
    limit?: number;
  }) {
    if (!this._openaiService || !this._contextDocumentService) {
      this._logger.warn(
        `Lead fit backfill skipped for integration ${params.integrationId}: OpenAI or context-document service is not available`
      );
      return { scored: 0, candidates: 0 };
    }
    const config = await this.resolveTriageMaterializationConfig(
      params.organizationId,
      params.integrationId
    );
    const limit = params.limit ?? config.profile.lead.fitBackfillLimit;
    const candidates =
      await this._repository.listUnscoredLeadCandidatesForIntegration({
        organizationId: params.organizationId,
        integrationId: params.integrationId,
        limit,
      });
    if (!candidates.length) {
      return { scored: 0, candidates: 0 };
    }
    const scored = await this.scoreLeadCandidates(
      params.organizationId,
      params.integrationId,
      candidates
    );
    this._logger.log(
      `Lead fit backfill for integration ${params.integrationId}: scored ${scored}/${candidates.length} unscored lead(s)`
    );
    return { scored, candidates: candidates.length };
  }

  private async resolveTriageMaterializationConfig(
    organizationId: string,
    integrationId: string
  ) {
    const batch = await this._repository.getRelationshipScoresForMembers(
      organizationId,
      integrationId,
      [],
      new Date()
    );
    return resolveMaterializationConfig(batch.strategy?.strategyId);
  }

  private async buildTriagePromptContext(params: {
    organizationId: string;
    integrationId: string;
    strategyId: ChannelStrategyId;
    triage: TriagePipelineKind;
  }) {
    const strategy = resolveChannelStrategy(params.strategyId);
    let documents: Array<{ name: string; content: string }> = [];
    try {
      documents = this._contextDocumentService
        ? (
            await this._contextDocumentService.listAttachedDocumentsForIntegration(
              params.organizationId,
              params.integrationId
            )
          )
            .filter((document) => !parseSkillFilename(document.name))
            .sort((left, right) => left.name.localeCompare(right.name))
            .slice(0, TRIAGE_DOCUMENT_MAX_COUNT)
            .map((document) => ({
              name: document.name,
              content: document.content.slice(
                0,
                TRIAGE_DOCUMENT_MAX_CONTENT_LENGTH
              ),
            }))
        : [];
    } catch (error) {
      this._logger.warn(
        `Triage context documents unavailable for ${params.integrationId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    let expertise: readonly SelectedExpertise[] = [];
    try {
      expertise = selectExpertiseForTriage({
        strategyId: strategy.id,
        triage: params.triage,
      });
    } catch (error) {
      this._logger.warn(
        `Triage expertise unavailable for ${params.integrationId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    return {
      strategy: {
        id: strategy.id,
        version: strategy.version,
        summary: strategy.agent.summary.defaultValue,
        directives: [...strategy.agent.directives],
      },
      channelDocuments: documents,
      expertise: expertise.map((playbook) => ({
        name: playbook.name,
        content: playbook.content,
      })),
    };
  }

  private async scoreLeadCandidates(
    organizationId: string,
    integrationId: string,
    candidates: Array<{
      externalId: string;
      name: string | null;
      username: string | null;
      bio: string | null;
      followersCount: number | null;
      followingCount: number | null;
      leadBridgesAsLead: Array<{
        bridgeRelationshipGrade: number | null;
        bridgeMember: { username: string | null };
      }>;
    }>
  ) {
    if (!this._openaiService || !this._contextDocumentService) {
      return 0;
    }
    if (!candidates.length) {
      return 0;
    }
    const config = await this.resolveTriageMaterializationConfig(
      organizationId,
      integrationId
    );
    const context = await this.buildTriagePromptContext({
      organizationId,
      integrationId,
      strategyId: config.strategyId,
      triage: 'lead',
    });
    const channelDocuments = context.channelDocuments;
    if (!channelDocuments.length) {
      this._logger.warn(
        `Lead fit scoring for integration ${integrationId} has no attached channel documents; scores will be low-confidence`
      );
    }
    const feedbackExamples = await this._repository.listLeadFitFeedbackExamples(
      {
        organizationId,
        integrationId,
        limit: config.profile.lead.feedbackExampleLimit,
      }
    );
    const truncateBio = (bio: string | null) =>
      bio ? bio.slice(0, 500) : undefined;
    const toExample = (row: {
      name: string | null;
      username: string | null;
      bio: string | null;
      reasons: string[];
    }) => ({
      ...(row.name ? { name: row.name } : {}),
      ...(row.username ? { username: row.username } : {}),
      ...(truncateBio(row.bio) ? { bio: truncateBio(row.bio) } : {}),
      ...(row.reasons.length ? { reasons: row.reasons } : {}),
    });
    const rejectedExamples = feedbackExamples.rejected.map(toExample);
    const acceptedExamples = feedbackExamples.accepted.map(toExample);
    let scored = 0;
    for (const candidate of candidates) {
      try {
        const result = await this._openaiService!.scoreLeadFit({
          channelDocuments,
          strategy: context.strategy,
          expertise: context.expertise,
          candidate: {
            ...(candidate.name ? { name: candidate.name } : {}),
            ...(candidate.username ? { username: candidate.username } : {}),
            ...(candidate.bio ? { bio: candidate.bio } : {}),
            ...(candidate.followersCount != null
              ? { followersCount: candidate.followersCount }
              : {}),
            ...(candidate.followingCount != null
              ? { followingCount: candidate.followingCount }
              : {}),
          },
          bridges: candidate.leadBridgesAsLead.map((bridge) => ({
            ...(bridge.bridgeMember.username
              ? { username: bridge.bridgeMember.username }
              : {}),
            ...(bridge.bridgeRelationshipGrade != null
              ? { grade: bridge.bridgeRelationshipGrade }
              : {}),
          })),
          rejectedExamples,
          acceptedExamples,
        });
        await this._repository.updateAudienceLeadFit({
          organizationId,
          integrationId,
          externalId: candidate.externalId,
          leadFitScore: result.score,
          leadFitReason: result.reason,
          leadFitConcerns: result.concerns,
          leadFitMatchedTopics: result.matchedTopics,
          leadFitModel: result.model,
          leadFitVersion: result.version,
        });
        scored++;
      } catch (error) {
        this._logger.error(
          `Lead fit scoring failed for ${integrationId}/${candidate.externalId}`,
          error instanceof Error ? error.stack : String(error)
        );
      }
    }
    return scored;
  }

  private shouldUseTriageReranking() {
    return (
      process.env.TRIAGE_AI_RERANK_ENABLED === 'true' &&
      !!process.env.OPENAI_API_KEY &&
      !!this._openaiService
    );
  }

  private mergeManualTriagePins(params: {
    pins: Array<{ counterpartyExternalId: string }>;
    autoPicks: Array<HotPickInput | CultivatePickInput>;
    pickLimit: number;
  }): Array<HotPickInput | CultivatePickInput> {
    if (!params.pins.length) {
      return params.autoPicks.slice(0, params.pickLimit);
    }
    const pinnedIds = new Set(
      params.pins.map((pin) => pin.counterpartyExternalId)
    );
    const manualPicks = params.pins.map((pin, index) => ({
      counterpartyExternalId: pin.counterpartyExternalId,
      rulesRank: index + 1,
      finalRank: index + 1,
      rulesReason: MANUAL_TRIAGE_PICK_REASON,
      suggestedAction: MANUAL_TRIAGE_PICK_REASON,
      source: MANUAL_TRIAGE_PICK_SOURCE,
    }));
    const remainingSlots = Math.max(params.pickLimit - manualPicks.length, 0);
    const autoPicks = params.autoPicks
      .filter((pick) => !pinnedIds.has(pick.counterpartyExternalId))
      .slice(0, remainingSlots)
      .map((pick, index) => ({
        ...pick,
        rulesRank: manualPicks.length + index + 1,
        finalRank: manualPicks.length + index + 1,
      }));
    return [...manualPicks, ...autoPicks];
  }

  private async rerankTriageCandidates<
    T extends {
      externalId: string;
      rulesRank: number;
      rulesReason: string;
      name?: string | null;
      username?: string | null;
      bio?: string | null;
    }
  >(params: {
    organizationId: string;
    integrationId: string;
    triage: 'hot' | 'cultivate';
    strategyId: ChannelStrategyId;
    pickLimit: number;
    candidates: T[];
  }) {
    const rules = params.candidates
      .slice(0, params.pickLimit)
      .map((candidate, index) => ({
        ...candidate,
        finalRank: index + 1,
        aiRank: null as number | null,
        aiReason: null as string | null,
        suggestedAction: null as string | null,
        source: 'rules',
      }));
    if (!this.shouldUseTriageReranking()) {
      return { picks: rules, source: 'rules' as const };
    }
    try {
      const context = await this.buildTriagePromptContext({
        organizationId: params.organizationId,
        integrationId: params.integrationId,
        strategyId: params.strategyId,
        triage: params.triage,
      });
      const input: TriageRerankInput = {
        triage: params.triage,
        ...context,
        candidates: params.candidates.map((candidate) => ({
          externalId: candidate.externalId,
          ...(candidate.name
            ? {
                name: candidate.name.slice(0, TRIAGE_CANDIDATE_NAME_MAX_LENGTH),
              }
            : {}),
          ...(candidate.username
            ? {
                username: candidate.username.slice(
                  0,
                  TRIAGE_CANDIDATE_USERNAME_MAX_LENGTH
                ),
              }
            : {}),
          ...(candidate.bio
            ? {
                bio: candidate.bio.slice(0, TRIAGE_CANDIDATE_BIO_MAX_LENGTH),
              }
            : {}),
          rulesReason: candidate.rulesReason.slice(
            0,
            TRIAGE_CANDIDATE_RULES_REASON_MAX_LENGTH
          ),
        })),
      };
      const reranked = await this._openaiService!.rerankTriageCandidates(input);
      if (reranked.length > params.pickLimit) {
        throw new Error('AI rerank exceeded the configured pick limit');
      }
      const candidateById = new Map(
        params.candidates.map((candidate) => [candidate.externalId, candidate])
      );
      const seen = new Set<string>();
      const picks = reranked.map((candidate, index) => {
        const rulesCandidate = candidateById.get(candidate.externalId);
        const reason = candidate.reason.trim();
        const suggestedAction = candidate.suggestedAction.trim();
        if (
          !rulesCandidate ||
          seen.has(candidate.externalId) ||
          !reason ||
          !suggestedAction ||
          reason.length > TRIAGE_REASON_MAX_LENGTH ||
          suggestedAction.length > TRIAGE_REASON_MAX_LENGTH
        ) {
          throw new Error('AI rerank contained invalid candidate data');
        }
        seen.add(candidate.externalId);
        return {
          ...rulesCandidate,
          finalRank: index + 1,
          aiRank: index + 1,
          aiReason: reason,
          suggestedAction,
          source: 'ai',
        };
      });
      return { picks, source: 'ai' as const };
    } catch (error) {
      this._logger.warn(
        `Triage AI rerank failed for ${params.integrationId}/${
          params.triage
        }: ${
          error instanceof Error ? error.message.slice(0, 200) : 'unknown error'
        }`
      );
      return { picks: rules, source: 'rules' as const };
    }
  }

  private hotRulesReason(candidate: {
    relationshipNetGap: number | null;
    relationshipReciprocationScore: number | null;
    lastInboundAt: Date | null;
  }) {
    const signals = [
      candidate.relationshipNetGap != null
        ? `Net inbound gap ${candidate.relationshipNetGap}`
        : undefined,
      candidate.relationshipReciprocationScore != null
        ? `Inbound score ${candidate.relationshipReciprocationScore}`
        : undefined,
      candidate.lastInboundAt
        ? `Last inbound ${candidate.lastInboundAt.toISOString()}`
        : undefined,
    ].filter((signal): signal is string => !!signal);
    return signals.join(' · ') || 'Current Hot rules eligibility';
  }

  async materializeHotPicksForIntegration(
    organizationId: string,
    integrationId: string,
    now = new Date()
  ) {
    const hour = utcHourKey(now);
    const config = await this.resolveTriageMaterializationConfig(
      organizationId,
      integrationId
    );
    const nearFullAt = Math.ceil(
      config.profile.hot.pickLimit * config.profile.hot.nearFullRatio
    );
    const visibleCount = await this._repository.countVisibleHotPicks({
      organizationId,
      integrationId,
      hour,
      strategyId: config.strategyId,
      strategyVersion: config.strategyVersion,
      materializationVersion: config.materializationVersion,
    });
    if (visibleCount >= nearFullAt) {
      return { hour, skipped: 'near_full' as const, visibleCount };
    }

    const refreshIds = await this._repository.listHotRefreshExternalIds({
      organizationId,
      integrationId,
      poolSize: config.profile.hot.candidatePoolSize,
      recentEventSince: new Date(
        now.getTime() -
          config.profile.hot.recentEventLookbackHours * 60 * 60 * 1000
      ),
    });
    if (refreshIds.length) {
      const batch = await this._repository.getRelationshipScoresForMembers(
        organizationId,
        integrationId,
        refreshIds,
        now
      );
      const snapshots = await this.scoreRelationshipBatch(batch);
      await this.updateRelationshipProjectionsWithHotLogging(
        organizationId,
        integrationId,
        now,
        snapshots,
        { force: true }
      );
    }
    const candidates = await this._repository.listHotRulesCandidates({
      organizationId,
      integrationId,
      strategyId: config.strategyId,
      strategyVersion: config.strategyVersion,
      poolSize: config.profile.hot.candidatePoolSize,
    });
    const rules = candidates.map((candidate, index) => ({
      ...candidate,
      rulesRank: index + 1,
      rulesReason: this.hotRulesReason(candidate),
    }));
    const reranked = await this.rerankTriageCandidates({
      organizationId,
      integrationId,
      triage: 'hot',
      strategyId: config.strategyId,
      pickLimit: config.profile.hot.pickLimit,
      candidates: rules,
    });
    const pins = await this._repository.listColumnPins({
      organizationId,
      integrationId,
      column: 'hot',
    });
    const mergedPicks = this.mergeManualTriagePins({
      pins,
      autoPicks: reranked.picks.map((pick) => ({
        counterpartyExternalId: pick.externalId,
        rulesRank: pick.rulesRank,
        finalRank: pick.finalRank,
        rulesReason: pick.rulesReason,
        aiRank: pick.aiRank,
        aiReason: pick.aiReason,
        suggestedAction: pick.suggestedAction,
        source: pick.source,
      })),
      pickLimit: config.profile.hot.pickLimit,
    });
    const result = await this._repository.replaceHotPickBatch({
      organizationId,
      integrationId,
      hour,
      strategyId: config.strategyId,
      strategyVersion: config.strategyVersion,
      materializationVersion: config.materializationVersion,
      candidateCount: candidates.length + pins.length,
      source: pins.length ? 'manual+rules' : reranked.source,
      completedAt: now,
      picks: mergedPicks,
    });
    const audit = await this._repository.auditHotPickExclusions({
      organizationId,
      integrationId,
      hour,
      now,
    });
    if (audit.excludedCount > 0) {
      this._logger.log(
        `[hot-triage] Hot materialization visibility audit integration=${integrationId} hour=${hour} stored=${
          audit.storedCount
        } visible=${audit.visibleCount} excluded=${
          audit.excludedCount
        } ${JSON.stringify(trimHotPickAuditForLog(audit))}`
      );
    }
    return {
      hour,
      skipped: false as const,
      candidateCount: candidates.length,
      pickCount: result.count,
      storedCount: result.count,
      visibleCount: audit.visibleCount,
      excludedCount: audit.excludedCount,
      audit,
    };
  }

  async materializeCultivatePicksForIntegration(
    organizationId: string,
    integrationId: string,
    now = new Date()
  ) {
    const hour = utcHourKey(now);
    const config = await this.resolveTriageMaterializationConfig(
      organizationId,
      integrationId
    );
    const nearFullAt = Math.ceil(
      config.profile.cultivate.pickLimit *
        config.profile.cultivate.nearFullRatio
    );
    const visibleCount = await this._repository.countVisibleCultivatePicks({
      organizationId,
      integrationId,
      hour,
      strategyId: config.strategyId,
      strategyVersion: config.strategyVersion,
      materializationVersion: config.materializationVersion,
    });
    if (visibleCount >= nearFullAt) {
      return { hour, skipped: 'near_full' as const, visibleCount };
    }

    let candidates = await this._repository.listCultivateCandidates({
      organizationId,
      integrationId,
      now,
      take: config.profile.cultivate.candidatePoolSize,
      warmGradeThreshold: config.profile.cultivate.warmGradeThreshold,
      staleDays: config.profile.cultivate.staleDays,
    });
    if (!candidates.length) {
      candidates = await this._repository.listCultivateFallbackCandidates({
        organizationId,
        integrationId,
        now,
        take: config.profile.cultivate.fallbackPickLimit,
      });
    }
    const ranked = this._repository
      .rankCultivateCandidates(candidates, hour, now)
      .map((row) => ({
        ...row,
        rulesReason: row.rulesReason,
      }));
    const reranked = await this.rerankTriageCandidates({
      organizationId,
      integrationId,
      triage: 'cultivate',
      strategyId: config.strategyId,
      pickLimit: config.profile.cultivate.pickLimit,
      candidates: ranked,
    });
    const pins = await this._repository.listColumnPins({
      organizationId,
      integrationId,
      column: 'cultivate',
    });
    const picks = this.mergeManualTriagePins({
      pins,
      autoPicks: reranked.picks.map((row) => ({
        counterpartyExternalId: row.externalId,
        rulesRank: row.rulesRank,
        finalRank: row.finalRank,
        rulesReason: row.rulesReason,
        ...(row.aiRank != null ? { aiRank: row.aiRank } : {}),
        ...(row.aiReason ? { aiReason: row.aiReason } : {}),
        ...(row.suggestedAction
          ? { suggestedAction: row.suggestedAction }
          : {}),
        source: row.source,
      })),
      pickLimit: config.profile.cultivate.pickLimit,
    });
    const result = await this._repository.replaceCultivatePickBatch({
      organizationId,
      integrationId,
      hour,
      strategyId: config.strategyId,
      strategyVersion: config.strategyVersion,
      materializationVersion: config.materializationVersion,
      candidateCount: candidates.length + pins.length,
      source: pins.length ? 'manual+rules' : reranked.source,
      completedAt: now,
      picks,
    });
    const audit = await this._repository.auditCultivatePickExclusions({
      organizationId,
      integrationId,
      hour,
      now,
      config: {
        warmGradeThreshold: config.profile.cultivate.warmGradeThreshold,
        staleDays: config.profile.cultivate.staleDays,
      },
    });
    if (audit.excludedCount > 0) {
      this._logger.log(
        `[follower-cultivate] Cultivate materialization visibility audit integration=${integrationId} hour=${hour} stored=${
          audit.storedCount
        } visible=${audit.visibleCount} excluded=${
          audit.excludedCount
        } ${JSON.stringify(trimCultivatePickAuditForLog(audit))}`
      );
    }
    return {
      hour,
      skipped: false as const,
      candidateCount: candidates.length,
      pickCount: result.count,
      storedCount: result.count,
      visibleCount: audit.visibleCount,
      excludedCount: audit.excludedCount,
      audit,
    };
  }

  async refreshFollowerRelationshipScore(
    organizationId: string,
    integrationId: string,
    externalId: string,
    direction: 'their' | 'your',
    snapshotAt = new Date()
  ) {
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    if (direction !== 'their' && direction !== 'your') {
      throw new BadRequestException('Unsupported relationship score direction');
    }
    if (Number.isNaN(snapshotAt.getTime())) {
      throw new BadRequestException('snapshotAt must be a valid timestamp');
    }
    const member = await this._repository.getCurrentRelationshipProjection(
      organizationId,
      integrationId,
      externalId
    );
    if (!member) {
      throw new NotFoundException('Follower was not found');
    }
    const batch = await this._repository.getRelationshipScoresForMembers(
      organizationId,
      integrationId,
      [externalId],
      snapshotAt
    );
    const strategy = this.resolveRelationshipStrategy(batch.strategy);
    const profile = strategy.getScoringProfile();
    const liveCounts =
      batch.members[0]?.interactionCounts ??
      createRelationshipInteractionCounts();
    const keptEffort = Number.isSafeInteger(member.relationshipEffortScore)
      ? member.relationshipEffortScore!
      : 0;
    const keptReciprocation = Number.isSafeInteger(
      member.relationshipReciprocationScore
    )
      ? member.relationshipReciprocationScore!
      : 0;
    const effortScore =
      direction === 'your'
        ? scoreInteractionCounts(profile, liveCounts, 'outbound')
        : keptEffort;
    const reciprocationScore =
      direction === 'their'
        ? scoreInteractionCounts(profile, liveCounts, 'inbound')
        : keptReciprocation;
    const snapshot = {
      externalId,
      effortScore,
      reciprocationScore,
      ...this.gradeRelationship(strategy, profile, {
        effortScore,
        reciprocationScore,
      }),
    };
    const gatedSnapshot = {
      ...snapshot,
      triage: applyHotTriageMembershipGate(
        snapshot.triage,
        member.membershipState
      ),
    };
    await this.updateRelationshipProjectionsWithHotLogging(
      organizationId,
      integrationId,
      snapshotAt,
      [gatedSnapshot],
      { force: true }
    );
    return {
      ...gatedSnapshot,
      snapshotAt,
    };
  }

  private resolveRelationshipStrategy(
    selection?: RelationshipGradeStrategySelection
  ) {
    return resolveChannelStrategy(selection?.strategyId);
  }

  private gradeRelationship(
    strategy: ChannelStrategy,
    profile: RelationshipScoringProfile,
    input: StrategyScoringInput
  ) {
    return (
      strategy.scoreRelationship?.(input) ??
      calculateStrategyRelationshipGrade(
        input,
        strategy.id,
        strategy.version,
        profile
      )
    );
  }

  /**
   * Optional preparation runs once for the whole loaded batch; weighting,
   * grading, and triage stay synchronous and pure per member.
   */
  private async scoreRelationshipBatch(
    batch: RelationshipGradeBatch
  ): Promise<RelationshipGradeSnapshotInput[]> {
    const strategy = this.resolveRelationshipStrategy(batch.strategy);
    const profile = strategy.getScoringProfile();
    await strategy.prepare?.({
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      memberCount: batch.members.length,
    });
    return batch.members.map((member) => {
      const input = {
        effortScore: scoreInteractionCounts(
          profile,
          member.interactionCounts,
          'outbound'
        ),
        reciprocationScore: scoreInteractionCounts(
          profile,
          member.interactionCounts,
          'inbound'
        ),
      };
      const graded = this.gradeRelationship(strategy, profile, input);
      return {
        externalId: member.externalId,
        ...input,
        ...graded,
        triage: applyHotTriageMembershipGate(
          graded.triage,
          member.membershipState
        ),
      };
    });
  }

  async getFollowerDetails(
    organizationId: string,
    integrationId: string,
    externalId: string,
    userId?: string
  ) {
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    if (userId) {
      this.validateBoundedString(userId, 'userId', MAX_ID_LENGTH);
    }
    const details = await this._repository.getFollowerDetails(
      organizationId,
      integrationId,
      externalId,
      userId
    );
    if (!details) {
      throw new NotFoundException('Follower was not found');
    }
    return details;
  }

  async createFollowerNote(
    organizationId: string,
    integrationId: string,
    externalId: string,
    authorUserId: string,
    content: string
  ) {
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    this.validateBoundedString(authorUserId, 'authorUserId', MAX_ID_LENGTH);
    this.validateBoundedString(content, 'content', MAX_AUDIENCE_NOTE_LENGTH);
    try {
      return await this._repository.createAudienceNote(
        organizationId,
        integrationId,
        externalId,
        authorUserId,
        content
      );
    } catch {
      throw new NotFoundException('Follower was not found');
    }
  }

  async updateFollowerNote(
    organizationId: string,
    integrationId: string,
    noteId: string,
    content: string
  ) {
    this.validateBoundedString(noteId, 'noteId', MAX_ID_LENGTH);
    this.validateBoundedString(content, 'content', MAX_AUDIENCE_NOTE_LENGTH);
    if (
      !(await this._repository.updateAudienceNote(
        organizationId,
        integrationId,
        noteId,
        content
      ))
    ) {
      throw new NotFoundException('Follower note was not found');
    }
  }

  async deleteFollowerNote(
    organizationId: string,
    integrationId: string,
    noteId: string
  ) {
    this.validateBoundedString(noteId, 'noteId', MAX_ID_LENGTH);
    if (
      !(await this._repository.deleteAudienceNote(
        organizationId,
        integrationId,
        noteId
      ))
    ) {
      throw new NotFoundException('Follower note was not found');
    }
  }

  async upsertFollowerGrade(
    organizationId: string,
    integrationId: string,
    externalId: string,
    userId: string,
    grade: number
  ) {
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    this.validateBoundedString(userId, 'userId', MAX_ID_LENGTH);
    if (!isPersonalRelationshipGrade(grade)) {
      throw new BadRequestException(
        'Grade must be a half-star value between 1 and 5'
      );
    }
    try {
      const saved = await this._repository.upsertAudienceMemberGrade(
        organizationId,
        integrationId,
        externalId,
        userId,
        grade
      );
      return {
        grade: saved.grade,
        adjustedGrade: applyPersonalRelationshipGrade(
          saved.relationshipGrade,
          saved.grade
        ),
      };
    } catch {
      throw new NotFoundException('Follower was not found');
    }
  }

  async listFollowerLists(organizationId: string, integrationId: string) {
    return this._repository.listAudienceLists(organizationId, integrationId);
  }

  getStoredFollowerAudienceCounts(
    organizationId: string,
    integrationId: string,
    listLimit = 20
  ) {
    return this._repository.getStoredFollowerAudienceCounts(
      organizationId,
      integrationId,
      listLimit
    );
  }

  async createFollowerList(
    organizationId: string,
    integrationId: string,
    createdByUserId: string,
    name: string,
    color?: string | null
  ) {
    this.validateBoundedString(
      createdByUserId,
      'createdByUserId',
      MAX_ID_LENGTH
    );
    const normalized = this.normalizeFollowerListName(name);
    const normalizedColor = this.normalizeFollowerListColor(color);
    const result = await this._repository.createAudienceList(
      organizationId,
      integrationId,
      normalized,
      createdByUserId,
      normalizedColor
    );
    if (result.conflict) {
      throw new ConflictException('A list with this name already exists');
    }
    return result.list;
  }

  async updateFollowerList(
    organizationId: string,
    integrationId: string,
    listId: string,
    name: string,
    color?: string | null
  ) {
    this.validateBoundedString(listId, 'listId', MAX_ID_LENGTH);
    const normalized = this.normalizeFollowerListName(name);
    const normalizedColor =
      color === undefined ? undefined : this.normalizeFollowerListColor(color);
    const result = await this._repository.updateAudienceList(
      organizationId,
      integrationId,
      listId,
      normalized,
      normalizedColor
    );
    if (result.missing) {
      throw new NotFoundException('Follower list was not found');
    }
    if (result.conflict) {
      throw new ConflictException('A list with this name already exists');
    }
    return result.list;
  }

  async deleteFollowerList(
    organizationId: string,
    integrationId: string,
    listId: string
  ) {
    this.validateBoundedString(listId, 'listId', MAX_ID_LENGTH);
    if (
      !(await this._repository.deleteAudienceList(
        organizationId,
        integrationId,
        listId
      ))
    ) {
      throw new NotFoundException('Follower list was not found');
    }
  }

  async addFollowerListMember(
    organizationId: string,
    integrationId: string,
    listId: string,
    externalId: string,
    createdByUserId?: string
  ) {
    this.validateBoundedString(listId, 'listId', MAX_ID_LENGTH);
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    const result = await this._repository.addAudienceListMember(
      organizationId,
      integrationId,
      listId,
      externalId,
      createdByUserId
    );
    if (result.missing === 'list') {
      throw new NotFoundException('Follower list was not found');
    }
    if (result.missing === 'member') {
      throw new NotFoundException('Follower was not found');
    }
  }

  async importFollowerListMember(
    organizationId: string,
    integrationId: string,
    listId: string,
    follower: Follower,
    createdByUserId?: string
  ) {
    this.validateBoundedString(listId, 'listId', MAX_ID_LENGTH);
    const profile = this.validateFollower(follower);
    const result =
      await this._repository.upsertImportedAudienceMemberAndAddToList(
        organizationId,
        integrationId,
        listId,
        profile,
        createdByUserId
      );
    if ('missing' in result) {
      if (result.missing === 'list') {
        throw new NotFoundException('Follower list was not found');
      }
      throw new NotFoundException('Follower was not found');
    }
    return {
      externalId: result.member.externalId,
      name: result.member.name,
      username: result.member.username,
      profileUrl: profile.profileUrl ?? null,
      picture: profile.picture ?? null,
    };
  }

  async importLead(
    organizationId: string,
    integrationId: string,
    follower: Follower,
    createdByUserId?: string
  ) {
    const profile = this.validateFollower(follower);
    const result = await this._repository.upsertImportedAudienceMemberAsLead(
      organizationId,
      integrationId,
      profile,
      createdByUserId
    );
    if ('rejected' in result) {
      throw new BadRequestException(
        'This profile is already a follower or someone you follow'
      );
    }
    if ('missing' in result) {
      throw new NotFoundException('Follower was not found');
    }
    return {
      externalId: result.member.externalId,
      name: result.member.name,
      username: result.member.username,
      profileUrl: profile.profileUrl ?? null,
      picture: profile.picture ?? null,
    };
  }

  async removeFollowerListMember(
    organizationId: string,
    integrationId: string,
    listId: string,
    externalId: string
  ) {
    this.validateBoundedString(listId, 'listId', MAX_ID_LENGTH);
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    const result = await this._repository.removeAudienceListMember(
      organizationId,
      integrationId,
      listId,
      externalId
    );
    if (result.missing === 'list') {
      throw new NotFoundException('Follower list was not found');
    }
  }

  async removeFollowerListMembers(
    organizationId: string,
    integrationId: string,
    listId: string,
    options: {
      externalIds?: string[];
      onlyFollowing?: boolean;
      limit?: number;
    }
  ) {
    this.validateBoundedString(listId, 'listId', MAX_ID_LENGTH);
    const hasExternalIds = Array.isArray(options.externalIds);
    const onlyFollowing = options.onlyFollowing === true;
    if (hasExternalIds === onlyFollowing) {
      throw new BadRequestException(
        'Provide either externalIds or onlyFollowing, not both'
      );
    }
    if (hasExternalIds) {
      const externalIds = options.externalIds ?? [];
      if (!externalIds.length) {
        throw new BadRequestException(
          'externalIds must include at least one id'
        );
      }
      if (externalIds.length > 50) {
        throw new BadRequestException('externalIds cannot exceed 50 ids');
      }
      const unique = new Set(externalIds);
      if (unique.size !== externalIds.length) {
        throw new BadRequestException('externalIds must be unique');
      }
      for (const externalId of externalIds) {
        this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
      }
    }

    const result = await this._repository.removeAudienceListMembers(
      organizationId,
      integrationId,
      listId,
      {
        ...(hasExternalIds ? { externalIds: options.externalIds } : {}),
        ...(onlyFollowing ? { onlyFollowing: true } : {}),
        ...(options.limit != null ? { limit: options.limit } : {}),
      }
    );
    if ('missing' in result) {
      throw new NotFoundException('Follower list was not found');
    }
    return {
      removed: result.removed.map((member) => ({
        id: member.externalId,
        name: member.name || member.username || member.externalId,
        ...(member.username ? { username: member.username } : {}),
      })),
      remaining: result.remaining,
      hasMore: result.hasMore,
    };
  }

  async ignoreFollowerTriage(
    organizationId: string,
    integrationId: string,
    externalId: string,
    triage: string,
    createdByUserId?: string,
    reasons?: string[],
    options?: { snooze?: boolean }
  ) {
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    if (
      ![
        'quiet',
        'hot_lead',
        'over_invested',
        'mutual',
        'lead',
        'engaged_not_yet',
        'cultivate',
      ].includes(triage)
    ) {
      throw new BadRequestException('Invalid triage value');
    }
    if (triage === 'lead' && !options?.snooze) {
      if (!Array.isArray(reasons) || reasons.length === 0) {
        throw new BadRequestException(
          'Lead dismiss requires at least one reason'
        );
      }
    }
    const result = await this._repository.addAudienceTriageIgnore(
      organizationId,
      integrationId,
      externalId,
      triage,
      createdByUserId,
      reasons,
      options
    );
    if (result.missing === 'member') {
      throw new NotFoundException('Follower was not found');
    }
    if (triage === 'hot_lead' || triage === 'engaged_not_yet') {
      this.logHotTriageDismissed({
        organizationId,
        integrationId,
        externalId,
        createdByUserId,
        snooze: options?.snooze === true,
      });
    }
    if (triage === 'cultivate') {
      this.logCultivateDismissed({
        organizationId,
        integrationId,
        externalId,
        createdByUserId,
        snooze: options?.snooze === true,
      });
    }
  }

  async ignoreFollower(
    organizationId: string,
    integrationId: string,
    externalId: string,
    ignoredByUserId?: string
  ) {
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    const result = await this._repository.setAudienceMemberIgnored(
      organizationId,
      integrationId,
      externalId,
      ignoredByUserId
    );
    if (result.missing === 'member') {
      throw new NotFoundException('Follower was not found');
    }
  }

  async unignoreFollower(
    organizationId: string,
    integrationId: string,
    externalId: string
  ) {
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    const result = await this._repository.clearAudienceMemberIgnored(
      organizationId,
      integrationId,
      externalId
    );
    if (result.missing === 'member') {
      throw new NotFoundException('Follower was not found');
    }
  }

  async moveFollowerColumn(
    organizationId: string,
    integrationId: string,
    externalId: string,
    from: { kind: 'segment'; slug: string } | { kind: 'list'; listId: string },
    to: { kind: 'segment'; slug: string } | { kind: 'list'; listId: string },
    createdByUserId?: string
  ) {
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    if (from.kind === 'list') {
      this.validateBoundedString(from.listId, 'from.listId', MAX_ID_LENGTH);
    }
    if (to.kind === 'list') {
      this.validateBoundedString(to.listId, 'to.listId', MAX_ID_LENGTH);
    }
    if (from.kind === 'segment') {
      this.validateBoundedString(from.slug, 'from.slug', 64);
    }
    if (to.kind === 'segment') {
      this.validateBoundedString(to.slug, 'to.slug', 64);
    }
    const materialization = await this.resolveTriageMaterializationConfig(
      organizationId,
      integrationId
    );
    const result = await this._repository.moveAudienceMemberColumn({
      organizationId,
      integrationId,
      externalId,
      createdByUserId,
      from,
      to,
      materialization: {
        strategyId: materialization.strategyId,
        strategyVersion: materialization.strategyVersion,
        materializationVersion: materialization.materializationVersion,
      },
    });
    if ('missing' in result) {
      if (result.missing === 'list') {
        throw new NotFoundException('Follower list was not found');
      }
      throw new NotFoundException('Follower was not found');
    }
    if ('rejected' in result) {
      if (result.rejected === 'forbidden_target') {
        throw new BadRequestException(
          'Cannot move followers into Leads, Followed, or Unfollowed'
        );
      }
      throw new BadRequestException('Follower is already in that column');
    }
  }

  async listConvertedColumnPins(
    organizationId: string,
    integrationId: string,
    externalIds?: string[]
  ) {
    return this._repository.listColumnPins({
      organizationId,
      integrationId,
      column: 'converted',
      ...(externalIds?.length ? { externalIds } : {}),
    });
  }

  async markAudienceMemberFollowed(
    organizationId: string,
    integrationId: string,
    externalId: string
  ) {
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    const stamped = await this._repository.stampAudienceMemberWeFollowedAt(
      organizationId,
      integrationId,
      externalId
    );
    if ('missing' in stamped) {
      throw new NotFoundException('Follower was not found');
    }
    try {
      await this._repository.recordNormalizedEvent(
        organizationId,
        integrationId,
        {
          providerEventKey: `manual-outbound-follow:${integrationId}:${externalId}`,
          kind: PrismaInteractionKind.FOLLOW,
          direction: PrismaInteractionDirection.OUTBOUND,
          eventAt: stamped.weFollowedAt,
          counterparty: stamped.counterparty,
          normalizationVersion: 1,
          score: getChannelInteractionScore('follow', 'outbound'),
        }
      );
    } catch {
      /** Stamp succeeded; interaction recording is best-effort */
    }
    try {
      await this.refreshRelationshipGradeProjections(
        organizationId,
        integrationId,
        [externalId]
      );
    } catch {
      /** Temporal remains the fallback if live projection refresh fails */
    }
    return { weFollowedAt: stamped.weFollowedAt.toISOString() };
  }

  async markAudienceMemberUnfollowed(
    organizationId: string,
    integrationId: string,
    externalId: string
  ) {
    this.validateBoundedString(externalId, 'externalId', MAX_ID_LENGTH);
    const cleared = await this._repository.clearAudienceMemberWeFollowedAt(
      organizationId,
      integrationId,
      externalId
    );
    if ('missing' in cleared) {
      if (cleared.missing === 'member') {
        throw new NotFoundException('Follower was not found');
      }
      throw new BadRequestException('This profile is not followed');
    }
    try {
      await this._repository.recordNormalizedEvent(
        organizationId,
        integrationId,
        {
          providerEventKey: `manual-outbound-unfollow:${integrationId}:${externalId}`,
          kind: PrismaInteractionKind.FOLLOW,
          direction: PrismaInteractionDirection.OUTBOUND,
          eventAt: cleared.clearedAt,
          counterparty: cleared.counterparty,
          normalizationVersion: 1,
          score: getChannelInteractionScore('follow', 'outbound'),
        }
      );
    } catch {
      /** Clear succeeded; interaction recording is best-effort */
    }
    try {
      await this.refreshRelationshipGradeProjections(
        organizationId,
        integrationId,
        [externalId]
      );
    } catch {
      /** Temporal remains the fallback if live projection refresh fails */
    }
    return { unfollowedAt: cleared.clearedAt.toISOString() };
  }

  private normalizeFollowerListName(name: string) {
    const normalized = name.trim().replace(/\s+/g, ' ');
    this.validateBoundedString(normalized, 'name', 64);
    const reserved = [
      'all',
      'engaged',
      'hot',
      'mutual',
      'costly',
      'quiet',
      'lead',
      'leads',
      'followed',
      'unfollowed',
      'ignored',
    ];
    if (reserved.includes(normalized.toLowerCase())) {
      throw new BadRequestException('List name cannot match a built-in filter');
    }
    return normalized;
  }

  private normalizeFollowerListColor(
    color?: string | null
  ): FollowerSegmentColorValue | null {
    if (color == null || color === '') {
      return null;
    }
    if (!FOLLOWER_SEGMENT_COLORS.includes(color as FollowerSegmentColorValue)) {
      throw new BadRequestException('List color is not supported');
    }
    return color as FollowerSegmentColorValue;
  }

  private validateEvent(event: NormalizedChannelInteractionEvent) {
    if (!event || typeof event !== 'object') {
      throw new BadRequestException('Interaction event must be an object');
    }
    this.validateBoundedString(
      event.providerEventKey,
      'providerEventKey',
      MAX_ID_LENGTH
    );
    this.validateBoundedString(
      event.counterparty?.externalId,
      'counterparty.externalId',
      MAX_ID_LENGTH
    );
    const kind = KIND_MAP[event.kind];
    const direction = DIRECTION_MAP[event.direction];
    if (!kind || !direction) {
      throw new BadRequestException(
        'Unsupported interaction kind or direction'
      );
    }
    const eventAt = this.parseDate(event.eventAt, 'eventAt');
    if (eventAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
      throw new BadRequestException(
        'Interaction timestamp is too far in the future'
      );
    }
    if (
      !Number.isInteger(event.normalizationVersion) ||
      event.normalizationVersion < 1 ||
      event.normalizationVersion > 1000
    ) {
      throw new BadRequestException(
        'normalizationVersion must be between 1 and 1000'
      );
    }
    if (event.relatedObjectId !== undefined) {
      this.validateBoundedString(
        event.relatedObjectId,
        'relatedObjectId',
        MAX_ID_LENGTH
      );
    }
    if (event.conversationExternalId !== undefined) {
      this.validateBoundedString(
        event.conversationExternalId,
        'conversationExternalId',
        MAX_ID_LENGTH
      );
    }
    const metadataEntries = Object.entries(event.metadata || {});
    if (metadataEntries.length > MAX_METADATA_ENTRIES) {
      throw new BadRequestException(
        'Interaction metadata has too many entries'
      );
    }
    for (const [key, value] of metadataEntries) {
      this.validateBoundedString(key, 'metadata key', 128);
      this.validateBoundedString(
        value,
        `metadata.${key}`,
        MAX_METADATA_VALUE_LENGTH
      );
    }
    const counterparty = this.validateProfile(event.counterparty);
    const mappedMembership = event.membershipUpdate
      ? MEMBERSHIP_MAP[event.membershipUpdate]
      : undefined;
    if (event.membershipUpdate && !mappedMembership) {
      throw new BadRequestException('Unsupported audience membership update');
    }
    // UNKNOWN describes absent evidence and must never demote a known follower.
    const membershipUpdate =
      mappedMembership === PrismaAudienceMembership.UNKNOWN
        ? undefined
        : mappedMembership;
    // Providers that omit follow dates (e.g. X) still need a stored followedAt
    // so "recent followers" queries work after tracking starts.
    const stampFollowedAt =
      kind === PrismaInteractionKind.FOLLOW &&
      direction === PrismaInteractionDirection.INBOUND &&
      membershipUpdate === PrismaAudienceMembership.FOLLOWER;
    return {
      providerEventKey: event.providerEventKey,
      kind,
      direction,
      eventAt,
      counterparty: stampFollowedAt
        ? { ...counterparty, followedAt: eventAt }
        : counterparty,
      relatedObjectId: event.relatedObjectId,
      conversationExternalId: event.conversationExternalId,
      metadata: event.metadata,
      normalizationVersion: event.normalizationVersion,
      membershipUpdate,
      score: getChannelInteractionScore(event.kind, event.direction),
      ...(event.postSnapshot
        ? { postSnapshot: this.validatePostSnapshot(event.postSnapshot) }
        : {}),
    };
  }

  validatePostSnapshot(
    snapshot: ChannelInteractionPostSnapshot
  ): ChannelInteractionPostSnapshot {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new BadRequestException('postSnapshot must be an object');
    }
    if (
      !Number.isInteger(snapshot.version) ||
      snapshot.version < 1 ||
      snapshot.version > 1000
    ) {
      throw new BadRequestException(
        'postSnapshot.version must be between 1 and 1000'
      );
    }
    if (
      snapshot.completeness !== 'complete' &&
      snapshot.completeness !== 'partial' &&
      snapshot.completeness !== 'missing'
    ) {
      throw new BadRequestException('postSnapshot.completeness is unsupported');
    }
    return {
      ...this.validateSnapshotPost(snapshot, 'postSnapshot', false),
      version: snapshot.version,
      completeness: snapshot.completeness,
    };
  }

  private validateSnapshotPost(
    snapshot: Omit<ChannelInteractionPostSnapshot, 'version' | 'completeness'>,
    field: string,
    nested: boolean
  ): Omit<
    ChannelInteractionPostSnapshot,
    'version' | 'completeness' | 'quotedPost' | 'repostedPost'
  > & {
    quotedPost?: ChannelInteractionPostSnapshot['quotedPost'];
    repostedPost?: ChannelInteractionPostSnapshot['repostedPost'];
  } {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new BadRequestException(`${field} must be an object`);
    }
    this.validateBoundedString(
      snapshot.externalId,
      `${field}.externalId`,
      MAX_ID_LENGTH
    );
    const url = this.optionalUrl(snapshot.url, `${field}.url`);
    if (!url) throw new BadRequestException(`${field}.url is required`);
    if (
      typeof snapshot.content !== 'string' ||
      snapshot.content.length > MAX_SNAPSHOT_CONTENT_LENGTH
    ) {
      throw new BadRequestException(
        `${field}.content must be at most ${MAX_SNAPSHOT_CONTENT_LENGTH} characters`
      );
    }
    const publishedAt = this.parseDate(
      snapshot.publishedAt,
      `${field}.publishedAt`
    );
    const media = snapshot.media;
    if (media && (!Array.isArray(media) || media.length > MAX_SNAPSHOT_MEDIA)) {
      throw new BadRequestException(
        `${field}.media must contain at most ${MAX_SNAPSHOT_MEDIA} entries`
      );
    }
    const normalizedMedia = media?.map((item, index) => {
      if (
        !item ||
        (item.type !== 'image' && item.type !== 'video') ||
        !this.optionalUrl(item.url, `${field}.media[${index}].url`)
      ) {
        throw new BadRequestException(`${field}.media[${index}] is malformed`);
      }
      return { type: item.type, url: item.url };
    });
    if (nested && (snapshot.quotedPost || snapshot.repostedPost)) {
      throw new BadRequestException(
        `${field} cannot contain nested references`
      );
    }
    const quotedPost = snapshot.quotedPost
      ? this.validateSnapshotPost(
          snapshot.quotedPost,
          `${field}.quotedPost`,
          true
        )
      : undefined;
    const repostedPost = snapshot.repostedPost
      ? this.validateSnapshotPost(
          snapshot.repostedPost,
          `${field}.repostedPost`,
          true
        )
      : undefined;
    return {
      externalId: snapshot.externalId,
      url,
      content: snapshot.content,
      publishedAt: publishedAt.toISOString(),
      author: this.validateProfile(snapshot.author),
      ...(normalizedMedia?.length ? { media: normalizedMedia } : {}),
      ...(quotedPost ? { quotedPost } : {}),
      ...(repostedPost ? { repostedPost } : {}),
    };
  }

  private async applyContentEvents(
    organizationId: string,
    integrationId: string,
    providerIdentifier: string,
    events: NormalizedChannelContentEvent[]
  ) {
    if (!this._postsRepository || !Array.isArray(events) || !events.length) {
      return { imported: 0, deleted: 0, skipped: 0 };
    }
    if (events.length > MAX_DELIVERY_EVENTS) {
      throw new BadRequestException(
        `A delivery may contain at most ${MAX_DELIVERY_EVENTS} events`
      );
    }
    let imported = 0;
    let deleted = 0;
    let skipped = 0;
    for (const event of events) {
      const normalized = this.validateContentEvent(event);
      if (normalized.type === 'post.upsert') {
        const result = await this._postsRepository.importPlatformPost({
          organizationId,
          integrationId,
          providerIdentifier,
          externalId: normalized.externalId,
          url: normalized.url,
          content: normalized.content,
          publishedAt: normalized.publishedAt,
        });
        result.created ? imported++ : skipped++;
        continue;
      }
      const result = await this._postsRepository.markPlatformDeleted(
        organizationId,
        integrationId,
        normalized.externalId,
        normalized.deletedAt
      );
      result.updated ? deleted++ : skipped++;
    }
    return { imported, deleted, skipped };
  }

  private validateContentEvent(event: NormalizedChannelContentEvent) {
    if (!event || typeof event !== 'object') {
      throw new BadRequestException('Content event must be an object');
    }
    this.validateBoundedString(event.externalId, 'externalId', MAX_ID_LENGTH);
    if (event.type === 'post.upsert') {
      this.validateBoundedString(event.url, 'url', MAX_PROFILE_TEXT_LENGTH);
      this.optionalUrl(event.url, 'url');
      if (
        typeof event.content !== 'string' ||
        event.content.length > MAX_POST_CONTENT_LENGTH
      ) {
        throw new BadRequestException(
          `content must be at most ${MAX_POST_CONTENT_LENGTH} characters`
        );
      }
      const publishedAt = this.parseDate(event.publishedAt, 'publishedAt');
      if (publishedAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
        throw new BadRequestException('publishedAt is too far in the future');
      }
      return {
        type: 'post.upsert' as const,
        externalId: event.externalId,
        url: event.url,
        content: event.content,
        publishedAt,
      };
    }
    if (event.type === 'post.delete') {
      const deletedAt = this.parseDate(event.deletedAt, 'deletedAt');
      if (deletedAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
        throw new BadRequestException('deletedAt is too far in the future');
      }
      return {
        type: 'post.delete' as const,
        externalId: event.externalId,
        deletedAt,
      };
    }
    throw new BadRequestException('Unsupported content event type');
  }

  private getWebhookCapability(providerIdentifier: string) {
    const capability = this.getWebhookCapabilityOrUndefined(providerIdentifier);
    if (!capability) {
      throw new NotFoundException('Channel webhook provider is unavailable');
    }
    return capability;
  }

  private getWebhookCapabilityOrUndefined(providerIdentifier: string) {
    let provider: SocialProvider | undefined;
    try {
      provider =
        this._integrationManager?.getSocialIntegration(providerIdentifier);
    } catch {
      return undefined;
    }
    return provider?.channelInteractionWebhooks;
  }

  private validateFollower(follower: Follower): AudienceProfile {
    const profile = this.validateProfile({
      externalId: follower.id,
      name: follower.name,
      username: follower.username,
      picture: follower.picture,
      profileUrl: follower.profileUrl,
    });
    return {
      ...profile,
      bio: this.optionalString(follower.bio, 'bio', MAX_PROFILE_TEXT_LENGTH),
      followersCount: this.optionalCount(
        follower.followersCount,
        'followersCount'
      ),
      followingCount: this.optionalCount(
        follower.followingCount,
        'followingCount'
      ),
      followedAt: this.optionalDate(follower.followedAt, 'followedAt'),
      accountCreatedAt: this.optionalDate(
        follower.accountCreatedAt,
        'accountCreatedAt'
      ),
    };
  }

  private validateProfile(profile: {
    externalId: string;
    name?: string;
    username?: string;
    picture?: string;
    profileUrl?: string;
  }): AudienceProfile {
    this.validateBoundedString(
      profile?.externalId,
      'externalId',
      MAX_ID_LENGTH
    );
    const picture = this.optionalUrl(profile.picture, 'picture');
    const profileUrl = this.optionalUrl(profile.profileUrl, 'profileUrl');
    return {
      externalId: profile.externalId,
      name: this.optionalString(profile.name, 'name', 512),
      username: this.optionalString(profile.username, 'username', 512),
      picture,
      profileUrl,
    };
  }

  private optionalString(
    value: string | undefined,
    field: string,
    max: number
  ) {
    if (value === undefined) return undefined;
    this.validateBoundedString(value, field, max);
    return value;
  }

  private optionalUrl(value: string | undefined, field: string) {
    if (value === undefined) return undefined;
    this.validateBoundedString(value, field, MAX_PROFILE_TEXT_LENGTH);
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException(`${field} must be an absolute URL`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException(`${field} must use HTTP or HTTPS`);
    }
    return value;
  }

  private optionalCount(value: number | undefined, field: string) {
    if (value === undefined) return undefined;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new BadRequestException(`${field} must be a non-negative integer`);
    }
    return value;
  }

  private optionalDate(value: string | undefined, field: string) {
    return value === undefined ? undefined : this.parseDate(value, field);
  }

  private parseDate(value: string, field: string) {
    const parsed = new Date(value);
    if (typeof value !== 'string' || !value || Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid timestamp`);
    }
    return parsed;
  }

  private validateGeneration(generation: string) {
    this.validateBoundedString(generation, 'generation', 128);
  }

  private validateBoundedString(
    value: unknown,
    field: string,
    maxLength: number
  ): asserts value is string {
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > maxLength
    ) {
      throw new BadRequestException(
        `${field} must be between 1 and ${maxLength} characters`
      );
    }
  }
}

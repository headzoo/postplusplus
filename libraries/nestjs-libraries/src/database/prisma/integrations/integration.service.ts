import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  AnalyticsData,
  ChannelNoticeStatus,
  ChannelInteractionKindCoverage,
  ChannelInteractionTrackingFailureCategory,
  FollowerMemberDetail,
  FollowerMemberInteraction,
  FollowerMemberNote,
  FollowerPageTracking,
  Follower,
  FollowerPage,
  FollowerQuery,
  FollowerReadActor,
  FollowerList,
  FollowerRelationshipSnapshot,
  FollowerSort,
  MemberPostsPage,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  AudienceFollowerSortField,
  FOLLOWER_DATABASE_INTERACTIONS_SORT,
  FOLLOWER_DATABASE_LIKES_SORT,
  FOLLOWER_DATABASE_MY_GRADE_SORT,
  FOLLOWER_DATABASE_BOT_GRADE_SORT,
  FOLLOWER_DATABASE_NOTES_SORT,
  FOLLOWER_DATABASE_RELATIONSHIP_GRADE_SORT,
  FOLLOWER_DATABASE_THEIR_EFFORT_SORT,
  FOLLOWER_DATABASE_NET_GAP_SORT,
  getAudienceFollowerSortField,
  isPageScopedFollowerSort,
  normalizeFollowerSearch,
  sortFollowers,
} from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';
import {
  applyPersonalRelationshipGrade,
  applyHotTriageMembershipGate,
  calculateRelationshipGrade,
  getRelationshipTriage,
  RELATIONSHIP_CADENCE_DAYS,
  RELATIONSHIP_FORMULA_VERSION,
  RELATIONSHIP_WINDOW_DAYS,
  RELATIONSHIP_WINDOW_MS,
  RelationshipTriage,
  scoreToStars,
} from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.scoring';
import {
  ChannelFollowerSyncStatus,
  ChannelInteractionTrackingState,
  ChannelInteractionWindow,
  Integration,
  Organization,
  User,
} from '@prisma/client';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import dayjs from 'dayjs';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { IntegrationTimeDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.time.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { parseSkillFilename } from '@gitroom/nestjs-libraries/upload/context-document.upload.validation';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';
import { difference, uniq } from 'lodash';
import utc from 'dayjs/plugin/utc';
import { AutopostRepository } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { TemporalService } from 'nestjs-temporal-core';
import pLimit from 'p-limit';
import { PipelinePlugService } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.plug.service';
import { ChannelInteractionService } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.service';
import {
  AudienceFollowerCursor,
  AudienceCultivateCursor,
  AudienceFollowedCursor,
  AudienceUnfollowedCursor,
  AudienceLeadCursor,
  ChannelInteractionRepository,
  GradeFollowerCursor,
  HotPickCursor,
  IgnoredAudienceFollowerCursor,
  LikesCountFollowerCursor,
  NoteCountFollowerCursor,
  ProjectedFollowerCursor,
  RankedFollowerCursor,
  RecentFollowerCursor,
} from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.repository';
import { ChannelAnalyticsService } from '@gitroom/nestjs-libraries/database/prisma/channel-analytics/channel-analytics.service';
import { ChannelAnalyticsRepository } from '@gitroom/nestjs-libraries/database/prisma/channel-analytics/channel-analytics.repository';
import { UpdateChannelStrategyDto } from '@gitroom/nestjs-libraries/dtos/integrations/channel-strategy.dto';
import { UpdateChannelUtmParamsDto } from '@gitroom/nestjs-libraries/dtos/integrations/channel-utm-params.dto';
import { normalizeUtmParamsString } from '@gitroom/helpers/utils/utm.params';
import {
  getChannelStrategy,
  isChannelStrategyId,
  resolveChannelStrategy,
  resolveMaterializationConfig,
} from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.registry';
import { getRelationshipTriage as getStrategyRelationshipTriage } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.scoring';
import { RelationshipGradeScheduleService } from '@gitroom/nestjs-libraries/temporal/relationship-grade.schedule.service';

dayjs.extend(utc);

const FOLLOWER_IGNORED_BACKFILL_MAX_PAGES = 5;
const RECENT_FOLLOWERS_DEFAULT_SINCE_DAYS = 30;
const RECENT_FOLLOWERS_MAX_SINCE_DAYS = 90;
const RECENT_FOLLOWERS_OUTBOUND_BACKFILL_MAX_PAGES = 5;

export type RecentFollowersQuery = {
  sinceDays?: number;
  limit?: number;
  cursor?: string;
  withoutOutboundSinceFollow?: boolean;
};

@Injectable()
export class IntegrationService {
  private storage = UploadFactory.createStorage();
  private readonly _logger = new Logger(IntegrationService.name);
  constructor(
    private _integrationRepository: IntegrationRepository,
    private _autopostsRepository: AutopostRepository,
    private _integrationManager: IntegrationManager,
    private _notificationService: NotificationService,
    @Inject(forwardRef(() => RefreshIntegrationService))
    private _refreshIntegrationService: RefreshIntegrationService,
    private _temporalService: TemporalService,
    private _pipelinePlugService: PipelinePlugService,
    private _channelInteractionService: ChannelInteractionService,
    private _channelInteractionRepository: ChannelInteractionRepository,
    private _channelAnalyticsService: ChannelAnalyticsService,
    private _channelAnalyticsRepository: ChannelAnalyticsRepository,
    private _relationshipGradeScheduleService: RelationshipGradeScheduleService
  ) { }

  async changeActiveCron(orgId: string) {
    const data = await this._autopostsRepository.getAutoposts(orgId);

    for (const item of data.filter((f) => f.active)) {
      try {
        await this._temporalService.terminateWorkflow(`autopost-${item.id}`);
      } catch (err) { }
    }

    return true;
  }

  getMentions(platform: string, q: string) {
    return this._integrationRepository.getMentions(platform, q);
  }

  insertMentions(
    platform: string,
    mentions: { name: string; username: string; image: string }[]
  ) {
    return this._integrationRepository.insertMentions(platform, mentions);
  }

  async setTimes(
    orgId: string,
    integrationId: string,
    times: IntegrationTimeDto
  ) {
    return this._integrationRepository.setTimes(orgId, integrationId, times);
  }

  updateProviderSettings(org: string, id: string, additionalSettings: string) {
    return this._integrationRepository.updateProviderSettings(
      org,
      id,
      additionalSettings
    );
  }

  async updateChannelUtmParams(
    orgId: string,
    integrationId: string,
    body: UpdateChannelUtmParamsDto
  ) {
    const integration = await this._integrationRepository.getIntegrationById(
      orgId,
      integrationId
    );
    if (!integration || integration.deletedAt) {
      throw new NotFoundException('Integration not found');
    }

    const normalized = normalizeUtmParamsString(body.utmParams);
    const updated = await this._integrationRepository.updateUtmParams(
      orgId,
      integrationId,
      normalized
    );
    if (!updated) {
      throw new NotFoundException('Integration not found');
    }

    return { utmParams: normalized };
  }

  async updateChannelStrategy(
    orgId: string,
    integrationId: string,
    body: UpdateChannelStrategyDto
  ) {
    const integration = await this._integrationRepository.getIntegrationById(
      orgId,
      integrationId
    );
    if (!integration || integration.deletedAt) {
      throw new NotFoundException('Integration not found');
    }
    if (integration.disabled) {
      throw new BadRequestException('Disabled channels cannot update strategy');
    }
    if (integration.type !== 'social') {
      throw new BadRequestException('Channel strategy is only available for social channels');
    }

    let provider: SocialProvider | undefined;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      provider = undefined;
    }
    if (!provider) {
      throw new BadRequestException('Channel provider is not available');
    }
    if (!provider.followers) {
      throw new BadRequestException(
        'Channel strategy requires follower identities'
      );
    }

    if (!isChannelStrategyId(body.strategyId)) {
      throw new BadRequestException('Unsupported channel strategy');
    }
    const strategy = getChannelStrategy(body.strategyId);
    const changed = await this._integrationRepository.updateStrategy(
      orgId,
      integrationId,
      strategy.id,
      strategy.version
    );
    let recomputeRequested = false;
    if (changed) {
      try {
        await this._relationshipGradeScheduleService.trigger();
        recomputeRequested = true;
      } catch (error) {
        this._logger?.error(
          `Failed to request relationship grade recomputation for channel ${integrationId}`,
          error instanceof Error ? error.stack : String(error)
        );
      }
    }

    return {
      strategy: this.publicStrategy(strategy),
      recomputeRequested,
    };
  }

  async listIntegrationContextDocuments(orgId: string, integrationId: string) {
    const assignments =
      await this._integrationRepository.listIntegrationContextDocuments(
        orgId,
        integrationId
      );
    if (!assignments) {
      throw new NotFoundException('Integration not found');
    }
    return this.toIntegrationContextDocuments(assignments);
  }

  async replaceIntegrationContextDocuments(
    orgId: string,
    integrationId: string,
    documentIds: string[]
  ) {
    if (new Set(documentIds).size !== documentIds.length) {
      throw new BadRequestException(
        'Channel context document IDs must be unique'
      );
    }
    if (documentIds.length) {
      const documents =
        await this._integrationRepository.getOwnedContextDocuments(
          orgId,
          documentIds
        );
      if (documents.length !== documentIds.length) {
        throw new BadRequestException(
          'Channel context documents must belong to the organization'
        );
      }
      if (documents.some((document) => parseSkillFilename(document.name))) {
        throw new BadRequestException(
          'Agent skills cannot be attached as channel context documents'
        );
      }
    }

    const assignments =
      await this._integrationRepository.replaceIntegrationContextDocuments(
        orgId,
        integrationId,
        documentIds
      );
    if (!assignments) {
      throw new NotFoundException('Integration not found');
    }
    return this.toIntegrationContextDocuments(assignments);
  }

  private toIntegrationContextDocuments(
    assignments: Array<{
      contextDocument: {
        id: string;
        name: string;
        fileSize: number;
        updatedAt: Date;
      };
    }>
  ) {
    return [...assignments]
      .filter(({ contextDocument }) => !parseSkillFilename(contextDocument.name))
      .map(({ contextDocument }) => ({
        id: contextDocument.id,
        name: contextDocument.name,
        fileSize: contextDocument.fileSize,
        updatedAt: contextDocument.updatedAt,
      }))
      .sort(
        (first, second) =>
          first.name.localeCompare(second.name) || first.id.localeCompare(second.id)
      );
  }

  checkPreviousConnections(org: string, id: string) {
    return this._integrationRepository.checkPreviousConnections(org, id);
  }

  async createOrUpdateIntegration(
    additionalSettings:
      | {
        title: string;
        description: string;
        type: 'checkbox' | 'text' | 'textarea';
        value: any;
        regex?: string;
      }[]
      | undefined,
    oneTimeToken: boolean,
    org: string,
    name: string,
    picture: string | undefined,
    type: 'article' | 'social',
    internalId: string,
    provider: string,
    token: string,
    refreshToken = '',
    expiresIn?: number,
    username?: string,
    isBetweenSteps = false,
    refresh?: string,
    timezone?: number,
    customInstanceDetails?: string
  ) {
    const uploadedPicture = picture
      ? picture?.indexOf('imagedelivery.net') > -1
        ? picture
        : await this.storage.uploadSimple(picture).catch((err) => {
          console.log('Failed to upload profile picture:', picture, err);
          return undefined;
        })
      : undefined;

    const integration = await this._integrationRepository.createOrUpdateIntegration(
      additionalSettings,
      oneTimeToken,
      org,
      name,
      uploadedPicture,
      type,
      internalId,
      provider,
      token,
      refreshToken,
      expiresIn,
      username,
      isBetweenSteps,
      refresh,
      timezone,
      customInstanceDetails
    );
    await this.requestInteractionReconciliation(integration);
    return integration;
  }

  updateIntegrationGroup(org: string, id: string, group: string) {
    return this._integrationRepository.updateIntegrationGroup(org, id, group);
  }

  updateOnCustomerName(org: string, id: string, name: string) {
    return this._integrationRepository.updateOnCustomerName(org, id, name);
  }

  async reorderCustomer(
    orgId: string,
    customerId: string,
    direction: 'up' | 'down'
  ) {
    const result = await this._integrationRepository.reorderCustomer(
      orgId,
      customerId,
      direction
    );
    if (result === null) {
      throw new NotFoundException('Customer not found');
    }
    if (result === false) {
      throw new BadRequestException('Customer cannot be moved in that direction');
    }
    return result;
  }

  async renameCustomer(orgId: string, customerId: string, name: string) {
    const result = await this._integrationRepository.renameCustomer(
      orgId,
      customerId,
      name
    );
    if (result === null) {
      throw new NotFoundException('Customer not found');
    }
    if (result === false) {
      throw new ConflictException('A group with this name already exists');
    }
    return result;
  }

  getIntegrationsList(org: string) {
    return this._integrationRepository.getIntegrationsList(org);
  }

  async getFollowerChannels(org: Organization) {
    const integrations = await this._integrationRepository.getIntegrationsList(
      org.id
    );
    const limit = pLimit(5);

    const channels = await Promise.all(
      integrations.map((integration) =>
        limit(async () => {
          if (
            integration.disabled ||
            integration.deletedAt ||
            integration.type !== 'social'
          ) {
            return;
          }

          let provider: SocialProvider;
          try {
            provider = this._integrationManager.getSocialIntegration(
              integration.providerIdentifier
            );
          } catch {
            return;
          }

          if (!provider?.followers) {
            return;
          }

          const interactionCapability = provider.channelInteractionWebhooks;
          const cacheKey = `integration:followers:probe:${org.id}:${integration.id}`;
          let eligible: boolean | undefined = interactionCapability ? true : undefined;
          try {
            const cached = await ioRedis.get(cacheKey);
            if (cached === '1') {
              eligible = true;
            } else if (cached === '0') {
              eligible = false;
            }
          } catch { }

          if (eligible === undefined) {
            try {
              const page = await this.getFollowerPage(
                integration,
                provider,
                { limit: 1 }
              );
              eligible = page.items.length > 0;
              try {
                await ioRedis.set(
                  cacheKey,
                  eligible ? '1' : '0',
                  'EX',
                  !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
                    ? 1
                    : 300
                );
              } catch { }
            } catch {
              return;
            }
          }

          if (!eligible) {
            return;
          }

          const tracking = interactionCapability
            ? await this.getInteractionTracking(
              org.id,
              integration.id,
              interactionCapability.getInteractionCoverage()
            )
            : undefined;
          const strategy = resolveChannelStrategy(integration.strategyId);
          const recomputing =
            await this._channelInteractionRepository.hasStaleRelationshipProjections(
              org.id,
              integration.id,
              {
                strategyId: strategy.id,
                strategyVersion: strategy.version,
              }
            );
          return {
            id: integration.id,
            name: integration.name,
            picture: this.sanitizeHttpUrl(integration.picture),
            display: integration.profile || undefined,
            identifier: integration.providerIdentifier,
            sorts: this.getFollowerSorts(provider),
            canFollowAudienceMember:
              typeof provider.followAudienceMember === 'function',
            strategy: this.publicFollowerStrategy(strategy),
            recomputing,
            ...(tracking ? { tracking } : {}),
          };
        })
      )
    );

    return channels.filter(
      (channel): channel is NonNullable<typeof channel> => !!channel
    );
  }

  async getChannelDetails(org: Organization, integrationId: string) {
    const integration = await this._integrationRepository.getIntegrationById(
      org.id,
      integrationId
    );
    if (!integration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }

    let provider: SocialProvider | undefined;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      provider = undefined;
    }

    const coverage =
      provider?.channelInteractionWebhooks?.getInteractionCoverage() ?? [];
    let tracked = provider?.channelInteractionWebhooks
      ? await this._channelInteractionRepository.getInteractionTracking(
        org.id,
        integration.id
      )
      : { followerSync: null, subscriptions: [] };
    if (provider?.channelInteractionWebhooks) {
      await this.reconcileInteractionSubscriptionsIfNeeded(
        integration,
        provider,
        tracked.subscriptions
      );
      tracked = await this._channelInteractionRepository.getInteractionTracking(
        org.id,
        integration.id
      );
    }
    const tracking = provider?.channelInteractionWebhooks
      ? this.getInteractionTrackingMetadata(
        tracked.followerSync,
        tracked.subscriptions,
        coverage,
        undefined,
        { rankingAvailability: false }
      )
      : this.getUnsupportedTrackingMetadata(coverage);
    let profileUrl: string | undefined;
    try {
      profileUrl = this.sanitizeHttpUrl(provider?.profileUrl?.(integration));
    } catch { }

    const trackingAuthorization = provider?.channelInteractionWebhooks
      ?.authorization
      ? {
        connected:
          await this._channelInteractionService.hasInteractionAuthorization(
            integration
          ),
      }
      : undefined;
    const strategyApplicable = !!provider?.followers;
    const strategy = resolveChannelStrategy(integration.strategyId);
    const recomputing = strategyApplicable
      ? await this._channelInteractionRepository.hasStaleRelationshipProjections(
        org.id,
        integration.id,
        { strategyId: strategy.id, strategyVersion: strategy.version }
      )
      : false;

    return {
      id: integration.id,
      name: integration.name,
      picture: this.sanitizeHttpUrl(integration.picture) || '/no-picture.jpg',
      display: integration.profile || undefined,
      identifier: integration.providerIdentifier,
      internalId: integration.internalId,
      type: integration.type,
      disabled: integration.disabled,
      refreshNeeded: integration.refreshNeeded,
      inBetweenSteps: integration.inBetweenSteps,
      ...(integration.deletedAt ? { deleted: true } : {}),
      ...(profileUrl ? { profileUrl } : {}),
      ...(trackingAuthorization ? { trackingAuthorization } : {}),
      strategyApplicable,
      ...(strategyApplicable
        ? { strategy: this.publicStrategy(strategy), recomputing }
        : {}),
      utmParams: integration.utmParams || null,
      recomputeRequested: false,
      tracking,
      subscriptions: this.mapChannelSubscriptions(tracked.subscriptions),
    };
  }

  private publicStrategy(strategy: ReturnType<typeof resolveChannelStrategy>) {
    return {
      id: strategy.id,
      version: strategy.version,
      label: strategy.label,
      description: strategy.description,
    };
  }

  private publicFollowerStrategy(
    strategy: ReturnType<typeof resolveChannelStrategy>
  ) {
    return {
      id: strategy.id,
      version: strategy.version,
      summary: strategy.description,
      ui: {
        defaultFilter: strategy.ui.defaultFilter,
        defaultSort: strategy.ui.defaultSort,
        filterPriority: strategy.ui.filterPriority,
        filterEmphasis: strategy.ui.filterEmphasis,
        compactMetrics: strategy.ui.compactMetrics,
        emptyState: strategy.ui.emptyState,
        assistantInitialCopy: strategy.ui.assistantInitialCopy,
        suggestedQuestions: strategy.ui.suggestedQuestions,
      },
    };
  }

  async startChannelTrackingAuthorization(
    org: Organization,
    integrationId: string
  ) {
    return this._channelInteractionService.startInteractionAuthorization(
      await this.getChannelForTrackingAuthorization(org, integrationId)
    );
  }

  async completeChannelTrackingAuthorization(
    org: Organization,
    integrationId: string,
    params: { code: string; codeVerifier: string }
  ) {
    const integration = await this.getChannelForTrackingAuthorization(
      org,
      integrationId
    );
    await this._channelInteractionService.completeInteractionAuthorization(
      integration,
      params
    );
    await this.requestInteractionReconciliation(integration);
    return { success: true };
  }

  private async getChannelForTrackingAuthorization(
    org: Organization,
    integrationId: string
  ) {
    const integration = await this._integrationRepository.getIntegrationById(
      org.id,
      integrationId
    );
    if (!integration || integration.deletedAt) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }
    return integration;
  }

  private mapChannelSubscriptions(
    subscriptions: {
      eventKey?: string;
      direction?: string;
      remoteIdentifier?: string | null;
      state: ChannelInteractionTrackingState;
      trackingStartedAt?: Date | null;
      failureCategory?: string | null;
      failureReason?: string | null;
      createdAt?: Date;
      updatedAt?: Date;
    }[]
  ) {
    return subscriptions
      .filter((subscription) => subscription.eventKey)
      .map((subscription) => {
        const failureCategory = this.trackingFailureCategory(
          subscription.failureCategory
        );
        return {
          eventKey: subscription.eventKey as string,
          direction: String(subscription.direction || '').toLowerCase(),
          state: String(subscription.state).toLowerCase(),
          ...(subscription.remoteIdentifier
            ? { remoteIdentifier: subscription.remoteIdentifier }
            : {}),
          ...(failureCategory ? { failureCategory } : {}),
          ...(subscription.failureReason
            ? { reason: subscription.failureReason.slice(0, 160) }
            : {}),
          ...(subscription.trackingStartedAt
            ? { trackingStartedAt: subscription.trackingStartedAt.toISOString() }
            : {}),
          ...(subscription.createdAt
            ? { createdAt: subscription.createdAt.toISOString() }
            : {}),
          ...(subscription.updatedAt
            ? { updatedAt: subscription.updatedAt.toISOString() }
            : {}),
        };
      });
  }

  async getFollowers(
    org: Organization,
    actor: FollowerReadActor | User | undefined,
    integrationId: string,
    query: FollowerQuery
  ) {
    const actorUserId = actor && 'userId' in actor
      ? actor.userId
      : actor && 'id' in actor
        ? actor.id
        : undefined;
    const integration = await this._integrationRepository.getIntegrationById(
      org.id,
      integrationId
    );

    if (!integration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }

    if (
      integration.disabled ||
      integration.deletedAt ||
      integration.type !== 'social'
    ) {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    let provider: SocialProvider;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    if (!provider?.followers) {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    const search = normalizeFollowerSearch(query.search);
    const normalizedQuery: FollowerQuery = {
      ...query,
      ...(search ? { search } : { search: undefined }),
    };
    if (
      normalizedQuery.sort === FOLLOWER_DATABASE_MY_GRADE_SORT.key &&
      !actorUserId
    ) {
      throw new HttpException(
        'Sorting followers by my_grade requires an authenticated user',
        HttpStatus.BAD_REQUEST
      );
    }
    if (normalizedQuery.audience && normalizedQuery.triage) {
      throw new HttpException('Invalid follower query', HttpStatus.BAD_REQUEST);
    }
    if (
      normalizedQuery.listId &&
      (normalizedQuery.audience || normalizedQuery.triage)
    ) {
      throw new HttpException('Invalid follower query', HttpStatus.BAD_REQUEST);
    }
    if (normalizedQuery.audience === 'ignored') {
      if (normalizedQuery.cursor && this.isHttpUrl(normalizedQuery.cursor)) {
        throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
      }
      this.assertFollowerCursorQueryIdentity(
        normalizedQuery.cursor,
        search,
        undefined,
        'ignored'
      );
      return this.getIgnoredAudiencePage(
        org.id,
        actorUserId,
        integration,
        provider,
        normalizedQuery
      );
    }
    if (normalizedQuery.audience === 'lead') {
      if (normalizedQuery.cursor && this.isHttpUrl(normalizedQuery.cursor)) {
        throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
      }
      this.assertFollowerCursorQueryIdentity(
        normalizedQuery.cursor,
        search,
        undefined,
        'lead'
      );
      return this.getLeadAudiencePage(
        org.id,
        actorUserId,
        integration,
        normalizedQuery
      );
    }
    if (normalizedQuery.audience === 'followed') {
      if (normalizedQuery.cursor && this.isHttpUrl(normalizedQuery.cursor)) {
        throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
      }
      this.assertFollowerCursorQueryIdentity(
        normalizedQuery.cursor,
        search,
        undefined,
        'followed'
      );
      return this.getFollowedAudiencePage(
        org.id,
        actorUserId,
        integration,
        normalizedQuery
      );
    }
    if (normalizedQuery.audience === 'unfollowed') {
      if (normalizedQuery.cursor && this.isHttpUrl(normalizedQuery.cursor)) {
        throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
      }
      this.assertFollowerCursorQueryIdentity(
        normalizedQuery.cursor,
        search,
        undefined,
        'unfollowed'
      );
      return this.getUnfollowedAudiencePage(
        org.id,
        actorUserId,
        integration,
        normalizedQuery
      );
    }
    if (normalizedQuery.audience === 'cultivate') {
      if (normalizedQuery.cursor && this.isHttpUrl(normalizedQuery.cursor)) {
        throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
      }
      this.assertFollowerCursorQueryIdentity(
        normalizedQuery.cursor,
        search,
        undefined,
        'cultivate'
      );
      return this.getCultivateAudiencePage(
        org.id,
        actorUserId,
        integration,
        provider,
        normalizedQuery
      );
    }
    if (this.isHotMaterializedQuery(normalizedQuery)) {
      if (normalizedQuery.cursor && this.isHttpUrl(normalizedQuery.cursor)) {
        throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
      }
      this.assertHotMaterializedQueryCompatible(normalizedQuery);
      this.assertFollowerCursorQueryIdentity(
        normalizedQuery.cursor,
        search,
        normalizedQuery.audience === 'hot' ? undefined : normalizedQuery.triage,
        normalizedQuery.audience === 'hot' ? 'hot' : undefined
      );
      return this.getHotAudiencePage(
        org.id,
        actorUserId,
        integration,
        provider,
        normalizedQuery
      );
    }
    const sort = this.validateFollowerQuery(provider, normalizedQuery);
    if (sort?.scope === 'database') {
      return this.getDatabaseFollowerPage(
        org.id,
        actorUserId,
        integration,
        provider,
        normalizedQuery,
        sort
      );
    }

    if (search || query.triage || query.listId || query.isBot !== undefined) {
      return this.getAudienceFollowerPage(
        org.id,
        actorUserId,
        integration,
        provider,
        normalizedQuery,
        sort
      );
    }

    try {
      return await this.getFollowerPageWithIgnoredBackfill(
        org.id,
        actorUserId,
        integration,
        provider,
        normalizedQuery
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Followers are temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  async getRecentFollowers(
    org: Organization,
    actor: FollowerReadActor | User | undefined,
    integrationId: string,
    query: RecentFollowersQuery = {}
  ): Promise<FollowerPage> {
    const actorUserId = actor && 'userId' in actor
      ? actor.userId
      : actor && 'id' in actor
        ? actor.id
        : undefined;
    const integration = await this._integrationRepository.getIntegrationById(
      org.id,
      integrationId
    );

    if (!integration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }

    if (
      integration.disabled ||
      integration.deletedAt ||
      integration.type !== 'social'
    ) {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    let provider: SocialProvider;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    if (!provider?.followers) {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    const sinceDays = Math.min(
      Math.max(
        1,
        Number.isSafeInteger(query.sinceDays)
          ? (query.sinceDays as number)
          : RECENT_FOLLOWERS_DEFAULT_SINCE_DAYS
      ),
      RECENT_FOLLOWERS_MAX_SINCE_DAYS
    );
    const limit = Math.min(
      Math.max(1, Number.isSafeInteger(query.limit) ? (query.limit as number) : 20),
      100
    );
    const withoutOutboundSinceFollow = query.withoutOutboundSinceFollow === true;
    const since = dayjs.utc().subtract(sinceDays, 'day').toDate();
    let cursor = query.cursor
      ? this.decodeRecentFollowerCursor(
        query.cursor,
        org.id,
        integration.id,
        sinceDays,
        withoutOutboundSinceFollow
      )
      : undefined;

    const accumulated: Follower[] = [];
    let hasMore = false;
    let dbHasMore = false;
    let lastFetchedCursor: RecentFollowerCursor | undefined;

    for (
      let pageIndex = 0;
      pageIndex <
      (withoutOutboundSinceFollow
        ? RECENT_FOLLOWERS_OUTBOUND_BACKFILL_MAX_PAGES
        : 1);
      pageIndex++
    ) {
      const ranked = await this._channelInteractionRepository.getRecentFollowers({
        organizationId: org.id,
        integrationId: integration.id,
        userId: actorUserId,
        since,
        limit,
        ...(cursor ? { cursor } : {}),
      });

      const mapped = ranked.items.map((row) =>
        this.mapAudienceMemberProfile(row)
      );
      const filtered = withoutOutboundSinceFollow
        ? mapped.filter((follower) =>
          this.isWithoutOutboundSinceFollow(follower)
        )
        : mapped;

      let took = 0;
      for (const follower of filtered) {
        if (accumulated.length >= limit) {
          break;
        }
        accumulated.push(follower);
        took++;
      }

      const lastFetched = ranked.items.at(-1);
      if (lastFetched?.followedAt) {
        lastFetchedCursor = {
          followedAt: lastFetched.followedAt.toISOString(),
          externalId: lastFetched.externalId,
        };
        cursor = lastFetchedCursor;
      }

      dbHasMore = ranked.hasMore;
      if (!withoutOutboundSinceFollow) {
        hasMore = ranked.hasMore;
        break;
      }

      if (accumulated.length >= limit) {
        hasMore = took < filtered.length || ranked.hasMore;
        break;
      }
      if (!ranked.hasMore) {
        hasMore = false;
        break;
      }
    }

    if (
      withoutOutboundSinceFollow &&
      accumulated.length < limit &&
      dbHasMore
    ) {
      hasMore = true;
    }

    const lastReturned = accumulated.at(-1);
    const cursorForNext =
      withoutOutboundSinceFollow &&
        accumulated.length < limit &&
        lastFetchedCursor
        ? lastFetchedCursor
        : lastReturned?.followedAt
          ? {
            followedAt: lastReturned.followedAt,
            externalId: lastReturned.id,
          }
          : undefined;
    const tracking = provider.channelInteractionWebhooks
      ? await this.getInteractionTracking(
        org.id,
        integration.id,
        provider.channelInteractionWebhooks.getInteractionCoverage()
      )
      : undefined;

    return {
      items: accumulated,
      hasMore,
      ...(hasMore && cursorForNext
        ? {
          nextCursor: this.encodeRecentFollowerCursor({
            organizationId: org.id,
            integrationId: integration.id,
            sinceDays,
            withoutOutboundSinceFollow,
            followedAt: cursorForNext.followedAt,
            externalId: cursorForNext.externalId,
          }),
        }
        : {}),
      ...(tracking ? { tracking } : {}),
    };
  }

  async getFollowerMemberDetails(
    org: Organization,
    actor: FollowerReadActor | User | undefined,
    integrationId: string,
    externalId?: string,
    username?: string
  ): Promise<FollowerMemberDetail> {
    const { provider } = await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      const resolvedExternalId = externalId
        ? externalId
        : username
          ? await this._channelInteractionRepository.findMemberExternalIdByUsername(
            org.id,
            integrationId,
            username
          )
          : null;
      if (!resolvedExternalId) {
        throw new HttpException('Follower was not found', HttpStatus.NOT_FOUND);
      }
      const details = await this._channelInteractionService.getFollowerDetails(
        org.id,
        integrationId,
        resolvedExternalId,
        actor && 'userId' in actor
          ? actor.userId
          : actor && 'id' in actor
            ? actor.id
            : undefined
      );
      return this.mapFollowerMemberDetails(details, provider);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('Follower was not found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async getFollowerMemberTimeline(
    org: Organization,
    integrationId: string,
    externalId?: string,
    username?: string,
    limit = 20,
    cursor?: string
  ): Promise<MemberPostsPage> {
    const integration = await this._integrationRepository.getIntegrationById(
      org.id,
      integrationId
    );

    if (!integration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }

    if (
      integration.disabled ||
      integration.deletedAt ||
      integration.type !== 'social'
    ) {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    let provider: SocialProvider;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    if (!provider?.memberPosts) {
      throw new HttpException(
        'Member timeline is unavailable for this channel',
        HttpStatus.BAD_REQUEST
      );
    }

    const resolvedExternalId = externalId
      ? externalId
      : username
        ? await this._channelInteractionRepository.findMemberExternalIdByUsername(
          org.id,
          integrationId,
          username
        )
        : null;

    if (!resolvedExternalId) {
      throw new HttpException('Follower was not found', HttpStatus.NOT_FOUND);
    }

    const page = await this.getMemberPostsPage(
      integration,
      provider,
      resolvedExternalId,
      { limit, ...(cursor ? { cursor } : {}) }
    );

    return {
      items: page.items.map((post) => ({
        externalId: post.externalId,
        url: post.url,
        content: post.content,
        publishedAt: post.publishedAt,
        ...(post.media?.length ? { media: post.media } : {}),
      })),
      hasMore: page.hasMore,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  async createFollowerMemberNote(
    org: Organization,
    user: User,
    integrationId: string,
    externalId: string,
    content: string
  ): Promise<FollowerMemberNote> {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      const note = await this._channelInteractionService.createFollowerNote(
        org.id,
        integrationId,
        externalId,
        user.id,
        content
      );
      return this.mapFollowerMemberNote(note);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('Follower was not found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async updateFollowerMemberNote(
    org: Organization,
    integrationId: string,
    noteId: string,
    content: string
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      await this._channelInteractionService.updateFollowerNote(
        org.id,
        integrationId,
        noteId,
        content
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('Follower note was not found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async deleteFollowerMemberNote(
    org: Organization,
    integrationId: string,
    noteId: string
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      await this._channelInteractionService.deleteFollowerNote(
        org.id,
        integrationId,
        noteId
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('Follower note was not found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async listFollowerLists(org: Organization, integrationId: string): Promise<FollowerList[]> {
    await this.getFollowerIntegrationProvider(org, integrationId);
    const lists = await this._channelInteractionService.listFollowerLists(
      org.id,
      integrationId
    );
    return lists.map((list) => this.mapFollowerList(list));
  }

  async getStoredFollowerAudienceCounts(
    org: Organization,
    integrationId: string
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    return this._channelInteractionService.getStoredFollowerAudienceCounts(
      org.id,
      integrationId
    );
  }

  /**
   * Platform follower total (snapshot preferred, else list page total) plus
   * stored CRM category and named-list counts. Category counts must not be
   * summed as a follower total.
   */
  async getFollowerAudienceSummary(
    org: Organization,
    actor: FollowerReadActor | User | undefined,
    integrationId: string
  ) {
    const [all, stored, snapshot] = await Promise.all([
      this.getFollowers(org, actor, integrationId, { limit: 1 }),
      this.getStoredFollowerAudienceCounts(org, integrationId),
      this.getLatestAccountAudienceTotal(org, integrationId).catch(() => null),
    ]);

    const listTotal = all.total ?? null;
    const total = snapshot?.value ?? listTotal;
    const totalSource =
      snapshot != null
        ? ('snapshot' as const)
        : listTotal != null
          ? ('list' as const)
          : null;

    return {
      total,
      totalAsOf: snapshot?.asOf ?? null,
      totalSource,
      categories: stored.categories,
      lists: stored.lists,
      listsTruncated: stored.listsTruncated,
      tracking: all.tracking ?? null,
    };
  }

  async createFollowerList(
    org: Organization,
    user: User,
    integrationId: string,
    name: string,
    color?: string | null
  ): Promise<FollowerList> {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      const list = await this._channelInteractionService.createFollowerList(
        org.id,
        integrationId,
        user.id,
        name,
        color
      );
      return this.mapFollowerList(list);
    } catch (error) {
      this.rethrowFollowerListError(error);
    }
  }

  async updateFollowerList(
    org: Organization,
    integrationId: string,
    listId: string,
    name: string,
    color?: string | null
  ): Promise<FollowerList> {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      const list = await this._channelInteractionService.updateFollowerList(
        org.id,
        integrationId,
        listId,
        name,
        color
      );
      return this.mapFollowerList(list);
    } catch (error) {
      this.rethrowFollowerListError(error);
    }
  }

  async deleteFollowerList(
    org: Organization,
    integrationId: string,
    listId: string
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      await this._channelInteractionService.deleteFollowerList(
        org.id,
        integrationId,
        listId
      );
    } catch (error) {
      this.rethrowFollowerListError(error);
    }
  }

  async addFollowerListMember(
    org: Organization,
    user: User,
    integrationId: string,
    listId: string,
    externalId: string
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      await this._channelInteractionService.addFollowerListMember(
        org.id,
        integrationId,
        listId,
        externalId,
        user.id
      );
    } catch (error) {
      this.rethrowFollowerListError(error);
    }
  }

  async importFollowerListMemberFromUrl(
    org: Organization,
    user: User,
    integrationId: string,
    listId: string,
    url: string
  ) {
    const trimmedUrl = typeof url === 'string' ? url.trim() : '';
    if (!trimmedUrl || trimmedUrl.length > 2048) {
      throw new HttpException('Invalid profile URL', HttpStatus.BAD_REQUEST);
    }

    const integration = await this._integrationRepository.getIntegrationById(
      org.id,
      integrationId
    );
    if (!integration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }
    if (
      integration.disabled ||
      integration.deletedAt ||
      integration.type !== 'social'
    ) {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    let provider: SocialProvider;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }
    if (!provider?.followers) {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }
    if (!provider.resolveAudienceProfileFromUrl) {
      throw new HttpException(
        'Importing by URL is not supported for this channel',
        HttpStatus.BAD_REQUEST
      );
    }

    const liveIntegration = { ...integration };
    if (
      !!liveIntegration.tokenExpiration &&
      dayjs(liveIntegration.tokenExpiration).isBefore(dayjs())
    ) {
      const data = await this._refreshIntegrationService.refresh(liveIntegration);
      if (!data || !data.accessToken) {
        throw new HttpException(
          'Followers are temporarily unavailable',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      liveIntegration.token = data.accessToken;
      if (provider.refreshWait) {
        await timer(10000);
      }
    }

    let profile: Follower | null;
    try {
      profile = await provider.resolveAudienceProfileFromUrl(
        liveIntegration.token,
        liveIntegration,
        trimmedUrl
      );
    } catch {
      throw new HttpException(
        'Could not resolve this profile URL',
        HttpStatus.BAD_REQUEST
      );
    }
    if (!profile) {
      throw new HttpException(
        'Profile not found or URL does not match this channel',
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      return await this._channelInteractionService.importFollowerListMember(
        org.id,
        integrationId,
        listId,
        profile,
        user.id
      );
    } catch (error) {
      this.rethrowFollowerListError(error);
    }
  }

  async removeFollowerListMember(
    org: Organization,
    integrationId: string,
    listId: string,
    externalId: string
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      await this._channelInteractionService.removeFollowerListMember(
        org.id,
        integrationId,
        listId,
        externalId
      );
    } catch (error) {
      this.rethrowFollowerListError(error);
    }
  }

  async removeFollowerListMembers(
    org: Organization,
    integrationId: string,
    listId: string,
    options: {
      externalIds?: string[];
      onlyFollowing?: boolean;
    }
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      return await this._channelInteractionService.removeFollowerListMembers(
        org.id,
        integrationId,
        listId,
        options
      );
    } catch (error) {
      this.rethrowFollowerListError(error);
    }
  }

  async followFollowerMember(
    org: Organization,
    integrationId: string,
    externalId: string
  ) {
    const { integration, provider } = await this.getFollowerIntegrationProvider(
      org,
      integrationId
    );
    if (!provider.followAudienceMember) {
      throw new HttpException(
        'Following is not supported for this channel',
        HttpStatus.BAD_REQUEST
      );
    }

    const liveIntegration = { ...integration };
    if (
      !!liveIntegration.tokenExpiration &&
      dayjs(liveIntegration.tokenExpiration).isBefore(dayjs())
    ) {
      const data = await this._refreshIntegrationService.refresh(liveIntegration);
      if (!data || !data.accessToken) {
        throw new HttpException(
          'Followers are temporarily unavailable',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      liveIntegration.token = data.accessToken;
      if (provider.refreshWait) {
        await timer(10000);
      }
    }

    try {
      await provider.followAudienceMember(
        liveIntegration,
        liveIntegration.token,
        externalId
      );
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not follow this profile';
      throw new HttpException(message, HttpStatus.BAD_REQUEST);
    }

    try {
      return await this._channelInteractionService.markAudienceMemberFollowed(
        org.id,
        integrationId,
        externalId
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('Follower was not found', HttpStatus.NOT_FOUND);
      }
      if (error instanceof BadRequestException) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  async unfollowFollowerMember(
    org: Organization,
    integrationId: string,
    externalId: string
  ) {
    const { integration, provider } = await this.getFollowerIntegrationProvider(
      org,
      integrationId
    );
    if (!provider.unfollowAudienceMember) {
      throw new HttpException(
        'Unfollowing is not supported for this channel',
        HttpStatus.BAD_REQUEST
      );
    }

    const liveIntegration = { ...integration };
    if (
      !!liveIntegration.tokenExpiration &&
      dayjs(liveIntegration.tokenExpiration).isBefore(dayjs())
    ) {
      const data = await this._refreshIntegrationService.refresh(liveIntegration);
      if (!data || !data.accessToken) {
        throw new HttpException(
          'Followers are temporarily unavailable',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      liveIntegration.token = data.accessToken;
      if (provider.refreshWait) {
        await timer(10000);
      }
    }

    try {
      await provider.unfollowAudienceMember(
        liveIntegration,
        liveIntegration.token,
        externalId
      );
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not unfollow this profile';
      throw new HttpException(message, HttpStatus.BAD_REQUEST);
    }

    try {
      return await this._channelInteractionService.markAudienceMemberUnfollowed(
        org.id,
        integrationId,
        externalId
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('Follower was not found', HttpStatus.NOT_FOUND);
      }
      if (error instanceof BadRequestException) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  async ignoreFollowerMemberTriage(
    org: Organization,
    user: User,
    integrationId: string,
    externalId: string,
    triage: string,
    reasons?: string[],
    snooze?: boolean
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      await this._channelInteractionService.ignoreFollowerTriage(
        org.id,
        integrationId,
        externalId,
        triage,
        user.id,
        reasons,
        snooze ? { snooze: true } : undefined
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('Follower was not found', HttpStatus.NOT_FOUND);
      }
      if (error instanceof BadRequestException) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  async ignoreFollowerMember(
    org: Organization,
    user: User,
    integrationId: string,
    externalId: string
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      await this._channelInteractionService.ignoreFollower(
        org.id,
        integrationId,
        externalId,
        user.id
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('Follower was not found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async unignoreFollowerMember(
    org: Organization,
    integrationId: string,
    externalId: string
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      await this._channelInteractionService.unignoreFollower(
        org.id,
        integrationId,
        externalId
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('Follower was not found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  private mapFollowerList(list: {
    id: string;
    name: string;
    color?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): FollowerList {
    return {
      id: list.id,
      name: list.name,
      color: list.color ?? null,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
    };
  }

  private rethrowFollowerListError(error: unknown): never {
    if (error instanceof NotFoundException) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
    if (error instanceof ConflictException) {
      throw new HttpException(error.message, HttpStatus.CONFLICT);
    }
    if (error instanceof BadRequestException) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
    throw error;
  }

  async updateFollowerMemberGrade(
    org: Organization,
    user: User,
    integrationId: string,
    externalId: string,
    grade: number
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      const saved = await this._channelInteractionService.upsertFollowerGrade(
        org.id,
        integrationId,
        externalId,
        user.id,
        grade
      );
      return { myGrade: saved.grade, adjustedGrade: saved.adjustedGrade };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('Follower was not found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async refreshFollowerMemberRelationshipScore(
    org: Organization,
    integrationId: string,
    externalId: string,
    direction: 'their' | 'your'
  ) {
    await this.getFollowerIntegrationProvider(org, integrationId);
    try {
      const saved =
        await this._channelInteractionService.refreshFollowerRelationshipScore(
          org.id,
          integrationId,
          externalId,
          direction
        );
      return this.mapFollowerRelationshipSnapshot(
        {
          snapshotAt: saved.snapshotAt,
          windowStartedAt: new Date(
            saved.snapshotAt.getTime() - RELATIONSHIP_WINDOW_MS
          ),
          effortScore: saved.effortScore,
          reciprocationScore: saved.reciprocationScore,
          reciprocity: saved.reciprocity,
          grade: saved.grade,
          formulaVersion: saved.formulaVersion,
        },
        null
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('Follower was not found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  private async getFollowerIntegrationProvider(
    org: Organization,
    integrationId: string
  ): Promise<{ integration: Integration; provider: SocialProvider }> {
    const integration = await this._integrationRepository.getIntegrationById(
      org.id,
      integrationId
    );

    if (!integration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }

    if (
      integration.disabled ||
      integration.deletedAt ||
      integration.type !== 'social'
    ) {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    let provider: SocialProvider;
    try {
      provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
    } catch {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    if (!provider?.followers) {
      throw new HttpException('Followers are unavailable', HttpStatus.BAD_REQUEST);
    }

    return { integration, provider };
  }

  private mapFollowerMemberDetails(
    details: {
      member: {
        externalId: string;
        name: string | null;
        username: string | null;
        picture: string | null;
        profileUrl: string | null;
        bio: string | null;
        followersCount: number | null;
        followingCount: number | null;
        followedAt: Date | null;
        accountCreatedAt: Date | null;
        noteCount: number;
        likesCount?: number;
        membershipState?: string | null;
        inboundInteractionCount?: number | null;
        weFollowedAt?: Date | null;
        ignoredAt?: Date | null;
        leadFitScore?: number | null;
        leadFitReason?: string | null;
        leadBridgesAsLead?: Array<{
          bridgeExternalId: string;
          bridgeRelationshipGrade: number | null;
          bridgeMember?: { username: string | null; name: string | null } | null;
        }>;
        relationshipGrade: number | null;
        relationshipEffortScore: number | null;
        relationshipReciprocationScore: number | null;
        relationshipNetGap: number | null;
        relationshipTriage: string | null;
        relationshipFormulaVersion: number | null;
        relationshipStrategyId?: string | null;
        relationshipStrategyVersion?: number | null;
        relationshipSnapshotAt: Date | null;
        triageIgnores?: Array<{ triage: string }>;
      };
      snapshots: Array<{
        snapshotAt: Date;
        windowStartedAt: Date;
        effortScore: number;
        reciprocationScore: number;
        reciprocity: number | null;
        grade: number | null;
        formulaVersion: number;
        relationshipStrategyId?: string | null;
        relationshipStrategyVersion?: number | null;
      }>;
      notes: Array<{
        id: string;
        content: string;
        createdAt: Date;
        updatedAt: Date;
        author: {
          id: string;
          name: string | null;
          lastName: string | null;
          email: string;
        };
      }>;
      events: Array<{
        id: string;
        kind: string;
        direction: string;
        eventAt: Date;
        relatedObjectId: string | null;
      }>;
      tracking: {
        followerSync: {
          activeGeneration: string | null;
          status: ChannelFollowerSyncStatus;
          completedAt: Date | null;
        } | null;
        subscriptions: {
          state: ChannelInteractionTrackingState;
          trackingStartedAt?: Date | null;
          failureCategory?: string | null;
          failureReason?: string | null;
        }[];
      };
      myGrade?: number | null;
    },
    provider: SocialProvider
  ): FollowerMemberDetail {
    const myGrade = details.myGrade ?? null;
    const now = Date.now();
    const ignoredTriages = new Set(
      (details.member.triageIgnores ?? [])
        .filter(
          (ignore: { triage: string; expiresAt?: Date | null }) =>
            ignore.expiresAt == null ||
            (ignore.expiresAt instanceof Date
              ? ignore.expiresAt.getTime() > now
              : new Date(ignore.expiresAt).getTime() > now)
        )
        .map((ignore: { triage: string }) => ignore.triage)
    );
    const history = details.snapshots.map((snapshot) =>
      this.mapFollowerRelationshipSnapshot(snapshot, myGrade)
    );
    const projected =
      this.mapFollowerRelationshipFromProjection(details.member, myGrade) ??
      (history.length ? history[history.length - 1] : null);
    const current =
      projected && ignoredTriages.has(projected.triage)
        ? { ...projected, triage: null }
        : projected;
    const coverage =
      provider.channelInteractionWebhooks?.getInteractionCoverage() ?? [];
    const tracking =
      provider.channelInteractionWebhooks && coverage.length
        ? this.getInteractionTrackingMetadata(
          details.tracking.followerSync,
          details.tracking.subscriptions,
          coverage,
          undefined,
          { rankingAvailability: false }
        )
        : this.getUnsupportedTrackingMetadata(coverage);

    return {
      follower: {
        ...this.mapAudienceMemberProfile(details.member),
        ...this.followerLeadFields(details.member, ignoredTriages),
        ...(details.member.leadFitScore != null
          ? { leadFitScore: details.member.leadFitScore }
          : {}),
        ...(details.member.leadFitReason
          ? { leadFitReason: details.member.leadFitReason }
          : {}),
        ...this.mapLeadBridges(details.member.leadBridgesAsLead),
        ...(details.member.ignoredAt ? { isIgnored: true } : {}),
      },
      notes: details.notes.map((note) => this.mapFollowerMemberNote(note)),
      interactions: details.events.map((event) =>
        this.mapFollowerMemberInteraction(event)
      ),
      relationship: {
        windowDays: RELATIONSHIP_WINDOW_DAYS,
        cadenceDays: RELATIONSHIP_CADENCE_DAYS,
        formulaVersion:
          current?.formulaVersion ??
          history.at(-1)?.formulaVersion ??
          RELATIONSHIP_FORMULA_VERSION,
        current,
        history,
      },
      myGrade,
      tracking,
    };
  }

  private mapAudienceMemberProfile(member: {
    externalId: string;
    name: string | null;
    username: string | null;
    picture: string | null;
    profileUrl: string | null;
    bio: string | null;
    followersCount: number | null;
    followingCount: number | null;
    followedAt: Date | null;
    weFollowedAt?: Date | null;
    accountCreatedAt: Date | null;
    noteCount?: number;
    likesCount?: number;
    inboundInteractionCount?: number;
    lastInboundAt?: Date | null;
    lastOutboundAt?: Date | null;
    relationshipGrade?: number | null;
    relationshipEffortScore?: number | null;
    relationshipReciprocationScore?: number | null;
    relationshipNetGap?: number | null;
    relationshipTriage?: string | null;
    relationshipFormulaVersion?: number | null;
    relationshipSnapshotAt?: Date | null;
    membershipState?: string | null;
    botGrade?: number | null;
    isBot?: boolean | null;
    botConfidence?: number | null;
    botFormulaVersion?: number | null;
    botGradedAt?: Date | null;
    myGrade?: number | null;
    personalGrades?: Array<{ grade: number }>;
    listMemberships?: Array<{ listId: string }>;
    listIds?: string[];
    triageIgnores?: Array<{ triage: string }>;
    ignoredTriages?: string[];
    ignoredAt?: Date | null;
  }): Follower {
    return this.sanitizeFollower({
      id: member.externalId,
      name: member.name || member.username || member.externalId,
      ...(member.username ? { username: member.username } : {}),
      ...(member.picture ? { picture: member.picture } : {}),
      ...(member.profileUrl ? { profileUrl: member.profileUrl } : {}),
      ...(member.bio ? { bio: member.bio } : {}),
      ...(member.followersCount != null
        ? { followersCount: member.followersCount }
        : {}),
      ...(member.followingCount != null
        ? { followingCount: member.followingCount }
        : {}),
      ...(member.followedAt
        ? { followedAt: member.followedAt.toISOString() }
        : {}),
      ...(member.weFollowedAt
        ? {
          weFollowedAt: member.weFollowedAt.toISOString(),
          isFollowed: true,
        }
        : {}),
      ...(member.accountCreatedAt
        ? { accountCreatedAt: member.accountCreatedAt.toISOString() }
        : {}),
      ...(Number.isSafeInteger(member.noteCount) && member.noteCount! >= 0
        ? { noteCount: member.noteCount }
        : {}),
      ...(Number.isSafeInteger(member.likesCount) && member.likesCount! >= 0
        ? { likesCount: member.likesCount }
        : {}),
      ...(Number.isSafeInteger(member.inboundInteractionCount) &&
        member.inboundInteractionCount! >= 0
        ? { interactionCount: member.inboundInteractionCount }
        : {}),
      ...(member.lastInboundAt
        ? { lastInboundAt: member.lastInboundAt.toISOString() }
        : {}),
      ...(member.lastOutboundAt
        ? { lastOutboundAt: member.lastOutboundAt.toISOString() }
        : {}),
      ...this.followerGradeFields(member),
      ...this.followerBotFields(member),
      ...this.followerRelationshipFields(member),
      ...(() => {
        const listIds = member.listIds
          ?? member.listMemberships?.map((membership) => membership.listId)
          ?? [];
        return listIds.length ? { listIds } : {};
      })(),
      ...(member.ignoredAt ? { isIgnored: true } : {}),
    });
  }

  private isWithoutOutboundSinceFollow(follower: Follower) {
    if (!follower.followedAt) {
      return false;
    }
    if (!follower.lastOutboundAt) {
      return true;
    }
    return (
      new Date(follower.lastOutboundAt).getTime() <
      new Date(follower.followedAt).getTime()
    );
  }

  private followerGradeFields(member?: {
    relationshipGrade?: number | null;
    myGrade?: number | null;
    personalGrades?: Array<{ grade: number }>;
  }) {
    const relationshipGrade = member?.relationshipGrade ?? null;
    const myGrade = member?.myGrade ?? member?.personalGrades?.[0]?.grade ?? null;
    return {
      relationshipGrade,
      myGrade,
      adjustedGrade: applyPersonalRelationshipGrade(relationshipGrade, myGrade),
    };
  }

  private followerBotFields(member?: {
    botGrade?: number | null;
    isBot?: boolean | null;
    botConfidence?: number | null;
    botFormulaVersion?: number | null;
    botGradedAt?: Date | string | null;
  }) {
    return {
      ...(member?.botGrade === null || Number.isSafeInteger(member?.botGrade)
        ? { botGrade: member?.botGrade ?? null }
        : {}),
      ...(member?.isBot === null || typeof member?.isBot === 'boolean'
        ? { isBot: member?.isBot ?? null }
        : {}),
      ...(member?.botConfidence === null || Number.isFinite(member?.botConfidence)
        ? { botConfidence: member?.botConfidence ?? null }
        : {}),
      ...(member?.botFormulaVersion === null ||
        Number.isSafeInteger(member?.botFormulaVersion)
        ? { botFormulaVersion: member?.botFormulaVersion ?? null }
        : {}),
      ...(member?.botGradedAt == null
        ? member?.botGradedAt === null
          ? { botGradedAt: null }
          : {}
        : {
          botGradedAt:
            member.botGradedAt instanceof Date
              ? member.botGradedAt.toISOString()
              : String(member.botGradedAt),
        }),
    };
  }

  private followerRelationshipFields(member?: {
    membershipState?: string | null;
    relationshipEffortScore?: number | null;
    relationshipReciprocationScore?: number | null;
    relationshipNetGap?: number | null;
    relationshipTriage?: string | null;
    relationshipFormulaVersion?: number | null;
    relationshipSnapshotAt?: Date | null;
    triageIgnores?: Array<{ triage: string; expiresAt?: Date | null }>;
    ignoredTriages?: string[];
  }) {
    const effortScore = member?.relationshipEffortScore ?? null;
    const reciprocationScore = member?.relationshipReciprocationScore ?? null;
    const hasProjection =
      Number.isSafeInteger(effortScore) &&
      effortScore! >= 0 &&
      Number.isSafeInteger(reciprocationScore) &&
      reciprocationScore! >= 0;
    if (!hasProjection) {
      return {};
    }
    const rawTriage = this.isRelationshipTriage(member?.relationshipTriage)
      ? member!.relationshipTriage
      : getRelationshipTriage(effortScore!, reciprocationScore!);
    const computedTriage = applyHotTriageMembershipGate(
      rawTriage,
      member?.membershipState
    );
    const now = Date.now();
    const ignored = new Set([
      ...(member?.ignoredTriages ?? []),
      ...(member?.triageIgnores
        ?.filter(
          (ignore) =>
            ignore.expiresAt == null ||
            (ignore.expiresAt instanceof Date
              ? ignore.expiresAt.getTime() > now
              : new Date(ignore.expiresAt).getTime() > now)
        )
        .map((ignore) => ignore.triage) ?? []),
    ]);
    const hotIgnored =
      computedTriage === 'hot_lead' &&
      (ignored.has('hot_lead') || ignored.has('engaged_not_yet'));
    const visibleTriage =
      !computedTriage || hotIgnored || ignored.has(computedTriage)
        ? null
        : computedTriage;
    return {
      effortScore,
      reciprocationScore,
      netGap: member?.relationshipNetGap ??
        reciprocationScore! - effortScore!,
      effortStars: scoreToStars(effortScore!),
      reciprocationStars: scoreToStars(reciprocationScore!),
      ...(visibleTriage ? { relationshipTriage: visibleTriage } : {}),
      relationshipFormulaVersion: member?.relationshipFormulaVersion ?? null,
      relationshipSnapshotAt:
        member?.relationshipSnapshotAt?.toISOString() ?? null,
    };
  }

  private isRelationshipTriage(value: unknown): value is RelationshipTriage {
    return ['quiet', 'hot_lead', 'over_invested', 'mutual'].includes(
      String(value)
    );
  }

  private followerLeadFields(
    member?: {
      membershipState?: string | null;
      inboundInteractionCount?: number | null;
      weFollowedAt?: Date | null;
      leadBridgesAsLead?: Array<unknown>;
    },
    ignoredTriages?: Set<string>
  ) {
    const membership = member?.membershipState;
    const inbound = member?.inboundInteractionCount ?? 0;
    const hasLeadBridge = (member?.leadBridgesAsLead?.length ?? 0) > 0;
    const isLead =
      (membership === 'UNKNOWN' || membership === 'NOT_FOLLOWER') &&
      (inbound > 0 || hasLeadBridge) &&
      !member?.weFollowedAt &&
      !ignoredTriages?.has('lead');
    return isLead ? { isLead: true } : {};
  }

  private mapFollowerMemberNote(note: {
    id: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    author: {
      id: string;
      name: string | null;
      lastName: string | null;
      email: string;
    };
  }): FollowerMemberNote {
    const name = [note.author.name, note.author.lastName]
      .filter((value): value is string => !!value)
      .join(' ')
      .trim();
    return {
      id: note.id,
      content: note.content,
      author: {
        id: note.author.id,
        name: name || this.displayNameFromEmail(note.author.email) || 'Unknown',
      },
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }

  private displayNameFromEmail(email: string) {
    const localPart = email.split('@')[0]?.trim();
    if (!localPart) {
      return '';
    }
    const capitalized =
      localPart.charAt(0).toUpperCase() + localPart.slice(1);
    return capitalized.split('.')[0];
  }

  private mapFollowerMemberInteraction(event: {
    id: string;
    kind: string;
    direction: string;
    eventAt: Date;
    relatedObjectId: string | null;
  }): FollowerMemberInteraction {
    return {
      id: event.id,
      kind: event.kind.toLowerCase() as FollowerMemberInteraction['kind'],
      direction: event.direction.toLowerCase() as FollowerMemberInteraction['direction'],
      timestamp: event.eventAt.toISOString(),
      ...(event.relatedObjectId ? { relatedObjectId: event.relatedObjectId } : {}),
    };
  }

  private mapFollowerRelationshipFromProjection(
    member: {
      membershipState?: string | null;
      relationshipGrade?: number | null;
      relationshipEffortScore?: number | null;
      relationshipReciprocationScore?: number | null;
      relationshipTriage?: string | null;
      relationshipFormulaVersion?: number | null;
      relationshipStrategyId?: string | null;
      relationshipStrategyVersion?: number | null;
      relationshipSnapshotAt?: Date | null;
    },
    myGrade?: number | null
  ): FollowerRelationshipSnapshot | null {
    const effortScore = member.relationshipEffortScore;
    const reciprocationScore = member.relationshipReciprocationScore;
    const snapshotAt = member.relationshipSnapshotAt;
    if (
      !snapshotAt ||
      !Number.isSafeInteger(effortScore) ||
      effortScore! < 0 ||
      !Number.isSafeInteger(reciprocationScore) ||
      reciprocationScore! < 0
    ) {
      return null;
    }
    const calculated = calculateRelationshipGrade(
      effortScore!,
      reciprocationScore!
    );
    const snapshot = this.mapFollowerRelationshipSnapshot(
      {
        snapshotAt,
        windowStartedAt: new Date(
          snapshotAt.getTime() - RELATIONSHIP_WINDOW_MS
        ),
        effortScore: effortScore!,
        reciprocationScore: reciprocationScore!,
        reciprocity: calculated.reciprocity,
        grade: member.relationshipGrade ?? calculated.grade,
        formulaVersion:
          member.relationshipFormulaVersion ?? RELATIONSHIP_FORMULA_VERSION,
        relationshipStrategyId: member.relationshipStrategyId,
        relationshipStrategyVersion: member.relationshipStrategyVersion,
      },
      myGrade,
      this.isRelationshipTriage(member.relationshipTriage)
        ? member.relationshipTriage
        : undefined
    );
    return {
      ...snapshot,
      triage: applyHotTriageMembershipGate(
        snapshot.triage,
        member.membershipState
      ),
    };
  }

  /**
   * Stored rows keep the strategy identity they were graded with, so a channel
   * that switched strategy never re-derives old grades with the new profile.
   */
  private mapFollowerRelationshipSnapshot(
    snapshot: {
      snapshotAt: Date;
      windowStartedAt: Date;
      effortScore: number;
      reciprocationScore: number;
      reciprocity: number | null;
      grade: number | null;
      formulaVersion: number;
      relationshipStrategyId?: string | null;
      relationshipStrategyVersion?: number | null;
    },
    myGrade?: number | null,
    storedTriage?: RelationshipTriage
  ): FollowerRelationshipSnapshot {
    const strategy = isChannelStrategyId(snapshot.relationshipStrategyId)
      ? getChannelStrategy(snapshot.relationshipStrategyId)
      : undefined;
    return {
      snapshotAt: snapshot.snapshotAt.toISOString(),
      windowStartedAt: snapshot.windowStartedAt.toISOString(),
      effortScore: snapshot.effortScore,
      reciprocationScore: snapshot.reciprocationScore,
      reciprocity: snapshot.reciprocity,
      grade: snapshot.grade,
      adjustedGrade: applyPersonalRelationshipGrade(snapshot.grade, myGrade),
      effortStars: scoreToStars(snapshot.effortScore),
      reciprocationStars: scoreToStars(snapshot.reciprocationScore),
      triage:
        storedTriage ??
        (strategy
          ? getStrategyRelationshipTriage(
            {
              effortScore: snapshot.effortScore,
              reciprocationScore: snapshot.reciprocationScore,
            },
            strategy.getScoringProfile()
          )
          : getRelationshipTriage(
            snapshot.effortScore,
            snapshot.reciprocationScore
          )),
      formulaVersion: snapshot.formulaVersion,
      ...(strategy ? { strategyId: strategy.id } : {}),
      ...(Number.isSafeInteger(snapshot.relationshipStrategyVersion)
        ? { strategyVersion: snapshot.relationshipStrategyVersion! }
        : {}),
    };
  }

  private validateFollowerQuery(
    provider: SocialProvider,
    query: FollowerQuery
  ): FollowerSort | undefined {
    if (query.cursor && this.isHttpUrl(query.cursor)) {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }

    const search = normalizeFollowerSearch(query.search);
    this.assertFollowerCursorQueryIdentity(
      query.cursor,
      search,
      query.triage,
      undefined,
      query.listId,
      query.isBot
    );
    if (
      query.cursor?.startsWith('follower-lead:v1:') ||
      query.cursor?.startsWith('follower-lead:v2:') ||
      query.cursor?.startsWith('follower-lead:v3:') ||
      query.cursor?.startsWith('follower-cultivate:v1:') ||
      query.cursor?.startsWith('follower-cultivate:v2:')
    ) {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
    if (query.cursor?.startsWith('follower-ignored:v1:')) {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
    const isAudienceCursor = !!query.cursor?.startsWith('follower-audience:v1:');
    const isRankCursor = !!query.cursor?.startsWith('follower-rank:v1:');
    const isNotesCursor = !!query.cursor?.startsWith('follower-notes:v1:');
    const isLikesCursor = !!query.cursor?.startsWith('follower-likes:v1:');
    const isProjectionCursor =
      !!query.cursor?.startsWith('follower-projection:v1:');
    const isGradeCursor =
      !!query.cursor?.startsWith('follower-relationship-grade:v1:') ||
      !!query.cursor?.startsWith('follower-my-grade:v1:') ||
      !!query.cursor?.startsWith('follower-bot-grade:v1:');

    if (isAudienceCursor && !search && !query.triage && !query.listId) {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }

    if (!query.sort && !query.direction) {
      if (
        isRankCursor ||
        isNotesCursor ||
        isLikesCursor ||
        isGradeCursor ||
        isProjectionCursor
      ) {
        throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
      }
      return undefined;
    }

    const sort = this.getFollowerSorts(provider).find(
      (candidate) => candidate.key === query.sort
    );
    if (!sort || (query.direction && !sort.directions.includes(query.direction))) {
      throw new HttpException('Unsupported follower sort', HttpStatus.BAD_REQUEST);
    }
    if (sort.scope === 'database') {
      if (isAudienceCursor) {
        throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
      }
      if (sort.requiresWindow && !query.window) {
        throw new HttpException(
          'A time window is required for this follower sort',
          HttpStatus.BAD_REQUEST
        );
      }
      return sort;
    }
    if (
      isRankCursor ||
      isNotesCursor ||
      isLikesCursor ||
      isGradeCursor ||
      isProjectionCursor
    ) {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
    return sort;
  }

  private async getDatabaseFollowerPage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    provider: SocialProvider,
    query: FollowerQuery,
    sort: FollowerSort
  ): Promise<FollowerPage> {
    if (sort.key === FOLLOWER_DATABASE_NOTES_SORT.key) {
      return this.getNoteCountFollowerPage(organizationId, userId, integration, query, sort);
    }
    if (sort.key === FOLLOWER_DATABASE_LIKES_SORT.key) {
      return this.getLikesCountFollowerPage(organizationId, userId, integration, query, sort);
    }
    if (sort.key === FOLLOWER_DATABASE_RELATIONSHIP_GRADE_SORT.key) {
      return this.getRelationshipGradeFollowerPage(
        organizationId,
        userId,
        integration,
        query,
        sort
      );
    }
    if (sort.key === FOLLOWER_DATABASE_MY_GRADE_SORT.key) {
      if (!userId) {
        throw new HttpException(
          'Sorting followers by my_grade requires an authenticated user',
          HttpStatus.BAD_REQUEST
        );
      }
      return this.getMyGradeFollowerPage(organizationId, userId, integration, query, sort);
    }
    if (sort.key === FOLLOWER_DATABASE_BOT_GRADE_SORT.key) {
      return this.getBotGradeFollowerPage(
        organizationId,
        userId,
        integration,
        query,
        sort
      );
    }
    if (
      sort.key === FOLLOWER_DATABASE_THEIR_EFFORT_SORT.key ||
      sort.key === FOLLOWER_DATABASE_NET_GAP_SORT.key
    ) {
      return this.getProjectedFollowerPage(
        organizationId,
        userId,
        integration,
        query,
        sort
      );
    }

    const direction = query.direction ?? sort.defaultDirection;
    const window = query.window!;
    const cursor = query.cursor
      ? this.decodeRankedFollowerCursor(
        query.cursor,
        organizationId,
        integration.id,
        window,
        direction
      )
      : undefined;
    const ranked = await this._channelInteractionRepository.getRankedFollowers({
      organizationId,
      integrationId: integration.id,
      window: this.toPrismaInteractionWindow(window),
      direction,
      limit: query.limit,
      ...(cursor ? { cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.triage ? { triage: query.triage } : {}),
      ...(query.listId ? { listId: query.listId } : {}),
      ...(query.isBot !== undefined ? { isBot: query.isBot } : {}),
      ignoredVisibility: 'exclude',
    });
    if (cursor && ranked.rollup?.activeGeneration !== cursor.generation) {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
    const tracking = this.getInteractionTrackingMetadata(
      ranked.followerSync,
      ranked.subscriptions,
      provider.channelInteractionWebhooks!.getInteractionCoverage(),
      ranked.rollup?.computedAt,
      { rankingAvailability: true }
    );
    if (
      !ranked.rollup ||
      !ranked.followerSync?.activeGeneration ||
      !ranked.followerSync.completedAt
    ) {
      return { items: [], hasMore: false, window, tracking };
    }

    const audienceCounts =
      await this._channelInteractionRepository.getFollowerNoteCounts(
        organizationId,
        integration.id,
        ranked.items.map((row) => row.counterpartyExternalId),
        userId
      );
    const items = ranked.items.map((row) =>
      this.sanitizeFollower({
        id: row.counterpartyExternalId,
        name: row.audienceMember.name || row.audienceMember.username || row.counterpartyExternalId,
        ...(row.audienceMember.username ? { username: row.audienceMember.username } : {}),
        ...(row.audienceMember.picture ? { picture: row.audienceMember.picture } : {}),
        ...(row.audienceMember.profileUrl ? { profileUrl: row.audienceMember.profileUrl } : {}),
        ...(row.audienceMember.bio ? { bio: row.audienceMember.bio } : {}),
        ...(row.audienceMember.followersCount !== null ? { followersCount: row.audienceMember.followersCount } : {}),
        ...(row.audienceMember.followingCount !== null ? { followingCount: row.audienceMember.followingCount } : {}),
        ...(row.audienceMember.followedAt ? { followedAt: row.audienceMember.followedAt.toISOString() } : {}),
        ...(row.audienceMember.accountCreatedAt ? { accountCreatedAt: row.audienceMember.accountCreatedAt.toISOString() } : {}),
        interactionCount: row.interactionCount,
        interactionScore: row.interactionScore,
        ...(row.lastInteractionAt ? { lastInteractionAt: row.lastInteractionAt.toISOString() } : {}),
        noteCount: audienceCounts.get(row.counterpartyExternalId)?.noteCount ?? 0,
        likesCount: audienceCounts.get(row.counterpartyExternalId)?.likesCount ?? 0,
        ...this.followerGradeFields(audienceCounts.get(row.counterpartyExternalId)),
        ...this.followerBotFields(audienceCounts.get(row.counterpartyExternalId)),
        ...this.followerRelationshipFields(
          audienceCounts.get(row.counterpartyExternalId)
        ),
      })
    );
    const last = items.at(-1);
    return {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last
        ? {
          nextCursor: this.encodeRankedFollowerCursor({
            organizationId,
            integrationId: integration.id,
            window,
            direction,
            generation: ranked.rollup.activeGeneration,
            search: query.search,
            triage: query.triage,
            listId: query.listId,
            isBot: query.isBot,
            interactionCount: last.interactionCount!,
            interactionScore: last.interactionScore!,
            lastInteractionAt: last.lastInteractionAt || null,
            externalId: last.id,
          }),
        }
        : {}),
      window,
      tracking,
    };
  }

  private async getLeadAudiencePage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    query: FollowerQuery
  ): Promise<FollowerPage> {
    const direction = query.direction ?? 'desc';
    const cursor = query.cursor
      ? this.decodeLeadAudienceCursor(
        query.cursor,
        organizationId,
        integration.id,
        direction,
        query.search
      )
      : undefined;
    const ranked = await this._channelInteractionRepository.getAudienceLeads({
      organizationId,
      integrationId: integration.id,
      userId,
      direction,
      limit: query.limit,
      ...(cursor ? { cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ignoredVisibility: 'exclude',
    });
    const items = ranked.items.map((row) => ({
      ...this.mapAudienceMemberProfile(row),
      isLead: true,
      interactionCount: row.inboundInteractionCount,
      ...(row.leadBridgeScore != null
        ? { leadBridgeScore: row.leadBridgeScore }
        : {}),
      ...(row.leadFitScore != null ? { leadFitScore: row.leadFitScore } : {}),
      ...(row.leadFitReason ? { leadFitReason: row.leadFitReason } : {}),
      ...this.mapLeadBridges(row.leadBridgesAsLead),
      ...(row.lastInboundAt
        ? { lastInteractionAt: row.lastInboundAt.toISOString() }
        : {}),
    }));
    const last = ranked.items.at(-1);
    return {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last
        ? {
          nextCursor: this.encodeLeadAudienceCursor({
            organizationId,
            integrationId: integration.id,
            direction,
            search: query.search,
            audience: 'lead',
            leadFitScore: last.leadFitScore ?? null,
            leadBridgeScore: last.leadBridgeScore ?? null,
            lastInboundAt: last.lastInboundAt
              ? last.lastInboundAt.toISOString()
              : null,
            externalId: last.externalId,
          }),
        }
        : {}),
    };
  }

  private async getFollowedAudiencePage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    query: FollowerQuery
  ): Promise<FollowerPage> {
    const direction = query.direction ?? 'desc';
    const cursor = query.cursor
      ? this.decodeFollowedAudienceCursor(
        query.cursor,
        organizationId,
        integration.id,
        direction,
        query.search
      )
      : undefined;
    const ranked = await this._channelInteractionRepository.getAudienceFollowed({
      organizationId,
      integrationId: integration.id,
      userId,
      direction,
      limit: query.limit,
      ...(cursor ? { cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ignoredVisibility: 'exclude',
    });
    const items = ranked.items.map((row) => this.mapAudienceMemberProfile(row));
    const last = ranked.items.at(-1);
    return {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last?.weFollowedAt
        ? {
          nextCursor: this.encodeFollowedAudienceCursor({
            organizationId,
            integrationId: integration.id,
            direction,
            search: query.search,
            audience: 'followed',
            weFollowedAt: last.weFollowedAt.toISOString(),
            externalId: last.externalId,
          }),
        }
        : {}),
    };
  }

  private async getUnfollowedAudiencePage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    query: FollowerQuery
  ): Promise<FollowerPage> {
    const direction = query.direction ?? 'desc';
    const cursor = query.cursor
      ? this.decodeUnfollowedAudienceCursor(
        query.cursor,
        organizationId,
        integration.id,
        direction,
        query.search
      )
      : undefined;
    const ranked = await this._channelInteractionRepository.getAudienceUnfollowed({
      organizationId,
      integrationId: integration.id,
      userId,
      direction,
      limit: query.limit,
      ...(cursor ? { cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ignoredVisibility: 'exclude',
    });
    const items = ranked.items.map((row) => this.mapAudienceMemberProfile(row));
    const last = ranked.items.at(-1);
    return {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last?.weFollowedAt
        ? {
          nextCursor: this.encodeUnfollowedAudienceCursor({
            organizationId,
            integrationId: integration.id,
            direction,
            search: query.search,
            audience: 'unfollowed',
            weFollowedAt: last.weFollowedAt.toISOString(),
            externalId: last.externalId,
          }),
        }
        : {}),
    };
  }

  private async getCultivateAudiencePage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    provider: SocialProvider,
    query: FollowerQuery
  ): Promise<FollowerPage> {
    const materialization = resolveMaterializationConfig(integration.strategyId);
    const direction = query.direction ?? 'asc';
    const cursor = query.cursor
      ? this.decodeCultivateAudienceCursor(
        query.cursor,
        organizationId,
        integration.id,
        direction,
        query.search
      )
      : undefined;
    const ranked = await this._channelInteractionRepository.getAudienceCultivate({
      organizationId,
      integrationId: integration.id,
      strategyId: materialization.strategyId,
      strategyVersion: materialization.strategyVersion,
      materializationVersion: materialization.materializationVersion,
      userId,
      direction,
      limit: query.limit,
      ...(cursor
        ? {
          hour: cursor.hour,
          cursor: {
            finalRank: cursor.finalRank,
            externalId: cursor.externalId,
          },
        }
        : {}),
      ...(query.search ? { search: query.search } : {}),
    });
    const items = ranked.items.map((row) => ({
      ...this.mapAudienceMemberProfile(row),
      isCultivate: true,
      ...(row.cultivateReason ? { cultivateReason: row.cultivateReason } : {}),
      ...(row.suggestedAction ? { suggestedAction: row.suggestedAction } : {}),
      ...(row.cultivateSource ? { cultivateSource: row.cultivateSource } : {}),
    }));
    const last = ranked.items.at(-1);
    const page: FollowerPage = {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last && ranked.hour
        ? {
          nextCursor: this.encodeCultivateAudienceCursor({
            organizationId,
            integrationId: integration.id,
            direction,
            search: query.search,
            audience: 'cultivate',
            hour: ranked.hour,
            finalRank: last.finalRank,
            externalId: last.externalId,
          }),
        }
        : {}),
    };
    return this.enrichFollowerPageWithInteractionMetrics(
      organizationId,
      userId,
      integration.id,
      provider,
      page
    );
  }

  private async getHotAudiencePage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    provider: SocialProvider,
    query: FollowerQuery
  ): Promise<FollowerPage> {
    const materialization = resolveMaterializationConfig(integration.strategyId);
    const direction = query.direction ?? 'asc';
    const cursor = query.cursor
      ? this.decodeHotAudienceCursor(
        query.cursor,
        organizationId,
        integration.id,
        direction,
        query.search
      )
      : undefined;
    const ranked = await this._channelInteractionRepository.getAudienceHot({
      organizationId,
      integrationId: integration.id,
      strategyId: materialization.strategyId,
      strategyVersion: materialization.strategyVersion,
      materializationVersion: materialization.materializationVersion,
      userId,
      direction,
      limit: query.limit,
      ...(cursor
        ? {
          hour: cursor.hour,
          cursor: {
            finalRank: cursor.finalRank,
            externalId: cursor.externalId,
          },
        }
        : {}),
      ...(query.search ? { search: query.search } : {}),
    });
    const items = ranked.items.map((row) => ({
      ...this.mapAudienceMemberProfile(row),
      isHot: true,
      relationshipTriage: 'hot_lead' as const,
      ...(row.hotReason ? { triageReason: row.hotReason } : {}),
      ...(row.suggestedAction ? { suggestedAction: row.suggestedAction } : {}),
      ...(row.hotSource ? { triageSource: row.hotSource } : {}),
    }));
    const last = ranked.items.at(-1);
    const page: FollowerPage = {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last && ranked.hour
        ? {
          nextCursor: this.encodeHotAudienceCursor({
            organizationId,
            integrationId: integration.id,
            direction,
            search: query.search,
            audience: 'hot',
            hour: ranked.hour,
            finalRank: last.finalRank,
            externalId: last.externalId,
          }),
        }
        : {}),
    };
    return this.enrichFollowerPageWithInteractionMetrics(
      organizationId,
      userId,
      integration.id,
      provider,
      page
    );
  }

  private isHotMaterializedQuery(query: FollowerQuery) {
    return (
      query.audience === 'hot' ||
      query.triage === 'hot_lead' ||
      query.triage === 'engaged_not_yet'
    );
  }

  private assertHotMaterializedQueryCompatible(query: FollowerQuery) {
    const incompatibleSorts = new Set([
      FOLLOWER_DATABASE_INTERACTIONS_SORT.key,
      FOLLOWER_DATABASE_NOTES_SORT.key,
      FOLLOWER_DATABASE_LIKES_SORT.key,
      FOLLOWER_DATABASE_RELATIONSHIP_GRADE_SORT.key,
      FOLLOWER_DATABASE_MY_GRADE_SORT.key,
      FOLLOWER_DATABASE_BOT_GRADE_SORT.key,
      FOLLOWER_DATABASE_THEIR_EFFORT_SORT.key,
      FOLLOWER_DATABASE_NET_GAP_SORT.key,
    ]);
    if (query.sort && incompatibleSorts.has(query.sort)) {
      throw new HttpException('Invalid follower query', HttpStatus.BAD_REQUEST);
    }
    if (query.window) {
      throw new HttpException('Invalid follower query', HttpStatus.BAD_REQUEST);
    }
  }

  private mapLeadBridges(
    bridges?: Array<{
      bridgeExternalId: string;
      bridgeRelationshipGrade: number | null;
      bridgeMember?: { username: string | null; name: string | null } | null;
    }>
  ) {
    if (!bridges?.length) {
      return {};
    }
    return {
      leadBridges: bridges.map((bridge) => ({
        externalId: bridge.bridgeExternalId,
        ...(bridge.bridgeMember?.username
          ? { username: bridge.bridgeMember.username }
          : bridge.bridgeMember?.name
            ? { username: bridge.bridgeMember.name }
            : {}),
        ...(bridge.bridgeRelationshipGrade != null
          ? { grade: bridge.bridgeRelationshipGrade }
          : {}),
      })),
    };
  }

  private async getIgnoredAudiencePage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    provider: SocialProvider,
    query: FollowerQuery
  ): Promise<FollowerPage> {
    const direction = query.direction ?? 'desc';
    const cursor = query.cursor
      ? this.decodeIgnoredAudienceCursor(
        query.cursor,
        organizationId,
        integration.id,
        direction,
        query.search
      )
      : undefined;
    const ranked =
      await this._channelInteractionRepository.getIgnoredAudienceFollowers({
        organizationId,
        integrationId: integration.id,
        userId,
        direction,
        limit: query.limit,
        ...(cursor ? { cursor } : {}),
        ...(query.search ? { search: query.search } : {}),
      });
    const items = ranked.items.map((row) => ({
      ...this.mapAudienceMemberProfile(row),
      isIgnored: true,
    }));
    const last = ranked.items.at(-1);
    const page: FollowerPage = {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last?.ignoredAt
        ? {
          nextCursor: this.encodeIgnoredAudienceCursor({
            organizationId,
            integrationId: integration.id,
            direction,
            search: query.search,
            audience: 'ignored',
            ignoredAt: last.ignoredAt.toISOString(),
            externalId: last.externalId,
          }),
        }
        : {}),
    };
    return this.enrichFollowerPageWithInteractionMetrics(
      organizationId,
      userId,
      integration.id,
      provider,
      page,
      { excludeIgnored: false }
    );
  }

  private async getAudienceFollowerPage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    provider: SocialProvider,
    query: FollowerQuery,
    sort?: FollowerSort
  ): Promise<FollowerPage> {
    const search = query.search;
    const direction = query.direction ?? sort?.defaultDirection ?? 'desc';
    const sortKey = sort?.key ?? 'recent';
    const sortField = getAudienceFollowerSortField(sortKey);
    const cursor = query.cursor
      ? this.decodeAudienceFollowerCursor(
        query.cursor,
        organizationId,
        integration.id,
        sortKey,
        direction,
        search,
        query.triage,
        sortField,
        query.listId,
        query.isBot
      )
      : undefined;
    const ranked = await this._channelInteractionRepository.getAudienceFollowers({
      organizationId,
      integrationId: integration.id,
      userId,
      ...(search ? { search } : {}),
      ...(query.triage ? { triage: query.triage } : {}),
      ...(query.listId ? { listId: query.listId } : {}),
      ...(query.isBot !== undefined ? { isBot: query.isBot } : {}),
      ignoredVisibility: 'exclude',
      sortField,
      direction,
      limit: query.limit,
      ...(cursor ? { cursor } : {}),
    });
    const items = ranked.items.map((row) => this.mapAudienceMemberProfile(row));
    const last = ranked.items.at(-1);
    const page: FollowerPage = {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last
        ? {
          nextCursor: this.encodeAudienceFollowerCursor({
            organizationId,
            integrationId: integration.id,
            sort: sortKey,
            direction,
            search,
            triage: query.triage,
            listId: query.listId,
            isBot: query.isBot,
            sortField,
            sortValue: this.audienceCursorSortValue(last, sortField),
            externalId: last.externalId,
          }),
        }
        : {}),
    };

    return this.enrichFollowerPageWithInteractionMetrics(
      organizationId,
      userId,
      integration.id,
      provider,
      page
    );
  }

  private async getNoteCountFollowerPage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    query: FollowerQuery,
    sort: FollowerSort
  ): Promise<FollowerPage> {
    const direction = query.direction ?? sort.defaultDirection;
    const cursor = query.cursor
      ? this.decodeNoteCountFollowerCursor(
        query.cursor,
        organizationId,
        integration.id,
        direction
      )
      : undefined;
    const ranked = await this._channelInteractionRepository.getFollowersByNoteCount({
      organizationId,
      integrationId: integration.id,
      userId,
      direction,
      limit: query.limit,
      ...(cursor ? { cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.triage ? { triage: query.triage } : {}),
      ...(query.listId ? { listId: query.listId } : {}),
      ...(query.isBot !== undefined ? { isBot: query.isBot } : {}),
      ignoredVisibility: 'exclude',
    });

    const items = ranked.items.map((row) => this.mapAudienceMemberProfile(row));
    const last = items.at(-1);
    return {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last
        ? {
          nextCursor: this.encodeNoteCountFollowerCursor({
            organizationId,
            integrationId: integration.id,
            direction,
            search: query.search,
            triage: query.triage,
            listId: query.listId,
            isBot: query.isBot,
            noteCount: last.noteCount!,
            externalId: last.id,
          }),
        }
        : {}),
    };
  }

  private async getLikesCountFollowerPage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    query: FollowerQuery,
    sort: FollowerSort
  ): Promise<FollowerPage> {
    const direction = query.direction ?? sort.defaultDirection;
    const cursor = query.cursor
      ? this.decodeLikesCountFollowerCursor(
        query.cursor,
        organizationId,
        integration.id,
        direction
      )
      : undefined;
    const ranked = await this._channelInteractionRepository.getFollowersByLikesCount({
      organizationId,
      integrationId: integration.id,
      userId,
      direction,
      limit: query.limit,
      ...(cursor ? { cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.triage ? { triage: query.triage } : {}),
      ...(query.listId ? { listId: query.listId } : {}),
      ...(query.isBot !== undefined ? { isBot: query.isBot } : {}),
      ignoredVisibility: 'exclude',
    });

    const items = ranked.items.map((row) => this.mapAudienceMemberProfile(row));
    const last = items.at(-1);
    return {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last
        ? {
          nextCursor: this.encodeLikesCountFollowerCursor({
            organizationId,
            integrationId: integration.id,
            direction,
            search: query.search,
            triage: query.triage,
            listId: query.listId,
            isBot: query.isBot,
            likesCount: last.likesCount!,
            externalId: last.id,
          }),
        }
        : {}),
    };
  }

  private async getRelationshipGradeFollowerPage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    query: FollowerQuery,
    sort: FollowerSort
  ): Promise<FollowerPage> {
    const direction = query.direction ?? sort.defaultDirection;
    const cursor = query.cursor
      ? this.decodeGradeFollowerCursor(
        query.cursor,
        'follower-relationship-grade:v1:',
        organizationId,
        integration.id,
        direction
      )
      : undefined;
    const ranked =
      await this._channelInteractionRepository.getFollowersByRelationshipGrade({
        organizationId,
        integrationId: integration.id,
        userId,
        direction,
        limit: query.limit,
        ...(cursor ? { cursor } : {}),
        ...(query.search ? { search: query.search } : {}),
        ...(query.triage ? { triage: query.triage } : {}),
        ...(query.listId ? { listId: query.listId } : {}),
        ...(query.isBot !== undefined ? { isBot: query.isBot } : {}),
        ignoredVisibility: 'exclude',
      });
    const items = ranked.items.map((row) => this.mapAudienceMemberProfile(row));
    const last = ranked.items.at(-1);
    return {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last
        ? {
          nextCursor: this.encodeGradeFollowerCursor(
            'follower-relationship-grade:v1:',
            {
              organizationId,
              integrationId: integration.id,
              direction,
              search: query.search,
              triage: query.triage,
              listId: query.listId,
              isBot: query.isBot,
              grade: last.relationshipGrade ?? null,
              externalId: last.externalId,
            }
          ),
        }
        : {}),
    };
  }

  private async getBotGradeFollowerPage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    query: FollowerQuery,
    sort: FollowerSort
  ): Promise<FollowerPage> {
    const direction = query.direction ?? sort.defaultDirection;
    const cursor = query.cursor
      ? this.decodeGradeFollowerCursor(
        query.cursor,
        'follower-bot-grade:v1:',
        organizationId,
        integration.id,
        direction
      )
      : undefined;
    const ranked = await this._channelInteractionRepository.getFollowersByBotGrade({
      organizationId,
      integrationId: integration.id,
      userId,
      direction,
      limit: query.limit,
      ...(cursor ? { cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.triage ? { triage: query.triage } : {}),
      ...(query.listId ? { listId: query.listId } : {}),
      ...(query.isBot !== undefined ? { isBot: query.isBot } : {}),
      ignoredVisibility: 'exclude',
    });
    const items = ranked.items.map((row) => this.mapAudienceMemberProfile(row));
    const last = ranked.items.at(-1);
    return {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last
        ? {
          nextCursor: this.encodeGradeFollowerCursor('follower-bot-grade:v1:', {
            organizationId,
            integrationId: integration.id,
            direction,
            search: query.search,
            triage: query.triage,
            listId: query.listId,
            isBot: query.isBot,
            grade: last.botGrade ?? null,
            externalId: last.externalId,
          }),
        }
        : {}),
    };
  }

  private async getProjectedFollowerPage(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    query: FollowerQuery,
    sort: FollowerSort
  ): Promise<FollowerPage> {
    const direction = query.direction ?? sort.defaultDirection;
    const field = sort.key === FOLLOWER_DATABASE_THEIR_EFFORT_SORT.key
      ? 'relationshipReciprocationScore' as const
      : 'relationshipNetGap' as const;
    const cursor = query.cursor
      ? this.decodeProjectedFollowerCursor(
        query.cursor,
        organizationId,
        integration.id,
        sort.key,
        direction,
        query.search,
        query.triage
      )
      : undefined;
    const ranked =
      await this._channelInteractionRepository.getFollowersByProjectedField({
        organizationId,
        integrationId: integration.id,
        userId,
        field,
        direction,
        limit: query.limit,
        ...(cursor ? { cursor } : {}),
        ...(query.search ? { search: query.search } : {}),
        ...(query.triage ? { triage: query.triage } : {}),
        ...(query.listId ? { listId: query.listId } : {}),
        ...(query.isBot !== undefined ? { isBot: query.isBot } : {}),
        ignoredVisibility: 'exclude',
      });
    const items = ranked.items.map((row) => this.mapAudienceMemberProfile(row));
    const last = ranked.items.at(-1);
    const value = last?.[field] ?? null;
    return {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last
        ? {
          nextCursor: this.encodeProjectedFollowerCursor({
            organizationId,
            integrationId: integration.id,
            sort: sort.key,
            direction,
            search: query.search,
            triage: query.triage,
            listId: query.listId,
            isBot: query.isBot,
            value,
            externalId: last.externalId,
          }),
        }
        : {}),
    };
  }

  private async getMyGradeFollowerPage(
    organizationId: string,
    userId: string,
    integration: Integration,
    query: FollowerQuery,
    sort: FollowerSort
  ): Promise<FollowerPage> {
    const direction = query.direction ?? sort.defaultDirection;
    const cursor = query.cursor
      ? this.decodeGradeFollowerCursor(
        query.cursor,
        'follower-my-grade:v1:',
        organizationId,
        integration.id,
        direction
      )
      : undefined;
    const ranked = await this._channelInteractionRepository.getFollowersByMyGrade({
      organizationId,
      integrationId: integration.id,
      userId,
      direction,
      limit: query.limit,
      ...(cursor ? { cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.triage ? { triage: query.triage } : {}),
      ...(query.listId ? { listId: query.listId } : {}),
      ...(query.isBot !== undefined ? { isBot: query.isBot } : {}),
      ignoredVisibility: 'exclude',
    });
    const items = ranked.items.map((row) => this.mapAudienceMemberProfile(row));
    const last = ranked.items.at(-1);
    return {
      items,
      hasMore: ranked.hasMore,
      ...(ranked.hasMore && last
        ? {
          nextCursor: this.encodeGradeFollowerCursor('follower-my-grade:v1:', {
            organizationId,
            integrationId: integration.id,
            direction,
            search: query.search,
            triage: query.triage,
            listId: query.listId,
            isBot: query.isBot,
            grade: last.personalGrades[0]?.grade ?? null,
            externalId: last.externalId,
          }),
        }
        : {}),
    };
  }

  private async getInteractionTracking(
    organizationId: string,
    integrationId: string,
    coverage: ChannelInteractionKindCoverage[]
  ) {
    const tracking = await this._channelInteractionRepository.getInteractionTracking(
      organizationId,
      integrationId
    );
    return this.getInteractionTrackingMetadata(
      tracking.followerSync,
      tracking.subscriptions,
      coverage,
      undefined,
      { rankingAvailability: false }
    );
  }

  private getInteractionTrackingMetadata(
    followerSync: {
      activeGeneration: string | null;
      status: ChannelFollowerSyncStatus;
      completedAt: Date | null;
    } | null | undefined,
    subscriptions: {
      eventKey?: string;
      direction?: string;
      remoteIdentifier?: string | null;
      state: ChannelInteractionTrackingState;
      trackingStartedAt?: Date | null;
      failureCategory?: string | null;
      failureReason?: string | null;
      createdAt?: Date;
      updatedAt?: Date;
    }[],
    coverage: ChannelInteractionKindCoverage[],
    computedAt?: Date,
    options?: { rankingAvailability?: boolean }
  ): FollowerPageTracking {
    const states = subscriptions.map((subscription) => subscription.state);
    const failedSubscriptions = subscriptions
      .filter(
        (subscription) => subscription.state === ChannelInteractionTrackingState.ERROR
      )
      .map((subscription) => ({
        eventKey: subscription.eventKey || 'unknown',
        direction: String(subscription.direction || '').toLowerCase(),
        ...(subscription.failureReason
          ? { reason: subscription.failureReason.slice(0, 160) }
          : {}),
      }));
    const failedSubscription = subscriptions.find(
      (subscription) => subscription.state === ChannelInteractionTrackingState.ERROR
    );
    const hasError = states.includes(ChannelInteractionTrackingState.ERROR);
    const hasActive = states.includes(ChannelInteractionTrackingState.ACTIVE);
    const state = hasError && hasActive
      ? 'partial'
      : hasError
        ? 'error'
        : states.includes(ChannelInteractionTrackingState.PROVISIONING) ||
          !states.length
          ? 'provisioning'
          : states.includes(ChannelInteractionTrackingState.UNCONFIGURED)
            ? 'unconfigured'
            : states.includes(ChannelInteractionTrackingState.PARTIAL) ||
              this.hasLimitedInteractionCoverage(coverage)
              ? 'partial'
              : 'active';
    const availability = options?.rankingAvailability
      ? followerSync?.activeGeneration && followerSync.completedAt && computedAt
        ? 'ready'
        : state === 'error' || state === 'unconfigured'
          ? 'unavailable'
          : 'provisioning'
      : state === 'error' || state === 'unconfigured'
        ? 'unavailable'
        : state === 'provisioning'
          ? 'provisioning'
          : undefined;
    const trackingStartedAt = subscriptions
      .map((subscription) => subscription.trackingStartedAt)
      .filter((startedAt): startedAt is Date => !!startedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const failureCategory = this.trackingFailureCategory(
      failedSubscription?.failureCategory
    );
    const failureSummary =
      failedSubscriptions.length > 1
        ? `${failedSubscriptions.length} tracking subscriptions failed. See the subscriptions list below for details.`
        : failedSubscriptions[0]?.reason ||
        failedSubscription?.failureReason?.slice(0, 160);
    return {
      state,
      ...(availability ? { availability } : {}),
      noBackfill: true,
      ...(trackingStartedAt
        ? { trackingStartedAt: trackingStartedAt.toISOString() }
        : {}),
      ...(followerSync?.completedAt
        ? { followerSnapshotAt: followerSync.completedAt.toISOString() }
        : {}),
      ...(computedAt ? { computedAt: computedAt.toISOString() } : {}),
      ...(failureCategory ? { failureCategory } : {}),
      ...(failureSummary ? { reason: failureSummary } : {}),
      ...(failedSubscriptions.length
        ? { failedSubscriptions }
        : {}),
      coverage,
    };
  }

  private getUnsupportedTrackingMetadata(
    coverage: ChannelInteractionKindCoverage[] = []
  ): FollowerPageTracking {
    return {
      state: 'unsupported',
      availability: 'unavailable',
      noBackfill: true,
      coverage,
    };
  }

  private hasLimitedInteractionCoverage(
    coverage: ChannelInteractionKindCoverage[]
  ) {
    return coverage.some(
      (item) =>
        item.inbound === 'partial' ||
        item.outbound === 'partial' ||
        item.inbound === 'unsupported' ||
        item.outbound === 'unsupported'
    );
  }

  private trackingFailureCategory(
    value: string | null | undefined
  ): ChannelInteractionTrackingFailureCategory | undefined {
    return [
      'configuration',
      'authentication',
      'authorization',
      'entitlement',
      'quota',
      'transient',
      'unknown',
    ].includes(value || '')
      ? value as ChannelInteractionTrackingFailureCategory
      : undefined;
  }

  private toPrismaInteractionWindow(window: NonNullable<FollowerQuery['window']>) {
    return {
      week: ChannelInteractionWindow.WEEK,
      month: ChannelInteractionWindow.MONTH,
      '90_day': ChannelInteractionWindow.NINETY_DAY,
      year: ChannelInteractionWindow.YEAR,
    }[window];
  }

  private encodeRankedFollowerCursor(cursor: {
    organizationId: string;
    integrationId: string;
    window: NonNullable<FollowerQuery['window']>;
    direction: 'asc' | 'desc';
    generation: string;
    search?: string;
    triage?: FollowerQuery['triage'];
    listId?: string;
    isBot?: boolean;
  } & RankedFollowerCursor) {
    return `follower-rank:v1:${Buffer.from(
      JSON.stringify({ version: 1, ...cursor })
    ).toString('base64url')}`;
  }

  private decodeRankedFollowerCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    window: NonNullable<FollowerQuery['window']>,
    direction: 'asc' | 'desc'
  ): RankedFollowerCursor & { generation: string } {
    try {
      if (!value.startsWith('follower-rank:v1:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(value.slice('follower-rank:v1:'.length), 'base64url').toString(
          'utf8'
        )
      );
      if (
        cursor?.version !== 1 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.window !== window ||
        cursor.direction !== direction ||
        typeof cursor.generation !== 'string' ||
        !Number.isSafeInteger(cursor.interactionCount) ||
        !Number.isSafeInteger(cursor.interactionScore) ||
        typeof cursor.externalId !== 'string' ||
        (cursor.lastInteractionAt !== null &&
          (typeof cursor.lastInteractionAt !== 'string' ||
            Number.isNaN(new Date(cursor.lastInteractionAt).getTime())))
      ) {
        throw new Error();
      }
      return cursor;
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private encodeNoteCountFollowerCursor(cursor: {
    organizationId: string;
    integrationId: string;
    direction: 'asc' | 'desc';
    search?: string;
    triage?: FollowerQuery['triage'];
    listId?: string;
    isBot?: boolean;
  } & NoteCountFollowerCursor) {
    return `follower-notes:v1:${Buffer.from(
      JSON.stringify({ version: 1, ...cursor })
    ).toString('base64url')}`;
  }

  private encodeRecentFollowerCursor(cursor: {
    organizationId: string;
    integrationId: string;
    sinceDays: number;
    withoutOutboundSinceFollow: boolean;
  } & RecentFollowerCursor) {
    return `follower-recent:v1:${Buffer.from(
      JSON.stringify({ version: 1, ...cursor })
    ).toString('base64url')}`;
  }

  private decodeRecentFollowerCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    sinceDays: number,
    withoutOutboundSinceFollow: boolean
  ): RecentFollowerCursor {
    try {
      if (!value.startsWith('follower-recent:v1:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(
          value.slice('follower-recent:v1:'.length),
          'base64url'
        ).toString('utf8')
      );
      if (
        cursor?.version !== 1 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.sinceDays !== sinceDays ||
        cursor.withoutOutboundSinceFollow !== withoutOutboundSinceFollow ||
        typeof cursor.followedAt !== 'string' ||
        Number.isNaN(Date.parse(cursor.followedAt)) ||
        typeof cursor.externalId !== 'string'
      ) {
        throw new Error();
      }
      return {
        followedAt: cursor.followedAt,
        externalId: cursor.externalId,
      };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private decodeNoteCountFollowerCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    direction: 'asc' | 'desc'
  ): NoteCountFollowerCursor {
    try {
      if (!value.startsWith('follower-notes:v1:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(
          value.slice('follower-notes:v1:'.length),
          'base64url'
        ).toString('utf8')
      );
      if (
        cursor?.version !== 1 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.direction !== direction ||
        !Number.isSafeInteger(cursor.noteCount) ||
        cursor.noteCount < 0 ||
        typeof cursor.externalId !== 'string'
      ) {
        throw new Error();
      }
      return {
        noteCount: cursor.noteCount,
        externalId: cursor.externalId,
      };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private encodeLeadAudienceCursor(cursor: {
    organizationId: string;
    integrationId: string;
    direction: 'asc' | 'desc';
    search?: string;
    audience: 'lead';
  } & AudienceLeadCursor) {
    return `follower-lead:v3:${Buffer.from(
      JSON.stringify({ version: 3, ...cursor })
    ).toString('base64url')}`;
  }

  private encodeFollowedAudienceCursor(cursor: {
    organizationId: string;
    integrationId: string;
    direction: 'asc' | 'desc';
    search?: string;
    audience: 'followed';
  } & AudienceFollowedCursor) {
    return `follower-followed:v1:${Buffer.from(
      JSON.stringify({ version: 1, ...cursor })
    ).toString('base64url')}`;
  }

  private encodeUnfollowedAudienceCursor(cursor: {
    organizationId: string;
    integrationId: string;
    direction: 'asc' | 'desc';
    search?: string;
    audience: 'unfollowed';
  } & AudienceUnfollowedCursor) {
    return `follower-unfollowed:v1:${Buffer.from(
      JSON.stringify({ version: 1, ...cursor })
    ).toString('base64url')}`;
  }

  private encodeCultivateAudienceCursor(cursor: {
    organizationId: string;
    integrationId: string;
    direction: 'asc' | 'desc';
    search?: string;
    audience: 'cultivate';
    hour: string;
  } & AudienceCultivateCursor) {
    return `follower-cultivate:v2:${Buffer.from(
      JSON.stringify({ version: 2, ...cursor })
    ).toString('base64url')}`;
  }

  private encodeHotAudienceCursor(cursor: {
    organizationId: string;
    integrationId: string;
    direction: 'asc' | 'desc';
    search?: string;
    audience: 'hot';
    hour: string;
  } & HotPickCursor) {
    return `follower-hot:v1:${Buffer.from(
      JSON.stringify({ version: 1, ...cursor })
    ).toString('base64url')}`;
  }

  private decodeHotAudienceCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    direction: 'asc' | 'desc',
    search: string | undefined
  ): HotPickCursor & { hour: string } {
    try {
      if (!value.startsWith('follower-hot:v1:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(
          value.slice('follower-hot:v1:'.length),
          'base64url'
        ).toString('utf8')
      );
      if (
        cursor?.version !== 1 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.direction !== direction ||
        cursor.search !== search ||
        cursor.audience !== 'hot' ||
        typeof cursor.hour !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(cursor.hour) ||
        !Number.isSafeInteger(cursor.finalRank) ||
        cursor.finalRank < 1 ||
        typeof cursor.externalId !== 'string'
      ) {
        throw new Error();
      }
      return {
        hour: cursor.hour,
        finalRank: cursor.finalRank,
        externalId: cursor.externalId,
      };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private decodeCultivateAudienceCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    direction: 'asc' | 'desc',
    search: string | undefined
  ): AudienceCultivateCursor & { hour: string } {
    try {
      if (!value.startsWith('follower-cultivate:v2:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(
          value.slice('follower-cultivate:v2:'.length),
          'base64url'
        ).toString('utf8')
      );
      if (
        cursor?.version !== 2 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.direction !== direction ||
        cursor.search !== search ||
        cursor.audience !== 'cultivate' ||
        typeof cursor.hour !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(cursor.hour) ||
        !Number.isSafeInteger(cursor.finalRank) ||
        cursor.finalRank < 1 ||
        typeof cursor.externalId !== 'string'
      ) {
        throw new Error();
      }
      return {
        hour: cursor.hour,
        finalRank: cursor.finalRank,
        externalId: cursor.externalId,
      };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private encodeIgnoredAudienceCursor(cursor: {
    organizationId: string;
    integrationId: string;
    direction: 'asc' | 'desc';
    search?: string;
    audience: 'ignored';
  } & IgnoredAudienceFollowerCursor) {
    return `follower-ignored:v1:${Buffer.from(
      JSON.stringify({ version: 1, ...cursor })
    ).toString('base64url')}`;
  }

  private decodeIgnoredAudienceCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    direction: 'asc' | 'desc',
    search: string | undefined
  ): IgnoredAudienceFollowerCursor {
    try {
      if (!value.startsWith('follower-ignored:v1:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(
          value.slice('follower-ignored:v1:'.length),
          'base64url'
        ).toString('utf8')
      );
      if (
        cursor?.version !== 1 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.direction !== direction ||
        cursor.search !== search ||
        cursor.audience !== 'ignored' ||
        typeof cursor.ignoredAt !== 'string' ||
        Number.isNaN(Date.parse(cursor.ignoredAt)) ||
        typeof cursor.externalId !== 'string'
      ) {
        throw new Error();
      }
      return {
        ignoredAt: cursor.ignoredAt,
        externalId: cursor.externalId,
      };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private decodeLeadAudienceCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    direction: 'asc' | 'desc',
    search: string | undefined
  ): AudienceLeadCursor {
    try {
      if (!value.startsWith('follower-lead:v3:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(
          value.slice('follower-lead:v3:'.length),
          'base64url'
        ).toString('utf8')
      );
      if (
        cursor?.version !== 3 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.direction !== direction ||
        cursor.search !== search ||
        cursor.audience !== 'lead' ||
        (cursor.leadFitScore !== null &&
          typeof cursor.leadFitScore !== 'number') ||
        (cursor.leadBridgeScore !== null &&
          typeof cursor.leadBridgeScore !== 'number') ||
        (cursor.lastInboundAt !== null &&
          (typeof cursor.lastInboundAt !== 'string' ||
            Number.isNaN(Date.parse(cursor.lastInboundAt)))) ||
        typeof cursor.externalId !== 'string'
      ) {
        throw new Error();
      }
      return {
        leadFitScore: cursor.leadFitScore,
        leadBridgeScore: cursor.leadBridgeScore,
        lastInboundAt: cursor.lastInboundAt,
        externalId: cursor.externalId,
      };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private decodeFollowedAudienceCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    direction: 'asc' | 'desc',
    search: string | undefined
  ): AudienceFollowedCursor {
    try {
      if (!value.startsWith('follower-followed:v1:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(
          value.slice('follower-followed:v1:'.length),
          'base64url'
        ).toString('utf8')
      );
      if (
        cursor?.version !== 1 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.direction !== direction ||
        cursor.search !== search ||
        cursor.audience !== 'followed' ||
        typeof cursor.weFollowedAt !== 'string' ||
        Number.isNaN(Date.parse(cursor.weFollowedAt)) ||
        typeof cursor.externalId !== 'string'
      ) {
        throw new Error();
      }
      return {
        weFollowedAt: cursor.weFollowedAt,
        externalId: cursor.externalId,
      };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private decodeUnfollowedAudienceCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    direction: 'asc' | 'desc',
    search: string | undefined
  ): AudienceUnfollowedCursor {
    try {
      if (!value.startsWith('follower-unfollowed:v1:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(
          value.slice('follower-unfollowed:v1:'.length),
          'base64url'
        ).toString('utf8')
      );
      if (
        cursor?.version !== 1 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.direction !== direction ||
        cursor.search !== search ||
        cursor.audience !== 'unfollowed' ||
        typeof cursor.weFollowedAt !== 'string' ||
        Number.isNaN(Date.parse(cursor.weFollowedAt)) ||
        typeof cursor.externalId !== 'string'
      ) {
        throw new Error();
      }
      return {
        weFollowedAt: cursor.weFollowedAt,
        externalId: cursor.externalId,
      };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private encodeLikesCountFollowerCursor(cursor: {
    organizationId: string;
    integrationId: string;
    direction: 'asc' | 'desc';
    search?: string;
    triage?: FollowerQuery['triage'];
    listId?: string;
    isBot?: boolean;
  } & LikesCountFollowerCursor) {
    return `follower-likes:v1:${Buffer.from(
      JSON.stringify({ version: 1, ...cursor })
    ).toString('base64url')}`;
  }

  private decodeLikesCountFollowerCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    direction: 'asc' | 'desc'
  ): LikesCountFollowerCursor {
    try {
      if (!value.startsWith('follower-likes:v1:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(
          value.slice('follower-likes:v1:'.length),
          'base64url'
        ).toString('utf8')
      );
      if (
        cursor?.version !== 1 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.direction !== direction ||
        !Number.isSafeInteger(cursor.likesCount) ||
        cursor.likesCount < 0 ||
        typeof cursor.externalId !== 'string'
      ) {
        throw new Error();
      }
      return {
        likesCount: cursor.likesCount,
        externalId: cursor.externalId,
      };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private encodeGradeFollowerCursor(
    prefix:
      | 'follower-relationship-grade:v1:'
      | 'follower-my-grade:v1:'
      | 'follower-bot-grade:v1:',
    cursor: {
      organizationId: string;
      integrationId: string;
      direction: 'asc' | 'desc';
      search?: string;
      triage?: FollowerQuery['triage'];
      listId?: string;
      isBot?: boolean;
    } & GradeFollowerCursor
  ) {
    return `${prefix}${Buffer.from(
      JSON.stringify({ version: 1, ...cursor })
    ).toString('base64url')}`;
  }

  private encodeProjectedFollowerCursor(cursor: {
    organizationId: string;
    integrationId: string;
    sort: string;
    direction: 'asc' | 'desc';
    search?: string;
    triage?: FollowerQuery['triage'];
    listId?: string;
    isBot?: boolean;
  } & ProjectedFollowerCursor) {
    return `follower-projection:v1:${Buffer.from(
      JSON.stringify({ version: 1, ...cursor })
    ).toString('base64url')}`;
  }

  private decodeProjectedFollowerCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    sort: string,
    direction: 'asc' | 'desc',
    search?: string,
    triage?: FollowerQuery['triage']
  ): ProjectedFollowerCursor {
    try {
      if (!value.startsWith('follower-projection:v1:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(
          value.slice('follower-projection:v1:'.length),
          'base64url'
        ).toString('utf8')
      );
      if (
        cursor?.version !== 1 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.sort !== sort ||
        cursor.direction !== direction ||
        cursor.search !== search ||
        cursor.triage !== triage ||
        typeof cursor.externalId !== 'string' ||
        (cursor.value !== null &&
          !(typeof cursor.value === 'number' && Number.isSafeInteger(cursor.value)))
      ) {
        throw new Error();
      }
      return { value: cursor.value, externalId: cursor.externalId };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private decodeGradeFollowerCursor(
    value: string,
    prefix:
      | 'follower-relationship-grade:v1:'
      | 'follower-my-grade:v1:'
      | 'follower-bot-grade:v1:',
    organizationId: string,
    integrationId: string,
    direction: 'asc' | 'desc'
  ): GradeFollowerCursor {
    try {
      if (!value.startsWith(prefix)) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(value.slice(prefix.length), 'base64url').toString('utf8')
      );
      if (
        cursor?.version !== 1 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.direction !== direction ||
        typeof cursor.externalId !== 'string' ||
        (cursor.grade !== null &&
          !(typeof cursor.grade === 'number' && Number.isFinite(cursor.grade)))
      ) {
        throw new Error();
      }
      return {
        grade: cursor.grade,
        externalId: cursor.externalId,
      };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private encodeAudienceFollowerCursor(cursor: {
    organizationId: string;
    integrationId: string;
    sort: string;
    direction: 'asc' | 'desc';
    search?: string;
    triage?: FollowerQuery['triage'];
    listId?: string;
    isBot?: boolean;
    sortField: AudienceFollowerSortField;
  } & AudienceFollowerCursor) {
    return `follower-audience:v1:${Buffer.from(
      JSON.stringify({ version: 1, ...cursor })
    ).toString('base64url')}`;
  }

  private decodeAudienceFollowerCursor(
    value: string,
    organizationId: string,
    integrationId: string,
    sort: string,
    direction: 'asc' | 'desc',
    search: string | undefined,
    triage: FollowerQuery['triage'] | undefined,
    sortField: AudienceFollowerSortField,
    listId?: string,
    isBot?: boolean
  ): AudienceFollowerCursor {
    try {
      if (!value.startsWith('follower-audience:v1:')) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(
          value.slice('follower-audience:v1:'.length),
          'base64url'
        ).toString('utf8')
      );
      if (
        cursor?.version !== 1 ||
        cursor.organizationId !== organizationId ||
        cursor.integrationId !== integrationId ||
        cursor.sort !== sort ||
        cursor.direction !== direction ||
        cursor.search !== search ||
        cursor.triage !== triage ||
        cursor.listId !== listId ||
        cursor.isBot !== isBot ||
        cursor.sortField !== sortField ||
        typeof cursor.externalId !== 'string' ||
        !this.isAudienceCursorSortValue(cursor.sortField, cursor.sortValue)
      ) {
        throw new Error();
      }
      return {
        sortField: cursor.sortField,
        sortValue: cursor.sortValue,
        externalId: cursor.externalId,
      };
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private assertFollowerCursorQueryIdentity(
    value: string | undefined,
    search: string | undefined,
    triage: FollowerQuery['triage'] | undefined,
    audience?: FollowerQuery['audience'],
    listId?: string,
    isBot?: boolean
  ) {
    const internalPrefixes = [
      'follower-audience:v1:',
      'follower-rank:v1:',
      'follower-notes:v1:',
      'follower-likes:v1:',
      'follower-relationship-grade:v1:',
      'follower-my-grade:v1:',
      'follower-bot-grade:v1:',
      'follower-projection:v1:',
      'follower-lead:v1:',
      'follower-lead:v2:',
      'follower-lead:v3:',
      'follower-followed:v1:',
      'follower-unfollowed:v1:',
      'follower-cultivate:v1:',
      'follower-cultivate:v2:',
      'follower-hot:v1:',
      'follower-ignored:v1:',
    ];
    if (!value || !internalPrefixes.some((prefix) => value.startsWith(prefix))) {
      return;
    }
    try {
      const encoded = value.slice(value.lastIndexOf(':') + 1);
      const cursor = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8')
      );
      if (
        cursor.search !== search ||
        cursor.triage !== triage ||
        cursor.audience !== audience ||
        cursor.listId !== listId ||
        cursor.isBot !== isBot
      ) {
        throw new Error();
      }
    } catch {
      throw new HttpException('Invalid follower cursor', HttpStatus.BAD_REQUEST);
    }
  }

  private isAudienceCursorSortValue(
    field: AudienceFollowerSortField,
    value: unknown
  ): value is string | number | null {
    if (value === null) {
      return true;
    }
    if (field === 'followersCount' || field === 'followingCount') {
      return typeof value === 'number' && Number.isSafeInteger(value);
    }
    if (field === 'followedAt' || field === 'accountCreatedAt') {
      return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
    }
    return typeof value === 'string';
  }

  private audienceCursorSortValue(
    row: {
      name: string | null;
      followersCount: number | null;
      followingCount: number | null;
      followedAt: Date | null;
      accountCreatedAt: Date | null;
    },
    sortField: AudienceFollowerSortField
  ): string | number | null {
    const value = row[sortField];
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
    return null;
  }

  private async enrichFollowerPageWithInteractionMetrics(
    organizationId: string,
    userId: string | undefined,
    integrationId: string,
    provider: SocialProvider,
    page: FollowerPage,
    options?: { excludeIgnored?: boolean }
  ): Promise<FollowerPage> {
    if (!page.items.length) {
      return page;
    }
    const excludeIgnored = options?.excludeIgnored !== false;
    if (!provider.channelInteractionWebhooks) {
      return this.attachFollowerListIds(
        organizationId,
        userId,
        integrationId,
        page,
        { excludeIgnored }
      );
    }

    const externalIds = page.items.map((item) => item.id);
    const [metrics, audienceCounts] = await Promise.all([
      this._channelInteractionRepository.getFollowerInteractionMetrics(
        organizationId,
        integrationId,
        externalIds
      ),
      this._channelInteractionRepository.getFollowerNoteCounts(
        organizationId,
        integrationId,
        externalIds,
        userId
      ),
    ]);

    const items = page.items
      .filter((item) => {
        if (!excludeIgnored) {
          return true;
        }
        return !audienceCounts.get(item.id)?.ignoredAt;
      })
      .map((item) => {
        const metric = metrics.get(item.id);
        const counts = audienceCounts.get(item.id);
        return this.sanitizeFollower({
          ...item,
          interactionCount: metric?.interactionCount ?? 0,
          noteCount: counts?.noteCount ?? 0,
          likesCount: counts?.likesCount ?? 0,
          ...this.followerGradeFields(counts),
          ...this.followerRelationshipFields(counts),
          ...(counts?.listIds?.length ? { listIds: counts.listIds } : {}),
          ...(counts?.ignoredAt ? { isIgnored: true } : {}),
          ...(metric
            ? {
              interactionScore: metric.interactionScore,
              ...(metric.lastInteractionAt
                ? {
                  lastInteractionAt:
                    metric.lastInteractionAt.toISOString(),
                }
                : {}),
            }
            : {}),
        });
      });

    return {
      ...page,
      items,
    };
  }

  private async attachFollowerListIds(
    organizationId: string,
    userId: string | undefined,
    integrationId: string,
    page: FollowerPage,
    options?: { excludeIgnored?: boolean }
  ): Promise<FollowerPage> {
    const excludeIgnored = options?.excludeIgnored !== false;
    const audienceCounts =
      await this._channelInteractionRepository.getFollowerNoteCounts(
        organizationId,
        integrationId,
        page.items.map((item) => item.id),
        userId
      );
    return {
      ...page,
      items: page.items
        .filter((item) => {
          if (!excludeIgnored) {
            return true;
          }
          return !audienceCounts.get(item.id)?.ignoredAt;
        })
        .map((item) => {
          const counts = audienceCounts.get(item.id);
          const listIds = counts?.listIds ?? item.listIds;
          return this.sanitizeFollower({
            ...item,
            ...(listIds?.length ? { listIds } : {}),
            ...(counts?.ignoredAt ? { isIgnored: true } : {}),
            ...(!userId ? this.followerGradeFields(counts) : {}),
          });
        }),
    };
  }

  private async getMemberPostsPage(
    integration: Integration,
    provider: SocialProvider,
    externalId: string,
    query: { limit: number; cursor?: string },
    forceRefresh = false
  ): Promise<MemberPostsPage> {
    const liveIntegration = { ...integration };
    if (
      forceRefresh ||
      (!!liveIntegration.tokenExpiration &&
        dayjs(liveIntegration.tokenExpiration).isBefore(dayjs()))
    ) {
      const data = await this._refreshIntegrationService.refresh(liveIntegration);
      if (!data || !data.accessToken) {
        throw new HttpException(
          'Member timeline is temporarily unavailable',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      liveIntegration.token = data.accessToken;
      if (provider.refreshWait) {
        await timer(10000);
      }
    }

    try {
      const page = await provider.memberPosts!(
        liveIntegration,
        liveIntegration.token,
        externalId,
        query
      );
      return {
        items: Array.isArray(page?.items) ? page.items : [],
        hasMore: !!page?.hasMore,
        ...(typeof page?.nextCursor === 'string' &&
          !this.isHttpUrl(page.nextCursor)
          ? { nextCursor: page.nextCursor }
          : {}),
      };
    } catch (error) {
      if (error instanceof RefreshToken && !forceRefresh) {
        return this.getMemberPostsPage(
          integration,
          provider,
          externalId,
          query,
          true
        );
      }
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Member timeline is temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  private async getFollowerPageWithIgnoredBackfill(
    organizationId: string,
    userId: string | undefined,
    integration: Integration,
    provider: SocialProvider,
    query: FollowerQuery
  ): Promise<FollowerPage> {
    const accumulated: Follower[] = [];
    const seen = new Set<string>();
    let lastPage: FollowerPage | undefined;
    let cursor = query.cursor;

    for (
      let pageIndex = 0;
      pageIndex < FOLLOWER_IGNORED_BACKFILL_MAX_PAGES;
      pageIndex++
    ) {
      const rawPage = await this.getFollowerPage(integration, provider, {
        ...query,
        cursor,
      });
      const page = await this.enrichFollowerPageWithInteractionMetrics(
        organizationId,
        userId,
        integration.id,
        provider,
        rawPage,
        { excludeIgnored: true }
      );
      const incoming = page.items.filter((item) => !seen.has(item.id));
      const remaining = query.limit - accumulated.length;

      if (pageIndex > 0 && incoming.length > remaining) {
        break;
      }

      lastPage = page;
      for (const item of incoming) {
        if (accumulated.length >= query.limit) {
          break;
        }
        seen.add(item.id);
        accumulated.push(item);
      }

      if (accumulated.length >= query.limit) {
        break;
      }
      if (!page.hasMore || typeof page.nextCursor !== 'string') {
        break;
      }
      if (page.nextCursor === cursor) {
        break;
      }
      const ignoredRemoved = rawPage.items.length - page.items.length;
      if (ignoredRemoved <= 0 && accumulated.length > 0) {
        break;
      }
      cursor = page.nextCursor;
    }

    const items = accumulated.slice(0, query.limit);
    const pageScoped = isPageScopedFollowerSort(
      this.getFollowerSorts(provider),
      query.sort
    );
    if (pageScoped && query.sort) {
      const sort = this.getFollowerSorts(provider).find(
        (candidate) => candidate.key === query.sort
      );
      const direction = query.direction ?? sort?.defaultDirection ?? 'desc';
      return {
        ...(lastPage ?? { hasMore: false }),
        items: sortFollowers(items, query.sort, direction),
      };
    }

    return {
      ...(lastPage ?? { hasMore: false }),
      items,
    };
  }

  private async getFollowerPage(
    integration: Integration,
    provider: SocialProvider,
    query: FollowerQuery,
    forceRefresh = false
  ): Promise<FollowerPage> {
    const liveIntegration = { ...integration };
    if (
      forceRefresh ||
      (!!liveIntegration.tokenExpiration &&
        dayjs(liveIntegration.tokenExpiration).isBefore(dayjs()))
    ) {
      const data = await this._refreshIntegrationService.refresh(liveIntegration);
      if (!data || !data.accessToken) {
        throw new HttpException(
          'Followers are temporarily unavailable',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      liveIntegration.token = data.accessToken;
      if (provider.refreshWait) {
        await timer(10000);
      }
    }

    try {
      const pageScoped = isPageScopedFollowerSort(
        this.getFollowerSorts(provider),
        query.sort
      );
      const providerQuery: FollowerQuery = pageScoped
        ? { ...query, sort: undefined, direction: undefined, search: undefined }
        : { ...query, search: undefined };
      const page = await provider.followers!(
        liveIntegration,
        liveIntegration.token,
        providerQuery
      );
      const sanitized = this.sanitizeFollowerPage(page);

      if (!pageScoped || !query.sort) {
        return sanitized;
      }

      const sort = this.getFollowerSorts(provider).find(
        (candidate) => candidate.key === query.sort
      );
      const direction = query.direction ?? sort?.defaultDirection ?? 'desc';

      return {
        ...sanitized,
        items: sortFollowers(sanitized.items, query.sort, direction),
      };
    } catch (error) {
      if (error instanceof RefreshToken && !forceRefresh) {
        return this.getFollowerPage(integration, provider, query, true);
      }
      throw error;
    }
  }

  private sanitizeFollowerPage(page: FollowerPage): FollowerPage {
    return {
      items: Array.isArray(page?.items)
        ? page.items.map((follower) => this.sanitizeFollower(follower))
        : [],
      ...(Number.isSafeInteger(page?.total) && page.total >= 0
        ? { total: page.total }
        : {}),
      ...(typeof page?.nextCursor === 'string' &&
        !this.isHttpUrl(page.nextCursor)
        ? { nextCursor: page.nextCursor }
        : {}),
      ...(typeof page?.previousCursor === 'string' &&
        !this.isHttpUrl(page.previousCursor)
        ? { previousCursor: page.previousCursor }
        : {}),
      hasMore: page?.hasMore === true,
    };
  }

  private sanitizeFollower(follower: Follower): Follower {
    return {
      id: String(follower.id),
      name: String(follower.name),
      ...(typeof follower.username === 'string'
        ? { username: follower.username }
        : {}),
      ...(this.sanitizeHttpUrl(follower.picture)
        ? { picture: this.sanitizeHttpUrl(follower.picture) }
        : {}),
      ...(this.sanitizeHttpUrl(follower.profileUrl)
        ? { profileUrl: this.sanitizeHttpUrl(follower.profileUrl) }
        : {}),
      ...(typeof follower.bio === 'string' ? { bio: follower.bio } : {}),
      ...(Number.isFinite(follower.followersCount)
        ? { followersCount: follower.followersCount }
        : {}),
      ...(Number.isFinite(follower.followingCount)
        ? { followingCount: follower.followingCount }
        : {}),
      ...(Number.isFinite(follower.influenceScore)
        ? { influenceScore: follower.influenceScore }
        : {}),
      ...(typeof follower.followedAt === 'string'
        ? { followedAt: follower.followedAt }
        : {}),
      ...(typeof follower.weFollowedAt === 'string'
        ? { weFollowedAt: follower.weFollowedAt }
        : {}),
      ...(follower.isFollowed === true ? { isFollowed: true } : {}),
      ...(typeof follower.accountCreatedAt === 'string'
        ? { accountCreatedAt: follower.accountCreatedAt }
        : {}),
      ...(Number.isSafeInteger(follower.interactionCount) &&
        follower.interactionCount >= 0
        ? { interactionCount: follower.interactionCount }
        : {}),
      ...(Number.isSafeInteger(follower.interactionScore) &&
        follower.interactionScore >= 0
        ? { interactionScore: follower.interactionScore }
        : {}),
      ...(typeof follower.lastInteractionAt === 'string'
        ? { lastInteractionAt: follower.lastInteractionAt }
        : {}),
      ...(typeof follower.lastInboundAt === 'string'
        ? { lastInboundAt: follower.lastInboundAt }
        : {}),
      ...(typeof follower.lastOutboundAt === 'string'
        ? { lastOutboundAt: follower.lastOutboundAt }
        : {}),
      ...(Number.isSafeInteger(follower.noteCount) && follower.noteCount >= 0
        ? { noteCount: follower.noteCount }
        : {}),
      ...(Number.isSafeInteger(follower.likesCount) && follower.likesCount >= 0
        ? { likesCount: follower.likesCount }
        : {}),
      ...(follower.relationshipGrade === null ||
        Number.isFinite(follower.relationshipGrade)
        ? { relationshipGrade: follower.relationshipGrade }
        : {}),
      ...(follower.myGrade === null || Number.isFinite(follower.myGrade)
        ? { myGrade: follower.myGrade }
        : {}),
      ...(follower.adjustedGrade === null || Number.isFinite(follower.adjustedGrade)
        ? { adjustedGrade: follower.adjustedGrade }
        : {}),
      ...(follower.effortScore === null || Number.isSafeInteger(follower.effortScore)
        ? { effortScore: follower.effortScore }
        : {}),
      ...(follower.reciprocationScore === null ||
        Number.isSafeInteger(follower.reciprocationScore)
        ? { reciprocationScore: follower.reciprocationScore }
        : {}),
      ...(follower.netGap === null || Number.isSafeInteger(follower.netGap)
        ? { netGap: follower.netGap }
        : {}),
      ...(follower.effortStars === null || Number.isFinite(follower.effortStars)
        ? { effortStars: follower.effortStars }
        : {}),
      ...(follower.reciprocationStars === null ||
        Number.isFinite(follower.reciprocationStars)
        ? { reciprocationStars: follower.reciprocationStars }
        : {}),
      ...(follower.relationshipTriage === null ||
        this.isRelationshipTriage(follower.relationshipTriage)
        ? { relationshipTriage: follower.relationshipTriage }
        : {}),
      ...(follower.relationshipFormulaVersion === null ||
        Number.isSafeInteger(follower.relationshipFormulaVersion)
        ? { relationshipFormulaVersion: follower.relationshipFormulaVersion }
        : {}),
      ...(follower.relationshipSnapshotAt === null ||
        typeof follower.relationshipSnapshotAt === 'string'
        ? { relationshipSnapshotAt: follower.relationshipSnapshotAt }
        : {}),
      ...(follower.botGrade === null || Number.isSafeInteger(follower.botGrade)
        ? { botGrade: follower.botGrade }
        : {}),
      ...(follower.isBot === null || typeof follower.isBot === 'boolean'
        ? { isBot: follower.isBot }
        : {}),
      ...(follower.botConfidence === null || Number.isFinite(follower.botConfidence)
        ? { botConfidence: follower.botConfidence }
        : {}),
      ...(follower.botFormulaVersion === null ||
        Number.isSafeInteger(follower.botFormulaVersion)
        ? { botFormulaVersion: follower.botFormulaVersion }
        : {}),
      ...(follower.botGradedAt === null || typeof follower.botGradedAt === 'string'
        ? { botGradedAt: follower.botGradedAt }
        : {}),
      ...(Array.isArray(follower.listIds)
        ? {
          listIds: follower.listIds.filter(
            (listId): listId is string => typeof listId === 'string' && !!listId
          ),
        }
        : {}),
      ...(follower.isLead === true ? { isLead: true } : {}),
      ...(follower.isIgnored === true ? { isIgnored: true } : {}),
      ...(follower.isCultivate === true ? { isCultivate: true } : {}),
      ...(typeof follower.cultivateReason === 'string'
        ? { cultivateReason: follower.cultivateReason }
        : {}),
      ...(follower.isHot === true ? { isHot: true } : {}),
      ...(typeof follower.triageReason === 'string'
        ? { triageReason: follower.triageReason }
        : {}),
      ...(typeof follower.triageSource === 'string'
        ? { triageSource: follower.triageSource }
        : {}),
      ...(typeof follower.suggestedAction === 'string'
        ? { suggestedAction: follower.suggestedAction }
        : {}),
      ...(follower.leadBridgeScore === null ||
        Number.isFinite(follower.leadBridgeScore)
        ? { leadBridgeScore: follower.leadBridgeScore }
        : {}),
      ...(follower.leadFitScore === null || Number.isFinite(follower.leadFitScore)
        ? { leadFitScore: follower.leadFitScore }
        : {}),
      ...(typeof follower.leadFitReason === 'string'
        ? { leadFitReason: follower.leadFitReason }
        : {}),
      ...(Array.isArray(follower.leadBridges)
        ? {
          leadBridges: follower.leadBridges
            .filter(
              (bridge) =>
                bridge &&
                typeof bridge.externalId === 'string' &&
                !!bridge.externalId
            )
            .map((bridge) => ({
              externalId: bridge.externalId,
              ...(typeof bridge.username === 'string'
                ? { username: bridge.username }
                : {}),
              ...(Number.isFinite(bridge.grade) ? { grade: bridge.grade } : {}),
            })),
        }
        : {}),
    };
  }

  private getFollowerSorts(provider: SocialProvider) {
    const sorts = [...(provider.followerSorts || [])];
    if (!provider.channelInteractionWebhooks) {
      return sorts;
    }
    if (
      !sorts.some(
        (sort) => sort.key === FOLLOWER_DATABASE_INTERACTIONS_SORT.key
      )
    ) {
      sorts.push(FOLLOWER_DATABASE_INTERACTIONS_SORT);
    }
    if (!sorts.some((sort) => sort.key === FOLLOWER_DATABASE_NOTES_SORT.key)) {
      sorts.push(FOLLOWER_DATABASE_NOTES_SORT);
    }
    if (!sorts.some((sort) => sort.key === FOLLOWER_DATABASE_LIKES_SORT.key)) {
      sorts.push(FOLLOWER_DATABASE_LIKES_SORT);
    }
    if (
      !sorts.some(
        (sort) => sort.key === FOLLOWER_DATABASE_RELATIONSHIP_GRADE_SORT.key
      )
    ) {
      sorts.push(FOLLOWER_DATABASE_RELATIONSHIP_GRADE_SORT);
    }
    if (!sorts.some((sort) => sort.key === FOLLOWER_DATABASE_MY_GRADE_SORT.key)) {
      sorts.push(FOLLOWER_DATABASE_MY_GRADE_SORT);
    }
    if (!sorts.some((sort) => sort.key === FOLLOWER_DATABASE_BOT_GRADE_SORT.key)) {
      sorts.push(FOLLOWER_DATABASE_BOT_GRADE_SORT);
    }
    if (
      !sorts.some((sort) => sort.key === FOLLOWER_DATABASE_THEIR_EFFORT_SORT.key)
    ) {
      sorts.push(FOLLOWER_DATABASE_THEIR_EFFORT_SORT);
    }
    if (!sorts.some((sort) => sort.key === FOLLOWER_DATABASE_NET_GAP_SORT.key)) {
      sorts.push(FOLLOWER_DATABASE_NET_GAP_SORT);
    }
    return sorts;
  }

  private sanitizeHttpUrl(url: string | null | undefined) {
    return typeof url === 'string' && this.isHttpUrl(url) ? url : undefined;
  }

  private isHttpUrl(value: string) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  getIntegrationForOrder(id: string, order: string, user: string, org: string) {
    return this._integrationRepository.getIntegrationForOrder(
      id,
      order,
      user,
      org
    );
  }

  updateNameAndUrl(id: string, name: string, url: string) {
    return this._integrationRepository.updateNameAndUrl(id, name, url);
  }

  getIntegrationById(org: string, id: string) {
    return this._integrationRepository.getIntegrationById(org, id);
  }

  async refreshToken(provider: SocialProvider, refresh: string) {
    try {
      const { refreshToken, accessToken, expiresIn } =
        await provider.refreshToken(refresh);

      if (!refreshToken || !accessToken || !expiresIn) {
        return false;
      }

      return { refreshToken, accessToken, expiresIn };
    } catch (e) {
      return false;
    }
  }

  async disconnectChannel(orgId: string, integration: Integration) {
    await this._integrationRepository.disconnectChannel(orgId, integration.id);
    await this.informAboutRefreshError(orgId, integration);
  }

  async informAboutRefreshError(
    orgId: string,
    integration: Integration,
    err = ''
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}`,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}. Please go back to the system and connect it again ${process.env.FRONTEND_URL}/calendar`,
      true,
      false,
      'info'
    );
  }

  async refreshNeeded(org: string, id: string) {
    return this._integrationRepository.refreshNeeded(org, id);
  }

  async setBetweenRefreshSteps(id: string) {
    return this._integrationRepository.setBetweenRefreshSteps(id);
  }

  async refreshTokens() {
    const integrations = await this._integrationRepository.needsToBeRefreshed();
    for (const integration of integrations) {
      const provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );

      const data = await this.refreshToken(provider, integration.refreshToken!);

      if (!data) {
        await this.informAboutRefreshError(
          integration.organizationId,
          integration
        );
        await this._integrationRepository.refreshNeeded(
          integration.organizationId,
          integration.id
        );
        return;
      }

      const { refreshToken, accessToken, expiresIn } = data;

      await this.createOrUpdateIntegration(
        undefined,
        !!provider.oneTimeToken,
        integration.organizationId,
        integration.name,
        undefined,
        'social',
        integration.internalId,
        integration.providerIdentifier,
        accessToken,
        refreshToken,
        expiresIn
      );
    }
  }

  async disableChannel(org: string, id: string) {
    const integration = await this._integrationRepository.getIntegrationById(org, id);
    await this._integrationRepository.disableChannel(org, id);
    if (integration) {
      await this.requestInteractionRemoval(integration);
    }
  }

  async enableChannel(org: string, totalChannels: number, id: string) {
    const integrations = (
      await this._integrationRepository.getIntegrationsList(org)
    ).filter((f) => !f.disabled);
    if (
      !!process.env.STRIPE_PUBLISHABLE_KEY &&
      integrations.length >= totalChannels
    ) {
      throw new Error('You have reached the maximum number of channels');
    }

    await this._integrationRepository.enableChannel(org, id);
    const integration = await this._integrationRepository.getIntegrationById(org, id);
    if (integration) {
      await this.requestInteractionReconciliation(integration);
    }
  }

  async getPostsForChannel(org: string, id: string) {
    return this._integrationRepository.getPostsForChannel(org, id);
  }

  async deleteChannel(org: string, id: string) {
    const integration = await this._integrationRepository.getIntegrationById(org, id);
    await this._integrationRepository.deleteChannel(org, id);
    if (integration) {
      await this.requestInteractionRemoval(integration);
    }
  }

  async disableIntegrations(org: string, totalChannels: number) {
    return this._integrationRepository.disableIntegrations(org, totalChannels);
  }

  async checkForDeletedOnceAndUpdate(org: string, page: string) {
    return this._integrationRepository.checkForDeletedOnceAndUpdate(org, page);
  }

  async saveProviderPage(org: string, id: string, data: any) {
    const getIntegration = await this._integrationRepository.getIntegrationById(
      org,
      id
    );
    if (!getIntegration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }
    if (!getIntegration.inBetweenSteps) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }

    const provider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (!provider.fetchPageInformation) {
      throw new HttpException(
        'Provider does not support page selection',
        HttpStatus.BAD_REQUEST
      );
    }

    const getIntegrationInformation = await provider.fetchPageInformation(
      getIntegration.token,
      data
    );

    await this.checkForDeletedOnceAndUpdate(
      org,
      String(getIntegrationInformation.id)
    );
    await this._integrationRepository.updateIntegration(id, {
      picture: getIntegrationInformation.picture,
      internalId: String(getIntegrationInformation.id),
      organizationId: org,
      name: getIntegrationInformation.name,
      inBetweenSteps: false,
      token: getIntegrationInformation.access_token,
      profile: getIntegrationInformation.username,
    });

    return { success: true };
  }

  async checkAnalytics(
    org: Organization,
    integration: string,
    date: number | string
  ): Promise<AnalyticsData[]> {
    return this._channelAnalyticsService.getStoredAnalytics(
      org.id,
      integration,
      +date as 7 | 30 | 90
    );
  }

  async getLatestAccountAudienceTotal(
    org: Organization,
    integrationId: string
  ) {
    return this._channelAnalyticsService.getLatestAccountAudienceTotal(
      org.id,
      integrationId
    );
  }

  /**
   * Platform follower/subscriber totals from analytics snapshots for one or
   * many channels. Not limited to Followers-CRM-capable providers.
   */
  async getChannelAudienceTotals(
    org: Organization,
    channelIds?: string[]
  ): Promise<
    Array<{
      channelId: string;
      name: string;
      platform: string;
      total: number | null;
      asOf: string | null;
      label: string | null;
      reason: 'unsupported' | 'not_captured' | 'unavailable' | null;
    }>
  > {
    const MAX_CHANNEL_IDS = 50;
    if (channelIds && channelIds.length > MAX_CHANNEL_IDS) {
      throw new BadRequestException(
        `At most ${MAX_CHANNEL_IDS} channel ids are allowed`
      );
    }
    const integrations = await this._integrationRepository.getIntegrationsList(
      org.id
    );
    const requested = channelIds?.length
      ? new Set(channelIds)
      : undefined;
    const selected = integrations.filter((integration) => {
      if (requested && !requested.has(integration.id)) {
        return false;
      }
      return true;
    });
    if (requested) {
      const found = new Set(selected.map((integration) => integration.id));
      for (const id of requested) {
        if (!found.has(id)) {
          throw new NotFoundException('Integration not found');
        }
      }
    }
    const limit = pLimit(5);
    return Promise.all(
      selected.map((integration) =>
        limit(async () => {
          const base = {
            channelId: integration.id,
            name: integration.name,
            platform: integration.providerIdentifier,
            total: null as number | null,
            asOf: null as string | null,
            label: null as string | null,
          };

          if (
            integration.disabled ||
            integration.deletedAt ||
            integration.type !== 'social'
          ) {
            return { ...base, reason: 'unavailable' as const };
          }

          let provider: SocialProvider;
          try {
            provider = this._integrationManager.getSocialIntegration(
              integration.providerIdentifier
            );
          } catch {
            return { ...base, reason: 'unsupported' as const };
          }

          if (!provider?.analyticsSnapshot) {
            return { ...base, reason: 'unsupported' as const };
          }

          const syncState = await this._channelAnalyticsRepository.getSyncState(
            org.id,
            integration.id
          );
          if (this._channelAnalyticsService.isChannelUnavailable(syncState)) {
            return { ...base, reason: 'unavailable' as const };
          }

          try {
            const total =
              await this._channelAnalyticsService.getLatestAccountAudienceTotal(
                org.id,
                integration.id
              );
            if (!total) {
              return { ...base, reason: 'not_captured' as const };
            }
            return {
              ...base,
              total: total.value,
              asOf: total.asOf,
              label: total.label,
              reason: null,
            };
          } catch {
            return { ...base, reason: 'unavailable' as const };
          }
        })
      )
    );
  }

  async getDashboardAnalytics(
    org: Organization,
    date: 7 | 30 | 90,
    integrationId?: string
  ) {
    const integrations = await this._integrationRepository.getIntegrationsList(
      org.id
    );
    const selected = integrationId
      ? integrations.filter((integration) => integration.id === integrationId)
      : integrations;
    const limit = pLimit(5);

    return Promise.all(
      selected.map((integration) =>
        limit(async () => {
          const channel = {
            id: integration.id,
            name: integration.name,
            picture: integration.picture,
            display: integration.profile,
            identifier: integration.providerIdentifier,
          };

          if (integration.disabled) {
            return { ...channel, state: 'disabled' as const, analytics: [] };
          }

          if (integration.type !== 'social') {
            return { ...channel, state: 'unsupported' as const, analytics: [] };
          }

          let provider: SocialProvider;
          try {
            provider = this._integrationManager.getSocialIntegration(
              integration.providerIdentifier
            );
          } catch {
            return {
              ...channel,
              state: 'unsupported' as const,
              analytics: [],
            };
          }

          if (!provider?.analyticsSnapshot) {
            return { ...channel, state: 'unsupported' as const, analytics: [] };
          }

          const syncState = await this._channelAnalyticsRepository.getSyncState(
            org.id,
            integration.id
          );
          if (this._channelAnalyticsService.isChannelUnavailable(syncState)) {
            return {
              ...channel,
              state: 'unavailable' as const,
              analytics: [],
            };
          }

          try {
            const analytics = await this._channelAnalyticsService.getStoredAnalytics(
              org.id,
              integration.id,
              date
            );

            return {
              ...channel,
              state: 'ok' as const,
              analytics,
            };
          } catch {
            return { ...channel, state: 'unavailable' as const, analytics: [] };
          }
        })
      )
    );
  }

  async getChannelNoticeStatus(org: Organization, user: User) {
    const integrations = await this._integrationRepository.getIntegrationsList(
      org.id
    );
    const readStates =
      await this._integrationRepository.getNoticeReadsForUser(
        user.id,
        integrations.map((integration) => integration.id)
      );
    const lastReadByIntegration = new Map(
      readStates.map((read) => [read.integrationId, read.lastReadAt])
    );
    const limit = pLimit(5);
    const defaultSince = dayjs().subtract(30, 'day').toDate();

    const statuses = await Promise.all(
      integrations.map((integration) =>
        limit(async () => {
          const channel = {
            id: integration.id,
            state: 'unsupported' as ChannelNoticeStatus['state'] | 'disabled',
            unreadCount: 0,
            categories: undefined as
              | Partial<Record<'mention' | 'reply' | 'like' | 'repost' | 'follow', number>>
              | undefined,
          };

          if (integration.disabled) {
            return { ...channel, state: 'disabled' as const };
          }

          if (integration.type !== 'social') {
            return channel;
          }

          let provider: SocialProvider;
          try {
            provider = this._integrationManager.getSocialIntegration(
              integration.providerIdentifier
            );
          } catch {
            return channel;
          }

          if (!provider?.channelNotices) {
            return channel;
          }

          try {
            const status = await this.checkChannelNoticeResult(
              org,
              integration,
              provider,
              lastReadByIntegration.get(integration.id) || defaultSince
            );

            return {
              id: integration.id,
              state: status.state,
              unreadCount: status.state === 'ok' ? status.unreadCount : 0,
              categories:
                status.state === 'ok' ? status.categories : undefined,
            };
          } catch {
            return {
              id: integration.id,
              state: 'unavailable' as const,
              unreadCount: 0,
            };
          }
        })
      )
    );

    return {
      statuses: Object.fromEntries(
        statuses.map((status) => [status.id, status])
      ),
    };
  }

  private async checkChannelNoticeResult(
    org: Organization,
    integration: Integration,
    provider: SocialProvider,
    since: Date,
    forceRefresh = false
  ): Promise<ChannelNoticeStatus> {
    const liveIntegration = { ...integration };

    if (
      dayjs(liveIntegration.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        liveIntegration
      );
      if (!data) {
        return { state: 'unavailable' };
      }

      if (data.accessToken) {
        liveIntegration.token = data.accessToken;
        if (provider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this.disconnectChannel(org.id, liveIntegration);
        return { state: 'unavailable' };
      }
    }

    const cacheKey = `integration:notices:${org.id}:${liveIntegration.id}:${since.toISOString()}`;
    const cached = await ioRedis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ChannelNoticeStatus;
    }

    try {
      const status = await provider.channelNotices!(
        liveIntegration,
        liveIntegration.token,
        since
      );
      await ioRedis.set(
        cacheKey,
        JSON.stringify(status),
        'EX',
        !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
          ? 1
          : 300
      );
      return status;
    } catch (e) {
      if (e instanceof RefreshToken) {
        return this.checkChannelNoticeResult(
          org,
          liveIntegration,
          provider,
          since,
          true
        );
      }
      return { state: 'unavailable' };
    }
  }

  async markChannelNoticesRead(
    org: Organization,
    user: User,
    integrationId: string
  ) {
    const integration = await this._integrationRepository.getIntegrationById(
      org.id,
      integrationId
    );
    if (!integration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }

    await this._integrationRepository.markIntegrationNoticesRead(
      user.id,
      integration.id
    );

    return { success: true };
  }

  customers(orgId: string) {
    return this._integrationRepository.customers(orgId);
  }

  getPlugsByIntegrationId(org: string, integrationId: string) {
    return this._integrationRepository.getPlugsByIntegrationId(
      org,
      integrationId
    );
  }

  async processInternalPlug(
    data: {
      post: string;
      originalIntegration: string;
      integration: string;
      plugName: string;
      orgId: string;
      delay: number;
      information: any;
    },
    forceRefresh = false
  ): Promise<any> {
    const originalIntegration =
      await this._integrationRepository.getIntegrationById(
        data.orgId,
        data.originalIntegration
      );

    const getIntegration = await this._integrationRepository.getIntegrationById(
      data.orgId,
      data.integration
    );

    if (!getIntegration || !originalIntegration) {
      return;
    }

    const getAllInternalPlugs = this._integrationManager
      .getInternalPlugs(getIntegration.providerIdentifier)
      .internalPlugs.find((p: any) => p.identifier === data.plugName);

    if (!getAllInternalPlugs) {
      return;
    }

    const getSocialIntegration = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    // @ts-ignore
    await getSocialIntegration?.[getAllInternalPlugs.methodName]?.(
      getIntegration,
      originalIntegration,
      data.post,
      data.information
    );

    return;
  }

  async processPlugs(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
    source?: 'channel' | 'pipeline';
  }) {
    const getPlugById = await this._pipelinePlugService.getForExecution(
      data.source || 'channel',
      data.plugId
    );
    if (!getPlugById || !getPlugById.activated) {
      return true;
    }

    const integration = this._integrationManager.getSocialIntegration(
      getPlugById.integration.providerIdentifier
    );

    // @ts-ignore
    const process = await integration[getPlugById.plugFunction](
      getPlugById.integration,
      data.postId,
      JSON.parse(getPlugById.data).reduce((all: any, current: any) => {
        all[current.name] = current.value;
        return all;
      }, {})
    );

    if (process) {
      return true;
    }

    if (data.totalRuns === data.currentRun) {
      return true;
    }

    return false;
  }

  async createOrUpdatePlug(
    orgId: string,
    integrationId: string,
    body: PlugDto
  ) {
    const { activated } = await this._integrationRepository.createOrUpdatePlug(
      orgId,
      integrationId,
      body
    );

    return {
      activated,
    };
  }

  async changePlugActivation(orgId: string, plugId: string, status: boolean) {
    const { id, integrationId, plugFunction } =
      await this._integrationRepository.changePlugActivation(
        orgId,
        plugId,
        status
      );

    return { id };
  }

  async getPlugs(orgId: string, integrationId: string) {
    return this._integrationRepository.getPlugs(orgId, integrationId);
  }

  async loadExisingData(
    methodName: string,
    integrationId: string,
    id: string[]
  ) {
    const exisingData = await this._integrationRepository.loadExisingData(
      methodName,
      integrationId,
      id
    );
    const loadOnlyIds = exisingData.map((p) => p.value);
    return difference(id, loadOnlyIds);
  }

  async findFreeDateTime(
    orgId: string,
    integrationsId?: string
  ): Promise<number[]> {
    const findTimes = await this._integrationRepository.getPostingTimes(
      orgId,
      integrationsId
    );
    return uniq(
      findTimes.reduce((all: any, current: any) => {
        return [
          ...all,
          ...JSON.parse(current.postingTimes).map(
            (p: { time: number }) => p.time
          ),
        ];
      }, [] as number[])
    );
  }

  private async reconcileInteractionSubscriptionsIfNeeded(
    integration: Integration,
    provider: SocialProvider,
    subscriptions: { state: ChannelInteractionTrackingState }[]
  ) {
    if (
      integration.disabled ||
      integration.deletedAt ||
      !provider.channelInteractionWebhooks ||
      !subscriptions.some(
        (subscription) =>
          String(subscription.state).toUpperCase() === 'ERROR'
      )
    ) {
      return;
    }

    try {
      let liveIntegration = { ...integration };
      if (
        liveIntegration.tokenExpiration &&
        dayjs(liveIntegration.tokenExpiration).isBefore(dayjs())
      ) {
        const refreshed =
          await this._refreshIntegrationService.refresh(liveIntegration);
        if (refreshed && refreshed.accessToken) {
          liveIntegration = {
            ...liveIntegration,
            token: refreshed.accessToken,
          };
        }
      }

      await this._channelInteractionService.requestReconciliation(
        liveIntegration
      );
      const result =
        await provider.channelInteractionWebhooks.reconcileSubscriptions(
          liveIntegration,
          liveIntegration.token,
          await this._channelInteractionService.getInteractionAuthorizationToken(
            liveIntegration
          )
        );
      await this._channelInteractionRepository.applySubscriptionReconciliation(
        integration.organizationId,
        integration.id,
        result
      );
    } catch {
      // Reconciliation is best-effort when loading channel settings.
    }
  }

  private async requestInteractionReconciliation(integration: Integration) {
    try {
      await this._channelInteractionService.requestReconciliation(integration);
      await this.pokeChannelInteractionMaintenance();
    } catch {
      // Reconciliation is best-effort state preparation; it must not fail a channel operation.
    }
  }

  private async pokeChannelInteractionMaintenance() {
    try {
      const workflow = this._temporalService.client?.getRawClient()?.workflow;
      await workflow
        ?.getHandle('channel-interaction-maintenance-workflow-v2')
        .signal('channelInteractionMaintenance');
    } catch {
      // The workflow may not be running yet; its hourly pass reconciles persisted state.
    }
  }

  private async requestInteractionRemoval(integration: Integration) {
    try {
      await this._channelInteractionService.requestSubscriptionRemoval(integration);
      await this.pokeChannelInteractionMaintenance();
    } catch {
      // Remote cleanup is performed by maintenance and never blocks local disable/delete.
    }
  }
}

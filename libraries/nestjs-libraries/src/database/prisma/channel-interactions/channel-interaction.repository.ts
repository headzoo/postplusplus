import { Injectable } from '@nestjs/common';
import {
  ChannelAudienceMembership,
  ChannelFollowerSyncStatus,
  ChannelInteractionDirection,
  ChannelInteractionKind,
  ChannelInteractionTrackingState,
  ChannelInteractionWindow,
  Prisma,
} from '@prisma/client';
import {
  ChannelInteractionSubscriptionReconciliationResult,
  FollowerTriageFilter,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  AudienceFollowerSortField,
  FOLLOWER_AUDIENCES,
  FOLLOWER_TRIAGE_FILTERS,
} from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  BOT_FORMULA_VERSION,
  getChannelInteractionScore,
  RELATIONSHIP_FORMULA_VERSION,
  RELATIONSHIP_HOT_SNOOZE_MS,
  RELATIONSHIP_TRIAGE_SNOOZE_MS,
  RELATIONSHIP_WINDOW_MS,
} from './channel-interaction.scoring';
import {
  RelationshipGradeScheduleConfig,
  relationshipGradeDueCutoff,
} from '@gitroom/nestjs-libraries/temporal/relationship-grade.schedule';
import { FOLLOWER_BOT_SCORE_SCHEDULE_INTERVAL_HOURS } from '@gitroom/nestjs-libraries/temporal/follower-bot-score.schedule';
import {
  LEAD_BRIDGE_PER_SOURCE_CAP,
  LEAD_BRIDGE_WARM_GRADE_THRESHOLD,
  LEAD_FIT_FEEDBACK_EXAMPLE_LIMIT,
  LEAD_FIT_MIN_SCORE,
  LEAD_FIT_VERSION,
} from '@gitroom/nestjs-libraries/temporal/lead-bridge.schedule';
import {
  CULTIVATE_CANDIDATE_POOL_SIZE,
  CULTIVATE_PICK_LIMIT,
  CULTIVATE_STALE_MS,
  CULTIVATE_WARM_GRADE_THRESHOLD,
} from '@gitroom/nestjs-libraries/temporal/cultivate.schedule';
import {
  CHANNEL_STRATEGY_IDS,
  ChannelInteractionScoreDirection,
  ChannelInteractionScoreKind,
  ChannelStrategyId,
  RelationshipInteractionCounts,
  RelationshipTriage,
} from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.types';
import {
  FALLBACK_CHANNEL_STRATEGY_ID,
  listChannelStrategies,
  resolveChannelStrategy,
} from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.registry';
import { createRelationshipInteractionCounts } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.scoring';

export type AudienceProfile = {
  externalId: string;
  name?: string;
  username?: string;
  picture?: string;
  profileUrl?: string;
  bio?: string;
  followersCount?: number;
  followingCount?: number;
  followedAt?: Date;
  accountCreatedAt?: Date;
  botGrade?: number | null;
  isBot?: boolean | null;
  botConfidence?: number | null;
  botFormulaVersion?: number | null;
  botGradedAt?: Date | null;
};

export type PersistedInteraction = {
  providerEventKey: string;
  kind: ChannelInteractionKind;
  direction: ChannelInteractionDirection;
  eventAt: Date;
  counterparty: AudienceProfile;
  relatedObjectId?: string;
  metadata?: Record<string, string>;
  normalizationVersion: number;
  membershipUpdate?: ChannelAudienceMembership;
  score: number;
};

export type DesiredInteractionSubscription = {
  eventKey: string;
  direction: ChannelInteractionDirection;
};

export type RankedFollowerCursor = {
  interactionCount: number;
  interactionScore: number;
  lastInteractionAt: string | null;
  externalId: string;
};

export type AudienceIgnoredVisibility = 'exclude' | 'only' | 'all';

export type RankedFollowersQuery = {
  organizationId: string;
  integrationId: string;
  window: ChannelInteractionWindow;
  direction: 'asc' | 'desc';
  limit: number;
  cursor?: RankedFollowerCursor;
  search?: string;
  triage?: FollowerTriageFilter;
  listId?: string;
  isBot?: boolean;
  ignoredVisibility?: AudienceIgnoredVisibility;
};

export type NoteCountFollowerCursor = {
  noteCount: number;
  externalId: string;
};

export type NoteCountFollowersQuery = {
  organizationId: string;
  integrationId: string;
  userId?: string;
  direction: 'asc' | 'desc';
  limit: number;
  cursor?: NoteCountFollowerCursor;
  search?: string;
  triage?: FollowerTriageFilter;
  listId?: string;
  isBot?: boolean;
  ignoredVisibility?: AudienceIgnoredVisibility;
};

export type LikesCountFollowerCursor = {
  likesCount: number;
  externalId: string;
};

export type LikesCountFollowersQuery = {
  organizationId: string;
  integrationId: string;
  userId?: string;
  direction: 'asc' | 'desc';
  limit: number;
  cursor?: LikesCountFollowerCursor;
  search?: string;
  triage?: FollowerTriageFilter;
  listId?: string;
  isBot?: boolean;
  ignoredVisibility?: AudienceIgnoredVisibility;
};

export type AudienceLeadCursor = {
  leadFitScore: number | null;
  leadBridgeScore: number | null;
  lastInboundAt: string | null;
  externalId: string;
};

export type AudienceLeadsQuery = {
  organizationId: string;
  integrationId: string;
  userId?: string;
  direction: 'asc' | 'desc';
  limit: number;
  cursor?: AudienceLeadCursor;
  search?: string;
  ignoredVisibility?: AudienceIgnoredVisibility;
};

export type AudienceCultivateCursor = {
  finalRank: number;
  externalId: string;
};

export type AudienceCultivateQuery = {
  organizationId: string;
  integrationId: string;
  strategyId: ChannelStrategyId;
  strategyVersion: number;
  materializationVersion: number;
  direction: 'asc' | 'desc';
  limit: number;
  cursor?: AudienceCultivateCursor;
  hour?: string;
  search?: string;
  userId?: string;
  now?: Date;
};

export const utcHourKey = (now = new Date()) => {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('utcHourKey requires a valid Date');
  }
  return now.toISOString().slice(0, 13);
};

export type HotPickCursor = {
  finalRank: number;
  externalId: string;
};

export type AudienceHotQuery = {
  organizationId: string;
  integrationId: string;
  strategyId: ChannelStrategyId;
  strategyVersion: number;
  materializationVersion: number;
  direction: 'asc' | 'desc';
  limit: number;
  cursor?: HotPickCursor;
  hour?: string;
  search?: string;
  userId?: string;
  now?: Date;
};

export type HotCandidate = {
  externalId: string;
  username: string | null;
  name: string | null;
  bio: string | null;
  profileUrl: string | null;
  followersCount: number | null;
  followingCount: number | null;
  relationshipNetGap: number | null;
  relationshipReciprocationScore: number | null;
  relationshipEffortScore: number | null;
  relationshipTriage: string | null;
  relationshipSnapshotAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
};

export type HotPickInput = {
  counterpartyExternalId: string;
  rulesRank: number;
  finalRank: number;
  rulesReason: string;
  aiRank?: number | null;
  aiReason?: string | null;
  suggestedAction?: string | null;
  source?: string;
};

export type CultivateCandidate = {
  externalId: string;
  username: string | null;
  name: string | null;
  relationshipGrade: number | null;
  relationshipTriage: string | null;
  lastOutboundAt: Date | null;
};

export type CultivatePickInput = {
  counterpartyExternalId: string;
  rulesRank: number;
  finalRank: number;
  rulesReason: string;
  aiRank?: number | null;
  aiReason?: string | null;
  suggestedAction?: string | null;
  source?: string;
};

export type FollowerAudienceCounts = {
  noteCount: number;
  likesCount: number;
  relationshipGrade: number | null;
  myGrade: number | null;
  relationshipEffortScore: number | null;
  relationshipReciprocationScore: number | null;
  relationshipNetGap: number | null;
  relationshipTriage: string | null;
  relationshipFormulaVersion: number | null;
  relationshipSnapshotAt: Date | null;
  botGrade: number | null;
  isBot: boolean | null;
  botConfidence: number | null;
  botFormulaVersion: number | null;
  botGradedAt: Date | null;
  listIds: string[];
  ignoredTriages: string[];
  ignoredAt: Date | null;
};

export type AudienceFollowerCursor = {
  sortField: AudienceFollowerSortField;
  sortValue: string | number | null;
  externalId: string;
};

export type AudienceFollowersQuery = {
  organizationId: string;
  integrationId: string;
  userId?: string;
  search?: string;
  triage?: FollowerTriageFilter;
  listId?: string;
  isBot?: boolean;
  sortField: AudienceFollowerSortField;
  direction: 'asc' | 'desc';
  limit: number;
  cursor?: AudienceFollowerCursor;
  ignoredVisibility?: AudienceIgnoredVisibility;
};

export type RecentFollowerCursor = {
  followedAt: string;
  externalId: string;
};

export type RecentFollowersQuery = {
  organizationId: string;
  integrationId: string;
  userId?: string;
  since: Date;
  limit: number;
  cursor?: RecentFollowerCursor;
};

export type StoredFollowerAudienceCounts = {
  categories: Record<string, number>;
  lists: Array<{ id: string; name: string; total: number }>;
  listsTruncated: boolean;
};

export type IgnoredAudienceFollowerCursor = {
  ignoredAt: string;
  externalId: string;
};

export type IgnoredAudienceFollowersQuery = {
  organizationId: string;
  integrationId: string;
  userId?: string;
  search?: string;
  direction: 'asc' | 'desc';
  limit: number;
  cursor?: IgnoredAudienceFollowerCursor;
};

export type GradeFollowerCursor = {
  grade: number | null;
  externalId: string;
};

export type GradeFollowersQuery = {
  organizationId: string;
  integrationId: string;
  userId?: string;
  direction: 'asc' | 'desc';
  limit: number;
  cursor?: GradeFollowerCursor;
  search?: string;
  triage?: FollowerTriageFilter;
  listId?: string;
  isBot?: boolean;
  ignoredVisibility?: AudienceIgnoredVisibility;
};

export type ProjectedFollowerCursor = {
  value: number | null;
  externalId: string;
};

export type ProjectedFollowersQuery = {
  organizationId: string;
  integrationId: string;
  userId?: string;
  field: 'relationshipReciprocationScore' | 'relationshipNetGap';
  direction: 'asc' | 'desc';
  limit: number;
  cursor?: ProjectedFollowerCursor;
  search?: string;
  triage?: FollowerTriageFilter;
  listId?: string;
  isBot?: boolean;
  ignoredVisibility?: AudienceIgnoredVisibility;
};

export type FollowerInteractionMetrics = {
  interactionCount: number;
  interactionScore: number;
  lastInteractionAt: Date | null;
};

const TRANSACTION_ATTEMPTS = 3;
const RELATIONSHIP_BATCH_SIZE = 100;
const RELATIONSHIP_REFRESH_MAX_MEMBERS = 500;
const BOT_SCORE_BATCH_SIZE = 100;
const BOT_SCORE_STALE_MS =
  FOLLOWER_BOT_SCORE_SCHEDULE_INTERVAL_HOURS * 60 * 60 * 1000;

function botScoreDueWhere(now = new Date()): Prisma.ChannelAudienceMemberWhereInput {
  const dueCutoff = new Date(now.getTime() - BOT_SCORE_STALE_MS);
  return {
    OR: [
      { botFormulaVersion: null },
      { botFormulaVersion: { lt: BOT_FORMULA_VERSION } },
      { botGradedAt: null },
      { botGradedAt: { lte: dueCutoff } },
    ],
  };
}

/**
 * Raw per-kind/per-direction counts for one member. Weighting them into effort
 * and reciprocation scores belongs to the selected strategy profile, so the
 * repository loads counts and never applies scoring weights itself.
 */
export type RelationshipGradeBatchMember = {
  externalId: string;
  interactionCounts: RelationshipInteractionCounts;
};

export type RelationshipGradeStrategySelection = {
  strategyId: ChannelStrategyId;
  strategyVersion: number;
};

export type RelationshipGradeBatch = {
  members: RelationshipGradeBatchMember[];
  strategy: RelationshipGradeStrategySelection;
};

export type RelationshipGradeSnapshotInput = {
  externalId: string;
  effortScore: number;
  reciprocationScore: number;
  reciprocity: number | null;
  grade: number | null;
  formulaVersion: number;
  strategyId: ChannelStrategyId;
  strategyVersion: number;
  triage: RelationshipTriage;
};

@Injectable()
export class ChannelInteractionRepository {
  constructor(
    private _dailyAggregate: PrismaRepository<
      | 'channelInteractionDailyAggregate'
      | 'channelInteractionEvent'
      | 'channelInteractionWindowSummary'
      | 'channelInteractionRollupState'
      | 'channelFollowerSyncState'
      | 'channelAudienceMember'
      | 'channelAudienceNote'
      | 'channelAudienceList'
      | 'channelAudienceListMember'
      | 'channelAudienceLeadBridge'
      | 'channelAudienceCultivatePickBatch'
      | 'channelAudienceCultivatePick'
      | 'channelAudienceHotPickBatch'
      | 'channelAudienceHotPick'
      | 'channelRelationshipGradeSnapshot'
    >,
    private _integration: PrismaRepository<'integration'>,
    private _subscription: PrismaRepository<
      'channelInteractionSubscription' | 'channelInteractionAuthorization'
    >,
    private _transaction: PrismaTransaction
  ) { }

  getInteractionAuthorization(organizationId: string, integrationId: string) {
    return this._subscription.model.channelInteractionAuthorization.findFirst({
      where: { organizationId, integrationId },
    });
  }

  saveInteractionAuthorization(
    organizationId: string,
    integrationId: string,
    grant: {
      token: string;
      refreshToken?: string;
      tokenExpiration?: Date;
      scopes?: string;
    }
  ) {
    return this._subscription.model.channelInteractionAuthorization.upsert({
      where: { integrationId },
      create: {
        organizationId,
        integrationId,
        token: grant.token,
        refreshToken: grant.refreshToken ?? null,
        tokenExpiration: grant.tokenExpiration ?? null,
        scopes: grant.scopes ?? null,
      },
      update: {
        token: grant.token,
        // A response without a rotated refresh token keeps the stored one;
        // clearing it would force the user to authorize again.
        ...(grant.refreshToken ? { refreshToken: grant.refreshToken } : {}),
        tokenExpiration: grant.tokenExpiration ?? null,
        scopes: grant.scopes ?? null,
      },
    });
  }

  async recordNormalizedEvent(
    organizationId: string,
    integrationId: string,
    event: PersistedInteraction
  ): Promise<{ created: boolean }> {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const inserted = await tx.channelInteractionEvent.createMany({
        data: [{
          organizationId,
          integrationId,
          providerEventKey: event.providerEventKey,
          counterpartyExternalId: event.counterparty.externalId,
          kind: event.kind,
          direction: event.direction,
          eventAt: event.eventAt,
          relatedObjectId: event.relatedObjectId,
          metadata: event.metadata,
          normalizationVersion: event.normalizationVersion,
        }],
        skipDuplicates: true,
      });
      if (!inserted.count) {
        return { created: false };
      }
      await this.upsertAudienceMember(
        tx,
        organizationId,
        integrationId,
        event.counterparty,
        event.membershipUpdate
      );
      if (event.direction === ChannelInteractionDirection.INBOUND) {
        await tx.channelAudienceMember.updateMany({
          where: {
            organizationId,
            integrationId,
            externalId: event.counterparty.externalId,
          },
          data: {
            inboundInteractionCount: { increment: 1 },
          },
        });
        await tx.channelAudienceMember.updateMany({
          where: {
            organizationId,
            integrationId,
            externalId: event.counterparty.externalId,
            OR: [
              { lastInboundAt: null },
              { lastInboundAt: { lt: event.eventAt } },
            ],
          },
          data: { lastInboundAt: event.eventAt },
        });
      } else if (event.direction === ChannelInteractionDirection.OUTBOUND) {
        await tx.channelAudienceMember.updateMany({
          where: {
            organizationId,
            integrationId,
            externalId: event.counterparty.externalId,
            OR: [
              { lastOutboundAt: null },
              { lastOutboundAt: { lt: event.eventAt } },
            ],
          },
          data: { lastOutboundAt: event.eventAt },
        });
        await this.upsertHotLeadSnooze(
          tx,
          organizationId,
          integrationId,
          event.counterparty.externalId,
          event.eventAt
        );
      }

      const day = new Date(Date.UTC(
        event.eventAt.getUTCFullYear(),
        event.eventAt.getUTCMonth(),
        event.eventAt.getUTCDate()
      ));
      await tx.channelInteractionDailyAggregate.upsert({
        where: {
          integrationId_counterpartyExternalId_day: {
            integrationId,
            counterpartyExternalId: event.counterparty.externalId,
            day,
          },
        },
        create: {
          organizationId,
          integrationId,
          counterpartyExternalId: event.counterparty.externalId,
          day,
          interactionCount: 1,
          interactionScore: event.score,
          lastInteractionAt: event.eventAt,
        },
        update: {
          interactionCount: { increment: 1 },
          interactionScore: { increment: event.score },
        },
      });
      await tx.channelInteractionDailyAggregate.updateMany({
        where: {
          integrationId,
          counterpartyExternalId: event.counterparty.externalId,
          day,
          OR: [
            { lastInteractionAt: null },
            { lastInteractionAt: { lt: event.eventAt } },
          ],
        },
        data: { lastInteractionAt: event.eventAt },
      });
      return { created: true };
    });
  }

  /**
   * Record an inbound like discovered by polling a post's likers API.
   * Deduped by providerEventKey (`post-like:{tweetId}:{likerId}`).
   * Unlike webhook delivery, this is the source of truth for likesCount.
   */
  async recordPolledInboundLike(
    organizationId: string,
    integrationId: string,
    relatedObjectId: string,
    liker: AudienceProfile,
    eventAt: Date
  ): Promise<{ created: boolean }> {
    return this.recordNormalizedEventWithLikesCount(
      organizationId,
      integrationId,
      {
        providerEventKey: `post-like:${relatedObjectId}:${liker.externalId}`,
        kind: ChannelInteractionKind.LIKE,
        direction: ChannelInteractionDirection.INBOUND,
        eventAt,
        counterparty: liker,
        relatedObjectId,
        normalizationVersion: 1,
        score: getChannelInteractionScore('like', 'inbound'),
      }
    );
  }

  private async recordNormalizedEventWithLikesCount(
    organizationId: string,
    integrationId: string,
    event: PersistedInteraction
  ): Promise<{ created: boolean }> {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const inserted = await tx.channelInteractionEvent.createMany({
        data: [{
          organizationId,
          integrationId,
          providerEventKey: event.providerEventKey,
          counterpartyExternalId: event.counterparty.externalId,
          kind: event.kind,
          direction: event.direction,
          eventAt: event.eventAt,
          relatedObjectId: event.relatedObjectId,
          metadata: event.metadata,
          normalizationVersion: event.normalizationVersion,
        }],
        skipDuplicates: true,
      });
      if (!inserted.count) {
        return { created: false };
      }
      await this.upsertAudienceMember(
        tx,
        organizationId,
        integrationId,
        event.counterparty,
        event.membershipUpdate
      );
      await tx.channelAudienceMember.updateMany({
        where: {
          organizationId,
          integrationId,
          externalId: event.counterparty.externalId,
        },
        data: {
          inboundInteractionCount: { increment: 1 },
          likesCount: { increment: 1 },
        },
      });
      await tx.channelAudienceMember.updateMany({
        where: {
          organizationId,
          integrationId,
          externalId: event.counterparty.externalId,
          OR: [
            { lastInboundAt: null },
            { lastInboundAt: { lt: event.eventAt } },
          ],
        },
        data: { lastInboundAt: event.eventAt },
      });

      const day = new Date(Date.UTC(
        event.eventAt.getUTCFullYear(),
        event.eventAt.getUTCMonth(),
        event.eventAt.getUTCDate()
      ));
      await tx.channelInteractionDailyAggregate.upsert({
        where: {
          integrationId_counterpartyExternalId_day: {
            integrationId,
            counterpartyExternalId: event.counterparty.externalId,
            day,
          },
        },
        create: {
          organizationId,
          integrationId,
          counterpartyExternalId: event.counterparty.externalId,
          day,
          interactionCount: 1,
          interactionScore: event.score,
          lastInteractionAt: event.eventAt,
        },
        update: {
          interactionCount: { increment: 1 },
          interactionScore: { increment: event.score },
        },
      });
      await tx.channelInteractionDailyAggregate.updateMany({
        where: {
          integrationId,
          counterpartyExternalId: event.counterparty.externalId,
          day,
          OR: [
            { lastInteractionAt: null },
            { lastInteractionAt: { lt: event.eventAt } },
          ],
        },
        data: { lastInteractionAt: event.eventAt },
      });
      return { created: true };
    });
  }

  getActiveIntegrationsForAccount(
    providerIdentifier: string,
    internalId: string
  ) {
    return this._integration.model.integration.findMany({
      where: {
        providerIdentifier,
        internalId,
        type: 'social',
        disabled: false,
        deletedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        profile: true,
      },
    });
  }

  getActiveIntegrationsForProvider(providerIdentifier: string) {
    return this._integration.model.integration.findMany({
      where: {
        providerIdentifier,
        type: 'social',
        disabled: false,
        deletedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        profile: true,
      },
    });
  }

  async listMaintenanceCandidates(after?: string, take = 1) {
    const integrations = await this._integration.model.integration.findMany({
      where: {
        type: 'social',
        OR: [
          { disabled: false, deletedAt: null },
          {
            OR: [{ disabled: true }, { deletedAt: { not: null } }],
            channelInteractionSubscriptions: {
              some: { state: ChannelInteractionTrackingState.REMOVING },
            },
          },
        ],
        ...(after ? { id: { gt: after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: take + 1,
      select: {
        id: true,
        organizationId: true,
        disabled: true,
        deletedAt: true,
      },
    });
    const hasMore = integrations.length > take;
    return {
      candidates: integrations.slice(0, take).map((integration) => ({
        id: integration.id,
        organizationId: integration.organizationId,
        maintenance: integration.disabled || integration.deletedAt
          ? 'cleanup' as const
          : 'active' as const,
      })),
      next: hasMore ? integrations[take - 1]?.id : undefined,
    };
  }

  async applySubscriptionReconciliation(
    organizationId: string,
    integrationId: string,
    result: ChannelInteractionSubscriptionReconciliationResult,
    cleanupPending = false
  ): Promise<string[]> {
    const newlyFailed: string[] = [];
    await this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const existing = await tx.channelInteractionSubscription.findMany({
        where: { organizationId, integrationId },
        select: { id: true, eventKey: true, direction: true, state: true },
      });
      const previousStates = new Map(
        existing.map((subscription) => [
          `${subscription.eventKey}:${String(subscription.direction).toLowerCase()}`,
          subscription.state,
        ])
      );
      const reconciledKeys = new Set(
        result.subscriptions.map(
          (subscription) => `${subscription.eventKey}:${subscription.direction}`
        )
      );
      const trackingStartedAt = new Date();
      for (const subscription of result.subscriptions) {
        const cleanupComplete =
          cleanupPending &&
          subscription.state === 'unconfigured' &&
          !subscription.failureCategory;
        const direction =
          subscription.direction === 'inbound'
            ? ChannelInteractionDirection.INBOUND
            : ChannelInteractionDirection.OUTBOUND;
        const state = cleanupPending
          ? cleanupComplete
            ? ChannelInteractionTrackingState.UNCONFIGURED
            : ChannelInteractionTrackingState.REMOVING
          : subscription.state.toUpperCase() as ChannelInteractionTrackingState;
        const failureCategory = subscription.failureCategory || null;
        const failureReason = subscription.reason
          ? subscription.reason.slice(0, 240)
          : subscription.failureCategory
            ? this.failureReason(subscription.failureCategory)
            : null;
        const remoteIdentifier =
          subscription.state === 'error'
            ? null
            : subscription.remoteIdentifier ?? null;
        await tx.channelInteractionSubscription.upsert({
          where: {
            integrationId_eventKey_direction: {
              integrationId,
              eventKey: subscription.eventKey,
              direction,
            },
          },
          create: {
            organizationId,
            integrationId,
            eventKey: subscription.eventKey,
            direction,
            remoteIdentifier,
            state,
            failureCategory,
            failureReason,
          },
          update: {
            remoteIdentifier,
            state,
            failureCategory,
            failureReason,
          },
        });
        if (subscription.state === 'active') {
          await tx.channelInteractionSubscription.updateMany({
            where: {
              organizationId,
              integrationId,
              eventKey: subscription.eventKey,
              direction:
                subscription.direction === 'inbound'
                  ? ChannelInteractionDirection.INBOUND
                  : ChannelInteractionDirection.OUTBOUND,
              trackingStartedAt: null,
            },
            data: { trackingStartedAt },
          });
        }
        if (subscription.state === 'error') {
          const key = `${subscription.eventKey}:${subscription.direction}`;
          if (previousStates.get(key) !== ChannelInteractionTrackingState.ERROR) {
            newlyFailed.push(key);
          }
        }
      }

      for (const subscription of existing) {
        const key = `${subscription.eventKey}:${String(subscription.direction).toLowerCase()}`;
        if (!reconciledKeys.has(key)) {
          await tx.channelInteractionSubscription.delete({
            where: { id: subscription.id },
          });
        }
      }
    });
    return newlyFailed;
  }

  async requestSubscriptionReconciliation(
    organizationId: string,
    integrationId: string,
    desiredSubscriptions: DesiredInteractionSubscription[]
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      for (const subscription of desiredSubscriptions) {
        await tx.channelInteractionSubscription.upsert({
          where: {
            integrationId_eventKey_direction: {
              integrationId,
              eventKey: subscription.eventKey,
              direction: subscription.direction,
            },
          },
          create: {
            organizationId,
            integrationId,
            eventKey: subscription.eventKey,
            direction: subscription.direction,
            state: ChannelInteractionTrackingState.PROVISIONING,
          },
          update: {
            state: ChannelInteractionTrackingState.PROVISIONING,
            failureCategory: null,
            failureReason: null,
          },
        });
      }
    });
  }

  async markSubscriptionsForRemoval(
    organizationId: string,
    integrationId: string
  ) {
    return this._subscription.model.channelInteractionSubscription.updateMany({
      where: { organizationId, integrationId },
      data: {
        state: ChannelInteractionTrackingState.REMOVING,
        failureCategory: null,
        failureReason: null,
      },
    });
  }

  async applyMembershipUpdate(
    organizationId: string,
    integrationId: string,
    profile: AudienceProfile,
    membership: ChannelAudienceMembership
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      return this.upsertAudienceMember(
        tx,
        organizationId,
        integrationId,
        profile,
        membership
      );
    });
  }

  async beginFollowerSync(
    organizationId: string,
    integrationId: string,
    generation: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      await tx.channelFollowerSyncState.upsert({
        where: { integrationId },
        create: {
          organizationId,
          integrationId,
          pendingGeneration: generation,
          status: ChannelFollowerSyncStatus.IN_PROGRESS,
        },
        update: {
          organizationId,
          pendingGeneration: generation,
          status: ChannelFollowerSyncStatus.IN_PROGRESS,
        },
      });
      return generation;
    });
  }

  async applyFollowerSyncPage(
    organizationId: string,
    integrationId: string,
    generation: string,
    followers: AudienceProfile[]
  ): Promise<boolean> {
    return this.withSerializableRetry(async (tx) => {
      const claimed = await tx.channelFollowerSyncState.updateMany({
        where: {
          organizationId,
          integrationId,
          pendingGeneration: generation,
          status: ChannelFollowerSyncStatus.IN_PROGRESS,
        },
        data: { status: ChannelFollowerSyncStatus.IN_PROGRESS },
      });
      if (claimed.count !== 1) {
        return false;
      }
      for (const follower of followers) {
        await this.upsertAudienceMember(
          tx,
          organizationId,
          integrationId,
          follower,
          ChannelAudienceMembership.FOLLOWER,
          generation
        );
      }
      return true;
    });
  }

  async completeFollowerSync(
    organizationId: string,
    integrationId: string,
    generation: string,
    completedAt: Date
  ): Promise<boolean> {
    return this.withSerializableRetry(async (tx) => {
      const completed = await tx.channelFollowerSyncState.updateMany({
        where: {
          organizationId,
          integrationId,
          pendingGeneration: generation,
          status: ChannelFollowerSyncStatus.IN_PROGRESS,
        },
        data: { status: ChannelFollowerSyncStatus.IN_PROGRESS },
      });
      if (completed.count !== 1) {
        return false;
      }
      await tx.channelAudienceMember.updateMany({
        where: {
          organizationId,
          integrationId,
          followerSyncGeneration: generation,
          OR: [
            { membershipEvidenceGeneration: null },
            { membershipEvidenceGeneration: { not: generation } },
          ],
        },
        data: { membershipState: ChannelAudienceMembership.FOLLOWER },
      });
      await tx.channelAudienceMember.updateMany({
        where: {
          organizationId,
          integrationId,
          membershipState: ChannelAudienceMembership.FOLLOWER,
          AND: [
            {
              OR: [
                { followerSyncGeneration: null },
                { followerSyncGeneration: { not: generation } },
              ],
            },
            {
              OR: [
                { membershipEvidenceGeneration: null },
                { membershipEvidenceGeneration: { not: generation } },
              ],
            },
          ],
        },
        data: { membershipState: ChannelAudienceMembership.NOT_FOLLOWER },
      });
      await tx.channelFollowerSyncState.update({
        where: { integrationId },
        data: {
          activeGeneration: generation,
          pendingGeneration: null,
          status: ChannelFollowerSyncStatus.COMPLETE,
          completedAt,
        },
      });
      return true;
    });
  }

  async failFollowerSync(
    organizationId: string,
    integrationId: string,
    generation: string
  ): Promise<boolean> {
    const result = await this.withSerializableRetry((tx) =>
      tx.channelFollowerSyncState.updateMany({
        where: {
          organizationId,
          integrationId,
          pendingGeneration: generation,
          status: ChannelFollowerSyncStatus.IN_PROGRESS,
        },
        data: {
          pendingGeneration: null,
          status: ChannelFollowerSyncStatus.FAILED,
        },
      })
    );
    return result.count === 1;
  }

  async rebuildWindowSummary(
    organizationId: string,
    integrationId: string,
    window: ChannelInteractionWindow,
    generation: string,
    cutoffAt: Date,
    computedAt: Date
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const aggregates = await tx.channelInteractionEvent.groupBy({
        by: ['counterpartyExternalId', 'kind', 'direction'],
        where: {
          organizationId,
          integrationId,
          eventAt: { gte: cutoffAt, lte: computedAt },
        },
        _count: { _all: true },
        _max: { eventAt: true },
      });
      const followers = await tx.channelAudienceMember.findMany({
        where: {
          organizationId,
          integrationId,
          membershipState: ChannelAudienceMembership.FOLLOWER,
        },
        select: { externalId: true },
      });
      const summaries = new Map<string, {
        interactionCount: number;
        interactionScore: number;
        lastInteractionAt: Date | null;
      }>();
      for (const aggregate of aggregates) {
        const current = summaries.get(aggregate.counterpartyExternalId) || {
          interactionCount: 0,
          interactionScore: 0,
          lastInteractionAt: null,
        };
        const count = aggregate._count._all;
        const lastInteractionAt = aggregate._max.eventAt;
        current.interactionCount += count;
        current.interactionScore += count * getChannelInteractionScore(
          aggregate.kind.toLowerCase() as Parameters<
            typeof getChannelInteractionScore
          >[0],
          aggregate.direction.toLowerCase() as Parameters<
            typeof getChannelInteractionScore
          >[1]
        );
        if (
          lastInteractionAt &&
          (!current.lastInteractionAt || lastInteractionAt > current.lastInteractionAt)
        ) {
          current.lastInteractionAt = lastInteractionAt;
        }
        summaries.set(aggregate.counterpartyExternalId, current);
      }
      const followerSummaries = followers.map(({ externalId }) => ({
        counterpartyExternalId: externalId,
        ...(summaries.get(externalId) || {
          interactionCount: 0,
          interactionScore: 0,
          lastInteractionAt: null,
        }),
      }));
      if (followerSummaries.length) {
        await tx.channelInteractionWindowSummary.createMany({
          data: followerSummaries.map((summary) => ({
            organizationId,
            integrationId,
            window,
            generation,
            ...summary,
            computedAt,
          })),
          skipDuplicates: true,
        });
      }
      await tx.channelInteractionRollupState.upsert({
        where: { integrationId_window: { integrationId, window } },
        create: {
          organizationId,
          integrationId,
          window,
          activeGeneration: generation,
          computedAt,
        },
        update: {
          organizationId,
          activeGeneration: generation,
          computedAt,
        },
      });
      await tx.channelInteractionWindowSummary.deleteMany({
        where: {
          organizationId,
          integrationId,
          window,
          generation: { not: generation },
        },
      });
      return { generation, computedAt, itemCount: followerSummaries.length };
    });
  }

  async getRankedFollowers(query: RankedFollowersQuery) {
    return this.withSerializableRetry(async (tx) => {
      const [rollup, followerSync, subscriptions] = await Promise.all([
        tx.channelInteractionRollupState.findFirst({
          where: {
            organizationId: query.organizationId,
            integrationId: query.integrationId,
            window: query.window,
          },
          select: {
            activeGeneration: true,
            computedAt: true,
          },
        }),
        tx.channelFollowerSyncState.findFirst({
          where: {
            organizationId: query.organizationId,
            integrationId: query.integrationId,
          },
          select: {
            activeGeneration: true,
            status: true,
            completedAt: true,
          },
        }),
        tx.channelInteractionSubscription.findMany({
          where: {
            organizationId: query.organizationId,
            integrationId: query.integrationId,
          },
          select: {
            state: true,
            trackingStartedAt: true,
            failureCategory: true,
            failureReason: true,
          },
        }),
      ]);

      if (!rollup || !followerSync?.activeGeneration || !followerSync.completedAt) {
        return {
          items: [],
          hasMore: false,
          rollup,
          followerSync,
          subscriptions,
        };
      }

      const rows = await tx.channelInteractionWindowSummary.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          window: query.window,
          generation: rollup.activeGeneration,
          audienceMember: {
            is: {
              organizationId: query.organizationId,
              integrationId: query.integrationId,
              ...this.followerMembershipFilter(query.listId),
              ...this.audienceSearchFilter(query.search),
              ...this.triageFilter(query.triage),
              ...this.listMembershipFilter(query.listId),
              ...this.isBotFilter(query.isBot),
              ...this.ignoredVisibilityFilter(query.ignoredVisibility),
            },
          },
          ...this.rankedFollowerKeyset(query.cursor, query.direction),
        },
        orderBy: [
          { interactionCount: query.direction },
          { interactionScore: query.direction },
          { lastInteractionAt: query.direction },
          { counterpartyExternalId: query.direction },
        ],
        take: query.limit + 1,
        select: {
          counterpartyExternalId: true,
          interactionCount: true,
          interactionScore: true,
          lastInteractionAt: true,
          audienceMember: {
            select: {
              name: true,
              username: true,
              picture: true,
              profileUrl: true,
              bio: true,
              followersCount: true,
              followingCount: true,
              followedAt: true,
              accountCreatedAt: true,
            },
          },
        },
      });

      return {
        items: rows.slice(0, query.limit),
        hasMore: rows.length > query.limit,
        rollup,
        followerSync,
        subscriptions,
      };
    });
  }

  async getInteractionTracking(organizationId: string, integrationId: string) {
    const [followerSync, subscriptions] = await Promise.all([
      this._dailyAggregate.model.channelFollowerSyncState.findFirst({
        where: { organizationId, integrationId },
        select: { activeGeneration: true, status: true, completedAt: true },
      }),
      this._subscription.model.channelInteractionSubscription.findMany({
        where: { organizationId, integrationId },
        select: {
          eventKey: true,
          direction: true,
          remoteIdentifier: true,
          state: true,
          trackingStartedAt: true,
          failureCategory: true,
          failureReason: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ eventKey: 'asc' }, { direction: 'asc' }],
      }),
    ]);
    return { followerSync, subscriptions };
  }

  async listDueRelationshipGradeCandidates(
    snapshotAt: Date,
    after?: string,
    take = 1,
    cadence?: RelationshipGradeScheduleConfig
  ) {
    const dueCutoff = this.relationshipDueCutoff(snapshotAt, cadence);
    const integrations = await this._integration.model.integration.findMany({
      where: {
        type: 'social',
        disabled: false,
        deletedAt: null,
        channelFollowerSyncState: {
          is: {
            status: ChannelFollowerSyncStatus.COMPLETE,
            completedAt: { not: null },
          },
        },
        channelInteractionSubscriptions: {
          some: {
            state: {
              in: [
                ChannelInteractionTrackingState.ACTIVE,
                ChannelInteractionTrackingState.PARTIAL,
              ],
            },
          },
        },
        // Prisma cannot compare a member projection to its own channel's
        // selection, so the bounded registry is expanded into one branch per
        // strategy identity instead of scanning channels in application memory.
        OR: this.relationshipStrategyBranches().map((branch) => ({
          strategyId: branch.selection,
          channelAudienceMembers: {
            some: {
              membershipState: ChannelAudienceMembership.FOLLOWER,
              gradeSnapshots: {
                none: {
                  formulaVersion: RELATIONSHIP_FORMULA_VERSION,
                  relationshipStrategyId: branch.strategyId,
                  relationshipStrategyVersion: branch.strategyVersion,
                  snapshotAt: { gt: dueCutoff },
                },
              },
            },
          },
        })),
        ...(after ? { id: { gt: after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: take + 1,
      select: { id: true, organizationId: true },
    });
    return {
      candidates: integrations.slice(0, take),
      next: integrations.length > take ? integrations[take - 1]?.id : undefined,
    };
  }

  async getDueRelationshipGradeBatch(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    take = RELATIONSHIP_BATCH_SIZE,
    cadence?: RelationshipGradeScheduleConfig
  ): Promise<RelationshipGradeBatch> {
    const dueCutoff = this.relationshipDueCutoff(snapshotAt, cadence);
    return this.withSerializableRetry(async (tx) => {
      const strategy = await this.getRelationshipGradeStrategy(
        tx,
        organizationId,
        integrationId
      );
      const followers = await tx.channelAudienceMember.findMany({
        where: {
          organizationId,
          integrationId,
          membershipState: ChannelAudienceMembership.FOLLOWER,
          gradeSnapshots: {
            none: {
              formulaVersion: RELATIONSHIP_FORMULA_VERSION,
              relationshipStrategyId: strategy.strategyId,
              relationshipStrategyVersion: strategy.strategyVersion,
              snapshotAt: { gt: dueCutoff },
            },
          },
        },
        orderBy: { id: 'asc' },
        take,
        select: { externalId: true },
      });
      if (!followers.length) return { members: [], strategy };
      return {
        strategy,
        members: await this.aggregateRelationshipInteractionCounts(
          tx,
          organizationId,
          integrationId,
          followers.map(({ externalId }) => externalId),
          snapshotAt
        ),
      };
    });
  }

  async getRelationshipScoresForMembers(
    organizationId: string,
    integrationId: string,
    externalIds: string[],
    snapshotAt: Date
  ): Promise<RelationshipGradeBatch> {
    const uniqueIds = [...new Set(externalIds)].slice(
      0,
      RELATIONSHIP_REFRESH_MAX_MEMBERS
    );
    return this.withSerializableRetry(async (tx) => {
      const strategy = await this.getRelationshipGradeStrategy(
        tx,
        organizationId,
        integrationId
      );
      return {
        strategy,
        members: await this.aggregateRelationshipInteractionCounts(
          tx,
          organizationId,
          integrationId,
          uniqueIds,
          snapshotAt
        ),
      };
    });
  }

  async createRelationshipGradeSnapshots(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    snapshots: RelationshipGradeSnapshotInput[]
  ) {
    if (!snapshots.length) return { count: 0 };
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const created = await tx.channelRelationshipGradeSnapshot.createMany({
        data: snapshots.map((snapshot) => ({
          organizationId,
          integrationId,
          counterpartyExternalId: snapshot.externalId,
          windowStartedAt: new Date(snapshotAt.getTime() - RELATIONSHIP_WINDOW_MS),
          snapshotAt,
          effortScore: snapshot.effortScore,
          reciprocationScore: snapshot.reciprocationScore,
          reciprocity: snapshot.reciprocity,
          grade: snapshot.grade,
          formulaVersion: snapshot.formulaVersion,
          relationshipStrategyId: snapshot.strategyId,
          relationshipStrategyVersion: snapshot.strategyVersion,
        })),
        skipDuplicates: true,
      });
      await this.writeCurrentRelationshipProjections(
        tx,
        organizationId,
        integrationId,
        snapshotAt,
        snapshots
      );
      return created;
    });
  }

  async getCurrentRelationshipProjection(
    organizationId: string,
    integrationId: string,
    externalId: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      return tx.channelAudienceMember.findFirst({
        where: { organizationId, integrationId, externalId },
        select: {
          externalId: true,
          relationshipEffortScore: true,
          relationshipReciprocationScore: true,
        },
      });
    });
  }

  async updateCurrentRelationshipProjections(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    snapshots: RelationshipGradeSnapshotInput[],
    options?: { force?: boolean }
  ) {
    if (!snapshots.length) return { count: 0 };
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const results = await this.writeCurrentRelationshipProjections(
        tx,
        organizationId,
        integrationId,
        snapshotAt,
        snapshots,
        options
      );
      const count = results.reduce((sum, result) => sum + result.count, 0);
      return { count };
    });
  }

  async hasDueRelationshipGradeMembers(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    cadence?: RelationshipGradeScheduleConfig
  ) {
    const dueCutoff = this.relationshipDueCutoff(snapshotAt, cadence);
    const member = await this._dailyAggregate.model.channelAudienceMember.findFirst({
      where: {
        organizationId,
        integrationId,
        membershipState: ChannelAudienceMembership.FOLLOWER,
        OR: this.relationshipStrategyBranches().map((branch) => ({
          integration: { is: { strategyId: branch.selection } },
          gradeSnapshots: {
            none: {
              formulaVersion: RELATIONSHIP_FORMULA_VERSION,
              relationshipStrategyId: branch.strategyId,
              relationshipStrategyVersion: branch.strategyVersion,
              snapshotAt: { gt: dueCutoff },
            },
          },
        })),
      },
      select: { id: true },
    });
    return !!member;
  }

  /**
   * Whether any follower projection still carries a different formula or
   * strategy identity than the one currently selected for the channel. Old
   * grades stay visible while this is true.
   */
  async hasStaleRelationshipProjections(
    organizationId: string,
    integrationId: string,
    strategy: RelationshipGradeStrategySelection
  ) {
    const stale = await this._dailyAggregate.model.channelAudienceMember.findFirst({
      where: {
        organizationId,
        integrationId,
        membershipState: ChannelAudienceMembership.FOLLOWER,
        OR: [
          { relationshipFormulaVersion: null },
          { relationshipFormulaVersion: { not: RELATIONSHIP_FORMULA_VERSION } },
          { relationshipStrategyId: null },
          { relationshipStrategyId: { not: strategy.strategyId } },
          { relationshipStrategyVersion: null },
          {
            relationshipStrategyVersion: { not: strategy.strategyVersion },
          },
        ],
      },
      select: { id: true },
    });
    return !!stale;
  }

  async getAudienceBotScoreInputs(
    organizationId: string,
    integrationId: string,
    externalIds: string[]
  ) {
    const uniqueIds = [...new Set(externalIds.filter(Boolean))];
    const results = new Map<
      string,
      {
        inboundInteractionCount: number;
        noteCount: number;
        likesCount: number;
        relationshipEffortScore: number | null;
        relationshipReciprocationScore: number | null;
      }
    >();
    if (!uniqueIds.length) {
      return results;
    }
    const rows = await this._dailyAggregate.model.channelAudienceMember.findMany({
      where: {
        organizationId,
        integrationId,
        externalId: { in: uniqueIds },
      },
      select: {
        externalId: true,
        inboundInteractionCount: true,
        noteCount: true,
        likesCount: true,
        relationshipEffortScore: true,
        relationshipReciprocationScore: true,
      },
    });
    for (const row of rows) {
      results.set(row.externalId, {
        inboundInteractionCount: row.inboundInteractionCount,
        noteCount: row.noteCount,
        likesCount: row.likesCount,
        relationshipEffortScore: row.relationshipEffortScore,
        relationshipReciprocationScore: row.relationshipReciprocationScore,
      });
    }
    return results;
  }

  async listDueBotScoreCandidates(after?: string, take = 1) {
    const integrations = await this._integration.model.integration.findMany({
      where: {
        type: 'social',
        disabled: false,
        deletedAt: null,
        channelFollowerSyncState: {
          is: {
            status: ChannelFollowerSyncStatus.COMPLETE,
            completedAt: { not: null },
          },
        },
        channelAudienceMembers: {
          some: {
            membershipState: ChannelAudienceMembership.FOLLOWER,
            ...botScoreDueWhere(),
          },
        },
        ...(after ? { id: { gt: after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: take + 1,
      select: { id: true, organizationId: true },
    });
    return {
      candidates: integrations.slice(0, take),
      next: integrations.length > take ? integrations[take - 1]?.id : undefined,
    };
  }

  async listLeadBridgeCrawlCandidates(after?: string, take = 1) {
    const integrations = await this._integration.model.integration.findMany({
      where: {
        type: 'social',
        disabled: false,
        deletedAt: null,
        channelFollowerSyncState: {
          is: {
            status: ChannelFollowerSyncStatus.COMPLETE,
            completedAt: { not: null },
          },
        },
        channelAudienceMembers: {
          some: this.warmFollowerWhere(),
        },
        ...(after ? { id: { gt: after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: take + 1,
      select: {
        id: true,
        organizationId: true,
        providerIdentifier: true,
      },
    });
    return {
      candidates: integrations.slice(0, take),
      next: integrations.length > take ? integrations[take - 1]?.id : undefined,
    };
  }

  async getNextWarmFollowerForLeadBridge(
    organizationId: string,
    integrationId: string,
    afterExternalId?: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const member = await tx.channelAudienceMember.findFirst({
        where: {
          organizationId,
          integrationId,
          ...this.warmFollowerWhere(),
          ...(afterExternalId
            ? { externalId: { gt: afterExternalId } }
            : {}),
        },
        orderBy: { externalId: 'asc' },
        select: {
          externalId: true,
          username: true,
          name: true,
          relationshipGrade: true,
          relationshipTriage: true,
        },
      });
      if (member) {
        return member;
      }
      if (!afterExternalId) {
        return null;
      }
      return tx.channelAudienceMember.findFirst({
        where: {
          organizationId,
          integrationId,
          ...this.warmFollowerWhere(),
        },
        orderBy: { externalId: 'asc' },
        select: {
          externalId: true,
          username: true,
          name: true,
          relationshipGrade: true,
          relationshipTriage: true,
        },
      });
    });
  }

  async applyLeadBridgeDiscoveries(params: {
    organizationId: string;
    integrationId: string;
    bridgeExternalId: string;
    bridgeRelationshipGrade: number | null;
    leads: AudienceProfile[];
    discoveredAt?: Date;
    maxApplied?: number;
  }) {
    const discoveredAt = params.discoveredAt ?? new Date();
    const maxApplied = Math.max(
      0,
      params.maxApplied ?? LEAD_BRIDGE_PER_SOURCE_CAP
    );
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      const bridge = await tx.channelAudienceMember.findFirst({
        where: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          externalId: params.bridgeExternalId,
        },
        select: { externalId: true },
      });
      if (!bridge) {
        return { applied: 0, skipped: params.leads.length, appliedExternalIds: [] as string[] };
      }
      let applied = 0;
      let skipped = 0;
      const appliedExternalIds: string[] = [];
      for (const lead of params.leads) {
        if (
          !lead.externalId ||
          lead.externalId === params.bridgeExternalId
        ) {
          skipped++;
          continue;
        }
        const existing = await tx.channelAudienceMember.findFirst({
          where: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            externalId: lead.externalId,
          },
          select: { membershipState: true },
        });
        if (existing?.membershipState === ChannelAudienceMembership.FOLLOWER) {
          skipped++;
          continue;
        }

        const existingBridge = await tx.channelAudienceLeadBridge.findUnique({
          where: {
            organizationId_integrationId_leadExternalId_bridgeExternalId: {
              organizationId: params.organizationId,
              integrationId: params.integrationId,
              leadExternalId: lead.externalId,
              bridgeExternalId: params.bridgeExternalId,
            },
          },
          select: { leadExternalId: true },
        });
        if (!existingBridge && applied >= maxApplied) {
          skipped++;
          continue;
        }

        await this.upsertAudienceMember(
          tx,
          params.organizationId,
          params.integrationId,
          lead
        );
        await tx.channelAudienceLeadBridge.upsert({
          where: {
            organizationId_integrationId_leadExternalId_bridgeExternalId: {
              organizationId: params.organizationId,
              integrationId: params.integrationId,
              leadExternalId: lead.externalId,
              bridgeExternalId: params.bridgeExternalId,
            },
          },
          create: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            leadExternalId: lead.externalId,
            bridgeExternalId: params.bridgeExternalId,
            bridgeRelationshipGrade: params.bridgeRelationshipGrade,
            discoveredAt,
            lastSeenAt: discoveredAt,
          },
          update: {
            bridgeRelationshipGrade: params.bridgeRelationshipGrade,
            lastSeenAt: discoveredAt,
          },
        });
        const aggregate = await tx.channelAudienceLeadBridge.aggregate({
          where: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            leadExternalId: lead.externalId,
          },
          _max: { bridgeRelationshipGrade: true },
        });
        await tx.channelAudienceMember.updateMany({
          where: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            externalId: lead.externalId,
          },
          data: {
            leadBridgeScore: aggregate._max.bridgeRelationshipGrade,
          },
        });
        if (!existingBridge) {
          applied++;
          appliedExternalIds.push(lead.externalId);
        }
      }
      return { applied, skipped, appliedExternalIds };
    });
  }

  async clearAllDiscoveredLeads() {
    return this.withSerializableRetry(async (tx) => {
      const affectedIntegrations =
        await tx.channelAudienceLeadBridge.findMany({
          distinct: ['integrationId'],
          select: { integrationId: true },
        });
      const bridgesDeleted = await tx.channelAudienceLeadBridge.deleteMany({});
      await tx.channelAudienceMember.updateMany({
        where: {
          OR: [
            { leadBridgeScore: { not: null } },
            { leadFitScore: { not: null } },
          ],
        },
        data: {
          leadBridgeScore: null,
          leadFitScore: null,
          leadFitReason: null,
          leadFitConcerns: null,
          leadFitMatchedTopics: null,
          leadFitModel: null,
          leadFitVersion: null,
          leadFitScoredAt: null,
        },
      });

      const orphanWhere: Prisma.ChannelAudienceMemberWhereInput = {
        membershipState: {
          in: [
            ChannelAudienceMembership.UNKNOWN,
            ChannelAudienceMembership.NOT_FOLLOWER,
          ],
        },
        inboundInteractionCount: 0,
        leadBridgesAsLead: { none: {} },
        leadBridgesAsBridge: { none: {} },
      };
      const orphans = await tx.channelAudienceMember.findMany({
        where: orphanWhere,
        select: { integrationId: true, externalId: true },
      });
      if (orphans.length) {
        const memberKeys = orphans.map((orphan) => ({
          integrationId: orphan.integrationId,
          counterpartyExternalId: orphan.externalId,
        }));
        await tx.channelAudienceNote.deleteMany({
          where: { OR: memberKeys },
        });
        await tx.channelAudienceListMember.deleteMany({
          where: { OR: memberKeys },
        });
        await tx.channelAudienceMemberGrade.deleteMany({
          where: { OR: memberKeys },
        });
        await tx.channelRelationshipGradeSnapshot.deleteMany({
          where: { OR: memberKeys },
        });
        await tx.channelAudienceMemberTriageIgnore.deleteMany({
          where: { OR: memberKeys },
        });
        await tx.channelAudienceLeadFitFeedback.deleteMany({
          where: { OR: memberKeys },
        });
        await tx.channelAudienceCultivatePick.deleteMany({
          where: { OR: memberKeys },
        });
        await tx.channelAudienceHotPick.deleteMany({
          where: { OR: memberKeys },
        });
        await tx.channelInteractionWindowSummary.deleteMany({
          where: { OR: memberKeys },
        });
      }
      const orphansDeleted = await tx.channelAudienceMember.deleteMany({
        where: orphanWhere,
      });

      return {
        bridgesDeleted: bridgesDeleted.count,
        orphansDeleted: orphansDeleted.count,
        integrationIds: affectedIntegrations.map((row) => row.integrationId),
      };
    });
  }

  private warmFollowerWhere(): Prisma.ChannelAudienceMemberWhereInput {
    return {
      membershipState: ChannelAudienceMembership.FOLLOWER,
      ignoredAt: null,
      OR: [{ isBot: null }, { isBot: false }],
      AND: [
        {
          OR: [
            { relationshipTriage: 'mutual' },
            { relationshipGrade: { gte: LEAD_BRIDGE_WARM_GRADE_THRESHOLD } },
          ],
        },
      ],
    };
  }

  private cultivateEligibilityWhere(
    now = new Date(),
    config?: { warmGradeThreshold: number; staleDays: number }
  ): Prisma.ChannelAudienceMemberWhereInput {
    const staleBefore = new Date(
      now.getTime() -
      (config ? config.staleDays * 24 * 60 * 60 * 1000 : CULTIVATE_STALE_MS)
    );
    return {
      membershipState: ChannelAudienceMembership.FOLLOWER,
      ignoredAt: null,
      OR: [{ isBot: null }, { isBot: false }],
      NOT: { relationshipTriage: 'hot_lead' },
      triageIgnores: { none: this.activeTriageIgnoreWhere('cultivate') },
      AND: [
        {
          OR: [
            { relationshipTriage: 'mutual' },
            {
              relationshipGrade: {
                gte: config?.warmGradeThreshold ?? CULTIVATE_WARM_GRADE_THRESHOLD,
              },
            },
          ],
        },
        {
          OR: [
            { lastOutboundAt: null },
            { lastOutboundAt: { lt: staleBefore } },
          ],
        },
      ],
    };
  }

  private hotEligibilityWhere(): Prisma.ChannelAudienceMemberWhereInput {
    return {
      membershipState: ChannelAudienceMembership.FOLLOWER,
      ignoredAt: null,
      OR: [{ isBot: null }, { isBot: false }],
      AND: [this.triageFilter('hot_lead')],
    };
  }

  async listCultivateMaterializeCandidates(
    after?: string,
    take = 1,
    hour = utcHourKey()
  ) {
    if (!Number.isInteger(take) || take < 1) {
      throw new Error('take must be a positive integer');
    }
    const integrations = await this._integration.model.integration.findMany({
      where: {
        type: 'social',
        disabled: false,
        deletedAt: null,
        channelFollowerSyncState: {
          is: {
            status: ChannelFollowerSyncStatus.COMPLETE,
            completedAt: { not: null },
          },
        },
        channelAudienceMembers: {
          some: this.cultivateEligibilityWhere(),
        },
        channelAudienceCultivatePickBatches: { none: { hour } },
        ...(after ? { id: { gt: after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: take + 1,
      select: {
        id: true,
        organizationId: true,
        providerIdentifier: true,
      },
    });
    return {
      candidates: integrations.slice(0, take),
      next: integrations.length > take ? integrations[take - 1]?.id : undefined,
    };
  }

  async listCultivateCandidates(params: {
    organizationId: string;
    integrationId: string;
    now?: Date;
    take?: number;
    warmGradeThreshold?: number;
    staleDays?: number;
  }): Promise<CultivateCandidate[]> {
    const now = params.now ?? new Date();
    const take = params.take ?? CULTIVATE_CANDIDATE_POOL_SIZE;
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      return tx.channelAudienceMember.findMany({
        where: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          ...this.cultivateEligibilityWhere(
            now,
            params.warmGradeThreshold != null && params.staleDays != null
              ? {
                warmGradeThreshold: params.warmGradeThreshold,
                staleDays: params.staleDays,
              }
              : undefined
          ),
        },
        orderBy: [{ lastOutboundAt: { sort: 'asc', nulls: 'first' } }, { externalId: 'asc' }],
        take,
        select: {
          externalId: true,
          username: true,
          name: true,
          relationshipGrade: true,
          relationshipTriage: true,
          lastOutboundAt: true,
        },
      });
    });
  }

  async countVisibleCultivatePicks(params: {
    organizationId: string;
    integrationId: string;
    hour?: string;
    strategyId: ChannelStrategyId;
    strategyVersion: number;
    materializationVersion: number;
  }) {
    const hour = params.hour ?? utcHourKey();
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      return tx.channelAudienceCultivatePick.count({
        where: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          hour,
          batch: {
            is: {
              strategyId: params.strategyId,
              strategyVersion: params.strategyVersion,
              materializationVersion: params.materializationVersion,
            },
          },
          audienceMember: this.cultivateEligibilityWhere(),
        },
      });
    });
  }

  async replaceCultivatePickBatch(params: {
    organizationId: string;
    integrationId: string;
    hour: string;
    strategyId: ChannelStrategyId;
    strategyVersion: number;
    materializationVersion: number;
    candidateCount: number;
    source?: string;
    completedAt?: Date;
    picks: CultivatePickInput[];
  }) {
    const parsedHour = new Date(`${params.hour}:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(params.hour) ||
      Number.isNaN(parsedHour.getTime()) ||
      utcHourKey(parsedHour) !== params.hour
    ) {
      throw new Error('hour must be a UTC hour key');
    }
    const externalIds = params.picks.map((pick) => pick.counterpartyExternalId);
    const rulesRanks = params.picks.map((pick) => pick.rulesRank);
    const finalRanks = params.picks.map((pick) => pick.finalRank);
    if (
      new Set(externalIds).size !== externalIds.length ||
      new Set(rulesRanks).size !== rulesRanks.length ||
      new Set(finalRanks).size !== finalRanks.length ||
      params.picks.some(
        (pick) =>
          !Number.isInteger(pick.rulesRank) ||
          !Number.isInteger(pick.finalRank) ||
          pick.rulesRank < 1 ||
          pick.finalRank < 1
      )
    ) {
      throw new Error(
        'Cultivate picks must have unique positive member and rank values'
      );
    }
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      if (externalIds.length) {
        const members = await tx.channelAudienceMember.findMany({
          where: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            externalId: { in: externalIds },
          },
          select: { externalId: true },
        });
        if (members.length !== externalIds.length) {
          throw new Error('Cultivate picks must belong to the integration');
        }
      }
      await tx.channelAudienceCultivatePick.deleteMany({
        where: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          hour: params.hour,
        },
      });
      await tx.channelAudienceCultivatePickBatch.upsert({
        where: {
          organizationId_integrationId_hour: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            hour: params.hour,
          },
        },
        create: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          hour: params.hour,
          strategyId: params.strategyId,
          strategyVersion: params.strategyVersion,
          materializationVersion: params.materializationVersion,
          candidateCount: params.candidateCount,
          pickCount: params.picks.length,
          source: params.source ?? 'rules',
          completedAt: params.completedAt ?? new Date(),
        },
        update: {
          strategyId: params.strategyId,
          strategyVersion: params.strategyVersion,
          materializationVersion: params.materializationVersion,
          candidateCount: params.candidateCount,
          pickCount: params.picks.length,
          source: params.source ?? 'rules',
          completedAt: params.completedAt ?? new Date(),
        },
      });
      if (params.picks.length) {
        await tx.channelAudienceCultivatePick.createMany({
          data: params.picks.map((pick) => ({
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            hour: params.hour,
            counterpartyExternalId: pick.counterpartyExternalId,
            rulesRank: pick.rulesRank,
            finalRank: pick.finalRank,
            rulesReason: pick.rulesReason,
            aiRank: pick.aiRank ?? null,
            aiReason: pick.aiReason ?? null,
            suggestedAction: pick.suggestedAction ?? null,
            source: pick.source ?? params.source ?? 'rules',
          })),
        });
      }
      return { count: params.picks.length };
    });
  }

  async countVisibleHotPicks(params: {
    organizationId: string;
    integrationId: string;
    hour?: string;
    strategyId: ChannelStrategyId;
    strategyVersion: number;
    materializationVersion: number;
  }) {
    const hour = params.hour ?? utcHourKey();
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      return tx.channelAudienceHotPick.count({
        where: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          hour,
          batch: {
            is: {
              strategyId: params.strategyId,
              strategyVersion: params.strategyVersion,
              materializationVersion: params.materializationVersion,
            },
          },
          audienceMember: this.hotEligibilityWhere(),
        },
      });
    });
  }

  async listHotRefreshExternalIds(params: {
    organizationId: string;
    integrationId: string;
    poolSize: number;
    recentEventSince: Date;
  }) {
    if (!Number.isInteger(params.poolSize) || params.poolSize < 1) {
      throw new Error('poolSize must be a positive integer');
    }
    if (
      !(params.recentEventSince instanceof Date) ||
      Number.isNaN(params.recentEventSince.getTime())
    ) {
      throw new Error('recentEventSince must be a valid Date');
    }
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      const [stored, recent] = await Promise.all([
        tx.channelAudienceMember.findMany({
          where: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            membershipState: ChannelAudienceMembership.FOLLOWER,
          },
          orderBy: [
            { relationshipNetGap: { sort: 'desc', nulls: 'last' } },
            { externalId: 'asc' },
          ],
          take: params.poolSize,
          select: { externalId: true },
        }),
        tx.channelInteractionEvent.findMany({
          where: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            direction: ChannelInteractionDirection.INBOUND,
            eventAt: { gte: params.recentEventSince },
          },
          distinct: ['counterpartyExternalId'],
          orderBy: [
            { counterpartyExternalId: 'asc' },
            { eventAt: 'desc' },
          ],
          take: params.poolSize,
          select: { counterpartyExternalId: true },
        }),
      ]);
      const recentFollowerIds = new Set(
        (
          await tx.channelAudienceMember.findMany({
            where: {
              organizationId: params.organizationId,
              integrationId: params.integrationId,
              membershipState: ChannelAudienceMembership.FOLLOWER,
              externalId: {
                in: recent.map((row) => row.counterpartyExternalId),
              },
            },
            select: { externalId: true },
          })
        ).map((row) => row.externalId)
      );
      const storedIds = stored.map((row) => row.externalId);
      const recentIds = recent
        .map((row) => row.counterpartyExternalId)
        .filter((externalId) => recentFollowerIds.has(externalId));
      const externalIds: string[] = [];
      const seen = new Set<string>();
      let storedIndex = 0;
      let recentIndex = 0;
      while (
        externalIds.length < params.poolSize &&
        (recentIndex < recentIds.length || storedIndex < storedIds.length)
      ) {
        const externalId =
          recentIndex < recentIds.length
            ? recentIds[recentIndex++]
            : storedIds[storedIndex++];
        if (!seen.has(externalId)) {
          seen.add(externalId);
          externalIds.push(externalId);
        }
        if (
          externalIds.length < params.poolSize &&
          storedIndex < storedIds.length
        ) {
          const storedExternalId = storedIds[storedIndex++];
          if (!seen.has(storedExternalId)) {
            seen.add(storedExternalId);
            externalIds.push(storedExternalId);
          }
        }
      }
      return externalIds;
    });
  }

  async listHotRulesCandidates(params: {
    organizationId: string;
    integrationId: string;
    strategyId: ChannelStrategyId;
    strategyVersion: number;
    poolSize: number;
  }): Promise<HotCandidate[]> {
    if (!Number.isInteger(params.poolSize) || params.poolSize < 1) {
      throw new Error('poolSize must be a positive integer');
    }
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      return tx.channelAudienceMember.findMany({
        where: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          relationshipStrategyId: params.strategyId,
          relationshipStrategyVersion: params.strategyVersion,
          ...this.hotEligibilityWhere(),
        },
        orderBy: [
          { relationshipNetGap: { sort: 'desc', nulls: 'last' } },
          { relationshipReciprocationScore: { sort: 'desc', nulls: 'last' } },
          { externalId: 'asc' },
        ],
        take: params.poolSize,
        select: {
          externalId: true,
          username: true,
          name: true,
          bio: true,
          profileUrl: true,
          followersCount: true,
          followingCount: true,
          relationshipNetGap: true,
          relationshipReciprocationScore: true,
          relationshipEffortScore: true,
          relationshipTriage: true,
          relationshipSnapshotAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
        },
      });
    });
  }

  async listHotMaterializeCandidates(after?: string, take = 1, hour = utcHourKey()) {
    if (!Number.isInteger(take) || take < 1) {
      throw new Error('take must be a positive integer');
    }
    const integrations = await this._integration.model.integration.findMany({
      where: {
        type: 'social',
        disabled: false,
        deletedAt: null,
        channelFollowerSyncState: {
          is: {
            status: ChannelFollowerSyncStatus.COMPLETE,
            completedAt: { not: null },
          },
        },
        channelAudienceHotPickBatches: { none: { hour } },
        ...(after ? { id: { gt: after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: take + 1,
      select: {
        id: true,
        organizationId: true,
        providerIdentifier: true,
        strategyId: true,
        strategyVersion: true,
      },
    });
    return {
      candidates: integrations.slice(0, take),
      next: integrations.length > take ? integrations[take - 1]?.id : undefined,
    };
  }

  async replaceHotPickBatch(params: {
    organizationId: string;
    integrationId: string;
    hour: string;
    strategyId: ChannelStrategyId;
    strategyVersion: number;
    materializationVersion: number;
    candidateCount: number;
    source?: string;
    completedAt?: Date;
    picks: HotPickInput[];
  }) {
    const parsedHour = new Date(`${params.hour}:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(params.hour) ||
      Number.isNaN(parsedHour.getTime()) ||
      utcHourKey(parsedHour) !== params.hour
    ) {
      throw new Error('hour must be a UTC hour key');
    }
    const externalIds = params.picks.map((pick) => pick.counterpartyExternalId);
    const rulesRanks = params.picks.map((pick) => pick.rulesRank);
    const finalRanks = params.picks.map((pick) => pick.finalRank);
    if (
      new Set(externalIds).size !== externalIds.length ||
      new Set(rulesRanks).size !== rulesRanks.length ||
      new Set(finalRanks).size !== finalRanks.length ||
      params.picks.some(
        (pick) =>
          !Number.isInteger(pick.rulesRank) ||
          !Number.isInteger(pick.finalRank) ||
          pick.rulesRank < 1 ||
          pick.finalRank < 1
      )
    ) {
      throw new Error('Hot picks must have unique positive member and rank values');
    }
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      if (externalIds.length) {
        const members = await tx.channelAudienceMember.findMany({
          where: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            externalId: { in: externalIds },
          },
          select: { externalId: true },
        });
        if (members.length !== externalIds.length) {
          throw new Error('Hot picks must belong to the integration');
        }
      }
      await tx.channelAudienceHotPick.deleteMany({
        where: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          hour: params.hour,
        },
      });
      await tx.channelAudienceHotPickBatch.upsert({
        where: {
          organizationId_integrationId_hour: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            hour: params.hour,
          },
        },
        create: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          hour: params.hour,
          strategyId: params.strategyId,
          strategyVersion: params.strategyVersion,
          materializationVersion: params.materializationVersion,
          candidateCount: params.candidateCount,
          pickCount: params.picks.length,
          source: params.source ?? 'rules',
          completedAt: params.completedAt ?? new Date(),
        },
        update: {
          strategyId: params.strategyId,
          strategyVersion: params.strategyVersion,
          materializationVersion: params.materializationVersion,
          candidateCount: params.candidateCount,
          pickCount: params.picks.length,
          source: params.source ?? 'rules',
          completedAt: params.completedAt ?? new Date(),
        },
      });
      if (params.picks.length) {
        await tx.channelAudienceHotPick.createMany({
          data: params.picks.map((pick) => ({
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            hour: params.hour,
            counterpartyExternalId: pick.counterpartyExternalId,
            rulesRank: pick.rulesRank,
            finalRank: pick.finalRank,
            rulesReason: pick.rulesReason,
            aiRank: pick.aiRank ?? null,
            aiReason: pick.aiReason ?? null,
            suggestedAction: pick.suggestedAction ?? null,
            source: pick.source ?? params.source ?? 'rules',
          })),
        });
      }
      return { count: params.picks.length };
    });
  }

  async getAudienceHot(query: AudienceHotQuery) {
    const now = query.now ?? new Date();
    const currentHour = utcHourKey(now);
    const previousHour = utcHourKey(new Date(now.getTime() - 60 * 60 * 1000));
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, query.organizationId, query.integrationId);
      if (
        query.hour &&
        query.hour !== currentHour &&
        query.hour !== previousHour
      ) {
        return {
          items: [],
          hasMore: false,
          source: 'materialized' as const,
          hour: null,
        };
      }
      const batch = query.hour
        ? await tx.channelAudienceHotPickBatch.findUnique({
          where: {
            organizationId_integrationId_hour: {
              organizationId: query.organizationId,
              integrationId: query.integrationId,
              hour: query.hour,
            },
          },
        })
        : await (async () => {
          const current = await tx.channelAudienceHotPickBatch.findUnique({
            where: {
              organizationId_integrationId_hour: {
                organizationId: query.organizationId,
                integrationId: query.integrationId,
                hour: currentHour,
              },
            },
          });
          return (
            current ??
            (await tx.channelAudienceHotPickBatch.findUnique({
              where: {
                organizationId_integrationId_hour: {
                  organizationId: query.organizationId,
                  integrationId: query.integrationId,
                  hour: previousHour,
                },
              },
            }))
          );
        })();
      if (
        !batch ||
        batch.strategyId !== query.strategyId ||
        batch.strategyVersion !== query.strategyVersion ||
        batch.materializationVersion !== query.materializationVersion
      ) {
        return { items: [], hasMore: false, source: 'materialized' as const, hour: null };
      }
      const comparison = query.direction === 'desc' ? 'lt' : 'gt';
      const rows = await tx.channelAudienceHotPick.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          hour: batch.hour,
          audienceMember: {
            ...this.hotEligibilityWhere(),
            ...(query.search ? this.audienceSearchFilter(query.search) : {}),
          },
          ...(query.cursor
            ? {
              OR: [
                { finalRank: { [comparison]: query.cursor.finalRank } },
                {
                  finalRank: query.cursor.finalRank,
                  counterpartyExternalId: { [comparison]: query.cursor.externalId },
                },
              ],
            }
            : {}),
        },
        orderBy: [
          { finalRank: query.direction },
          { counterpartyExternalId: query.direction },
        ],
        take: query.limit + 1,
        select: {
          finalRank: true,
          rulesRank: true,
          rulesReason: true,
          aiReason: true,
          suggestedAction: true,
          source: true,
          audienceMember: { select: this.audienceMemberListSelect(query.userId) },
        },
      });
      return {
        items: rows.slice(0, query.limit).map((row) => ({
          ...row.audienceMember,
          finalRank: row.finalRank,
          rulesRank: row.rulesRank,
          hotReason: row.aiReason || row.rulesReason,
          suggestedAction: row.suggestedAction,
          hotSource: row.source,
        })),
        hasMore: rows.length > query.limit,
        source: 'materialized' as const,
        hour: batch.hour,
      };
    });
  }

  async getAudienceCultivate(query: AudienceCultivateQuery) {
    const now = query.now ?? new Date();
    const currentHour = utcHourKey(now);
    const previousHour = utcHourKey(new Date(now.getTime() - 60 * 60 * 1000));
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        query.organizationId,
        query.integrationId
      );
      if (
        query.hour &&
        query.hour !== currentHour &&
        query.hour !== previousHour
      ) {
        return {
          items: [],
          hasMore: false,
          source: 'materialized' as const,
          hour: null,
        };
      }
      const batch = query.hour
        ? await tx.channelAudienceCultivatePickBatch.findUnique({
          where: {
            organizationId_integrationId_hour: {
              organizationId: query.organizationId,
              integrationId: query.integrationId,
              hour: query.hour,
            },
          },
        })
        : await (async () => {
          const current = await tx.channelAudienceCultivatePickBatch.findUnique({
            where: {
              organizationId_integrationId_hour: {
                organizationId: query.organizationId,
                integrationId: query.integrationId,
                hour: currentHour,
              },
            },
          });
          return (
            current ??
            (await tx.channelAudienceCultivatePickBatch.findUnique({
              where: {
                organizationId_integrationId_hour: {
                  organizationId: query.organizationId,
                  integrationId: query.integrationId,
                  hour: previousHour,
                },
              },
            }))
          );
        })();
      if (
        !batch ||
        batch.strategyId !== query.strategyId ||
        batch.strategyVersion !== query.strategyVersion ||
        batch.materializationVersion !== query.materializationVersion
      ) {
        return {
          items: [],
          hasMore: false,
          source: 'materialized' as const,
          hour: null,
        };
      }
      const comparison = query.direction === 'desc' ? 'lt' : 'gt';
      const rows = await tx.channelAudienceCultivatePick.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          hour: batch.hour,
          audienceMember: {
            ...this.cultivateEligibilityWhere(now),
            ...(query.search ? this.audienceSearchFilter(query.search) : {}),
          },
          ...(query.cursor
            ? {
              OR: [
                { finalRank: { [comparison]: query.cursor.finalRank } },
                {
                  finalRank: query.cursor.finalRank,
                  counterpartyExternalId: {
                    [comparison]: query.cursor.externalId,
                  },
                },
              ],
            }
            : {}),
        },
        orderBy: [
          { finalRank: query.direction },
          { counterpartyExternalId: query.direction },
        ],
        take: query.limit + 1,
        select: {
          finalRank: true,
          rulesRank: true,
          rulesReason: true,
          aiReason: true,
          suggestedAction: true,
          source: true,
          counterpartyExternalId: true,
          audienceMember: {
            select: this.audienceMemberListSelect(query.userId),
          },
        },
      });
      const items = rows.slice(0, query.limit).map((row) => ({
        ...row.audienceMember,
        finalRank: row.finalRank,
        rulesRank: row.rulesRank,
        cultivateReason: row.aiReason || row.rulesReason,
        suggestedAction: row.suggestedAction,
        cultivateSource: row.source,
      }));
      return {
        items,
        hasMore: rows.length > query.limit,
        source: 'materialized' as const,
        hour: batch.hour,
      };
    });
  }

  rankCultivateCandidates<
    T extends {
      externalId: string;
      lastOutboundAt: Date | null;
      relationshipGrade: number | null;
      relationshipTriage: string | null;
    }
  >(candidates: T[], hour: string, now = new Date()) {
    const scored = candidates.map((candidate) => {
      const staleMs = candidate.lastOutboundAt
        ? Math.max(0, now.getTime() - candidate.lastOutboundAt.getTime())
        : Number.POSITIVE_INFINITY;
      const rotation = this.cultivateHourSeed(hour, candidate.externalId);
      return {
        candidate,
        staleMs,
        grade: candidate.relationshipGrade ?? 0,
        rotation,
        rulesReason: this.cultivateRulesReason(candidate, now),
      };
    });
    scored.sort((a, b) => {
      if (a.staleMs !== b.staleMs) return b.staleMs - a.staleMs;
      if (a.grade !== b.grade) return b.grade - a.grade;
      if (a.rotation !== b.rotation) return a.rotation - b.rotation;
      return a.candidate.externalId.localeCompare(b.candidate.externalId);
    });
    return scored.map((row, index) => ({
      ...row.candidate,
      rulesRank: index + 1,
      finalRank: index + 1,
      rulesReason: row.rulesReason,
    }));
  }

  private cultivateHourSeed(hour: string, externalId: string) {
    let hash = 2166136261;
    const input = `${hour}:${externalId}`;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private cultivateRulesReason(
    candidate: {
      lastOutboundAt: Date | null;
      relationshipTriage: string | null;
      relationshipGrade: number | null;
    },
    now: Date
  ) {
    const daysStale = candidate.lastOutboundAt
      ? Math.max(
        1,
        Math.floor(
          (now.getTime() - candidate.lastOutboundAt.getTime()) /
          (24 * 60 * 60 * 1000)
        )
      )
      : null;
    const relationship =
      candidate.relationshipTriage === 'mutual'
        ? 'mutual relationship'
        : candidate.relationshipGrade != null
          ? `grade ${candidate.relationshipGrade.toFixed(1)}`
          : 'warm relationship';
    if (daysStale == null) {
      return `No outbound attention yet · ${relationship}`;
    }
    return `No outbound attention in ${daysStale} days · ${relationship}`;
  }

  async getDueBotScoreBatch(
    organizationId: string,
    integrationId: string,
    take = BOT_SCORE_BATCH_SIZE
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const members = await tx.channelAudienceMember.findMany({
        where: {
          organizationId,
          integrationId,
          membershipState: ChannelAudienceMembership.FOLLOWER,
          ...botScoreDueWhere(),
        },
        orderBy: { id: 'asc' },
        take,
        select: {
          externalId: true,
          name: true,
          username: true,
          picture: true,
          bio: true,
          followersCount: true,
          followingCount: true,
          accountCreatedAt: true,
          inboundInteractionCount: true,
          noteCount: true,
          likesCount: true,
          relationshipEffortScore: true,
          relationshipReciprocationScore: true,
        },
      });
      return { members };
    });
  }

  async updateBotScoreProjections(
    organizationId: string,
    integrationId: string,
    gradedAt: Date,
    projections: Array<{
      externalId: string;
      botGrade: number | null;
      isBot: boolean | null;
      botConfidence: number;
      botFormulaVersion: number;
    }>
  ) {
    if (!projections.length) {
      return { count: 0 };
    }
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      await Promise.all(
        projections.map((projection) =>
          tx.channelAudienceMember.updateMany({
            where: {
              organizationId,
              integrationId,
              externalId: projection.externalId,
              OR: [{ botGradedAt: null }, { botGradedAt: { lte: gradedAt } }],
            },
            data: {
              botGrade: projection.botGrade,
              isBot: projection.isBot,
              botConfidence: projection.botConfidence,
              botFormulaVersion: projection.botFormulaVersion,
              botGradedAt: gradedAt,
            },
          })
        )
      );
      return { count: projections.length };
    });
  }

  async hasDueBotScoreMembers(organizationId: string, integrationId: string) {
    const member = await this._dailyAggregate.model.channelAudienceMember.findFirst({
      where: {
        organizationId,
        integrationId,
        membershipState: ChannelAudienceMembership.FOLLOWER,
        ...botScoreDueWhere(),
      },
      select: { id: true },
    });
    return !!member;
  }

  async getFollowerInteractionMetrics(
    organizationId: string,
    integrationId: string,
    externalIds: string[]
  ): Promise<Map<string, FollowerInteractionMetrics>> {
    const uniqueIds = [...new Set(externalIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return new Map();
    }

    const rows =
      await this._dailyAggregate.model.channelInteractionDailyAggregate.groupBy({
        by: ['counterpartyExternalId'],
        where: {
          organizationId,
          integrationId,
          counterpartyExternalId: { in: uniqueIds },
        },
        _sum: {
          interactionCount: true,
          interactionScore: true,
        },
        _max: {
          lastInteractionAt: true,
        },
      });

    return new Map(
      rows.map((row) => [
        row.counterpartyExternalId,
        {
          interactionCount: row._sum.interactionCount ?? 0,
          interactionScore: row._sum.interactionScore ?? 0,
          lastInteractionAt: row._max.lastInteractionAt ?? null,
        },
      ])
    );
  }

  async getFollowerDetails(
    organizationId: string,
    integrationId: string,
    externalId: string,
    userId?: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const member = await tx.channelAudienceMember.findFirst({
        where: { organizationId, integrationId, externalId },
        include: {
          gradeSnapshots: { orderBy: { snapshotAt: 'asc' } },
          listMemberships: {
            where: { list: { deletedAt: null } },
            select: { listId: true },
          },
          triageIgnores: {
            select: { triage: true, expiresAt: true },
          },
          notes: {
            orderBy: { createdAt: 'desc' },
            include: {
              author: {
                select: { id: true, name: true, lastName: true, email: true },
              },
            },
          },
        },
      });
      if (!member) return null;
      const [events, tracking, personalGrade] = await Promise.all([
        tx.channelInteractionEvent.findMany({
          where: { organizationId, integrationId, counterpartyExternalId: externalId },
          orderBy: { eventAt: 'desc' },
          take: 20,
          select: {
            id: true,
            kind: true,
            direction: true,
            eventAt: true,
            relatedObjectId: true,
          },
        }),
        this.getInteractionTrackingInTransaction(tx, organizationId, integrationId),
        userId
          ? tx.channelAudienceMemberGrade.findUnique({
            where: {
              organizationId_integrationId_counterpartyExternalId_userId: {
                organizationId,
                integrationId,
                counterpartyExternalId: externalId,
                userId,
              },
            },
            select: { grade: true },
          })
          : Promise.resolve(null),
      ]);
      return {
        member,
        snapshots: member.gradeSnapshots,
        notes: member.notes,
        events,
        tracking,
        myGrade: personalGrade?.grade ?? null,
      };
    });
  }

  async findMemberExternalIdByUsername(
    organizationId: string,
    integrationId: string,
    username: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const matches = await tx.channelAudienceMember.findMany({
        where: {
          organizationId,
          integrationId,
          username: { equals: username, mode: 'insensitive' },
        },
        select: { externalId: true },
        take: 2,
      });
      if (matches.length !== 1) {
        return null;
      }
      return matches[0].externalId;
    });
  }

  async createAudienceNote(
    organizationId: string,
    integrationId: string,
    externalId: string,
    authorUserId: string,
    content: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertNoteAccess(tx, organizationId, integrationId, externalId, authorUserId);
      const note = await tx.channelAudienceNote.create({
        data: {
          organizationId,
          integrationId,
          counterpartyExternalId: externalId,
          authorUserId,
          content,
        },
        include: {
          author: {
            select: { id: true, name: true, lastName: true, email: true },
          },
        },
      });
      await tx.channelAudienceMember.updateMany({
        where: { organizationId, integrationId, externalId },
        data: { noteCount: { increment: 1 } },
      });
      return note;
    });
  }

  async updateAudienceNote(
    organizationId: string,
    integrationId: string,
    noteId: string,
    content: string
  ) {
    const result = await this._dailyAggregate.model.channelAudienceNote.updateMany({
      where: { id: noteId, organizationId, integrationId },
      data: { content },
    });
    return result.count === 1;
  }

  async deleteAudienceNote(organizationId: string, integrationId: string, noteId: string) {
    return this.withSerializableRetry(async (tx) => {
      const note = await tx.channelAudienceNote.findFirst({
        where: { id: noteId, organizationId, integrationId },
        select: { id: true, counterpartyExternalId: true },
      });
      if (!note) {
        return false;
      }

      const deleted = await tx.channelAudienceNote.deleteMany({
        where: { id: note.id, organizationId, integrationId },
      });
      if (deleted.count !== 1) {
        return false;
      }

      await tx.channelAudienceMember.updateMany({
        where: {
          organizationId,
          integrationId,
          externalId: note.counterpartyExternalId,
          noteCount: { gt: 0 },
        },
        data: { noteCount: { decrement: 1 } },
      });
      return true;
    });
  }

  async listAudienceLists(organizationId: string, integrationId: string) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      return tx.channelAudienceList.findMany({
        where: { organizationId, integrationId, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      });
    });
  }

  async getStoredFollowerAudienceCounts(
    organizationId: string,
    integrationId: string,
    listLimit = 20
  ): Promise<StoredFollowerAudienceCounts> {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const lists = await tx.channelAudienceList.findMany({
        where: { organizationId, integrationId, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: listLimit + 1,
        select: { id: true, name: true },
      });
      const boundedLists = lists.slice(0, listLimit);
      const categories = [
        ...FOLLOWER_TRIAGE_FILTERS,
        ...FOLLOWER_AUDIENCES,
      ];
      const [categoryTotals, listTotals] = await Promise.all([
        Promise.all(
          categories.map((category) =>
            tx.channelAudienceMember.count({
              where: {
                organizationId,
                integrationId,
                ...this.storedAudienceCategoryFilter(category),
              },
            })
          )
        ),
        Promise.all(
          boundedLists.map((list) =>
            tx.channelAudienceMember.count({
              where: {
                organizationId,
                integrationId,
                ignoredAt: null,
                ...this.listMembershipFilter(list.id),
              },
            })
          )
        ),
      ]);
      return {
        categories: Object.fromEntries(
          categories.map((category, index) => [category, categoryTotals[index]])
        ),
        lists: boundedLists.map((list, index) => ({
          ...list,
          total: listTotals[index],
        })),
        listsTruncated: lists.length > boundedLists.length,
      };
    });
  }

  async createAudienceList(
    organizationId: string,
    integrationId: string,
    name: string,
    createdByUserId: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const existing = await tx.channelAudienceList.findFirst({
        where: {
          organizationId,
          integrationId,
          deletedAt: null,
          name: { equals: name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (existing) {
        return { conflict: true as const };
      }
      const list = await tx.channelAudienceList.create({
        data: {
          organizationId,
          integrationId,
          name,
          createdByUserId,
        },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      });
      return { conflict: false as const, list };
    });
  }

  async updateAudienceList(
    organizationId: string,
    integrationId: string,
    listId: string,
    name: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const current = await tx.channelAudienceList.findFirst({
        where: { id: listId, organizationId, integrationId, deletedAt: null },
        select: { id: true },
      });
      if (!current) {
        return { missing: true as const };
      }
      const duplicate = await tx.channelAudienceList.findFirst({
        where: {
          organizationId,
          integrationId,
          deletedAt: null,
          id: { not: listId },
          name: { equals: name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (duplicate) {
        return { conflict: true as const };
      }
      const list = await tx.channelAudienceList.update({
        where: { id: listId },
        data: { name },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      });
      return { list };
    });
  }

  async deleteAudienceList(
    organizationId: string,
    integrationId: string,
    listId: string
  ) {
    const result = await this._dailyAggregate.model.channelAudienceList.updateMany({
      where: { id: listId, organizationId, integrationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count === 1;
  }

  async addAudienceListMember(
    organizationId: string,
    integrationId: string,
    listId: string,
    externalId: string,
    createdByUserId?: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const list = await tx.channelAudienceList.findFirst({
        where: { id: listId, organizationId, integrationId, deletedAt: null },
        select: { id: true },
      });
      if (!list) {
        return { missing: 'list' as const };
      }
      const member = await tx.channelAudienceMember.findFirst({
        where: { organizationId, integrationId, externalId },
        select: {
          externalId: true,
          name: true,
          username: true,
          bio: true,
          followersCount: true,
          followingCount: true,
          leadFitScore: true,
          leadFitReason: true,
          leadFitMatchedTopics: true,
        },
      });
      if (!member) {
        return { missing: 'member' as const };
      }
      await tx.channelAudienceListMember.upsert({
        where: {
          listId_counterpartyExternalId: {
            listId,
            counterpartyExternalId: externalId,
          },
        },
        create: {
          organizationId,
          integrationId,
          listId,
          counterpartyExternalId: externalId,
        },
        update: {},
      });
      await this.upsertLeadFitFeedback(tx, {
        organizationId,
        integrationId,
        externalId,
        source: 'list_add',
        verdict: 'accepted',
        reasons: [],
        listId,
        createdByUserId,
        member,
      });
      return { ok: true as const };
    });
  }

  async upsertImportedAudienceMemberAndAddToList(
    organizationId: string,
    integrationId: string,
    listId: string,
    profile: AudienceProfile,
    createdByUserId?: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const list = await tx.channelAudienceList.findFirst({
        where: { id: listId, organizationId, integrationId, deletedAt: null },
        select: { id: true },
      });
      if (!list) {
        return { missing: 'list' as const };
      }

      const profileData = {
        ...(profile.name !== undefined ? { name: profile.name } : {}),
        ...(profile.username !== undefined ? { username: profile.username } : {}),
        ...(profile.picture !== undefined ? { picture: profile.picture } : {}),
        ...(profile.profileUrl !== undefined
          ? { profileUrl: profile.profileUrl }
          : {}),
        ...(profile.bio !== undefined ? { bio: profile.bio } : {}),
        ...(profile.followersCount !== undefined
          ? { followersCount: profile.followersCount }
          : {}),
        ...(profile.followingCount !== undefined
          ? { followingCount: profile.followingCount }
          : {}),
        ...(profile.followedAt !== undefined
          ? { followedAt: profile.followedAt }
          : {}),
        ...(profile.accountCreatedAt !== undefined
          ? { accountCreatedAt: profile.accountCreatedAt }
          : {}),
      };

      await tx.channelAudienceMember.upsert({
        where: {
          integrationId_externalId: {
            integrationId,
            externalId: profile.externalId,
          },
        },
        create: {
          organizationId,
          integrationId,
          externalId: profile.externalId,
          ...profileData,
        },
        update: profileData,
      });

      const member = await tx.channelAudienceMember.findFirst({
        where: {
          organizationId,
          integrationId,
          externalId: profile.externalId,
        },
        select: {
          externalId: true,
          name: true,
          username: true,
          bio: true,
          followersCount: true,
          followingCount: true,
          leadFitScore: true,
          leadFitReason: true,
          leadFitMatchedTopics: true,
        },
      });
      if (!member) {
        return { missing: 'member' as const };
      }

      await tx.channelAudienceListMember.upsert({
        where: {
          listId_counterpartyExternalId: {
            listId,
            counterpartyExternalId: profile.externalId,
          },
        },
        create: {
          organizationId,
          integrationId,
          listId,
          counterpartyExternalId: profile.externalId,
        },
        update: {},
      });
      await this.upsertLeadFitFeedback(tx, {
        organizationId,
        integrationId,
        externalId: profile.externalId,
        source: 'list_add',
        verdict: 'accepted',
        reasons: [],
        listId,
        createdByUserId,
        member,
      });
      return {
        ok: true as const,
        member: {
          externalId: member.externalId,
          name: member.name,
          username: member.username,
        },
      };
    });
  }

  async removeAudienceListMember(
    organizationId: string,
    integrationId: string,
    listId: string,
    externalId: string
  ) {
    const list = await this._dailyAggregate.model.channelAudienceList.findFirst({
      where: { id: listId, organizationId, integrationId, deletedAt: null },
      select: { id: true },
    });
    if (!list) {
      return { missing: 'list' as const };
    }
    await this._dailyAggregate.model.channelAudienceListMember.deleteMany({
      where: {
        organizationId,
        integrationId,
        listId,
        counterpartyExternalId: externalId,
      },
    });
    return { ok: true as const };
  }

  async removeAudienceListMembers(
    organizationId: string,
    integrationId: string,
    listId: string,
    options: {
      externalIds?: string[];
      onlyFollowing?: boolean;
      limit?: number;
    }
  ) {
    const limit = options.limit ?? 50;
    const list = await this._dailyAggregate.model.channelAudienceList.findFirst({
      where: { id: listId, organizationId, integrationId, deletedAt: null },
      select: { id: true },
    });
    if (!list) {
      return { missing: 'list' as const };
    }

    const memberSelect = {
      counterpartyExternalId: true,
      audienceMember: {
        select: {
          name: true,
          username: true,
        },
      },
    } as const;

    let rows: Array<{
      counterpartyExternalId: string;
      audienceMember: {
        name: string | null;
        username: string | null;
      };
    }>;

    if (options.onlyFollowing) {
      rows = await this._dailyAggregate.model.channelAudienceListMember.findMany({
        where: {
          organizationId,
          integrationId,
          listId,
          audienceMember: {
            membershipState: ChannelAudienceMembership.FOLLOWER,
          },
        },
        orderBy: { counterpartyExternalId: 'asc' },
        take: limit,
        select: memberSelect,
      });
    } else {
      const externalIds = options.externalIds ?? [];
      rows = await this._dailyAggregate.model.channelAudienceListMember.findMany({
        where: {
          organizationId,
          integrationId,
          listId,
          counterpartyExternalId: { in: externalIds },
        },
        orderBy: { counterpartyExternalId: 'asc' },
        select: memberSelect,
      });
    }

    const removed = rows.map((row) => ({
      externalId: row.counterpartyExternalId,
      name: row.audienceMember.name,
      username: row.audienceMember.username,
    }));

    if (removed.length) {
      await this._dailyAggregate.model.channelAudienceListMember.deleteMany({
        where: {
          organizationId,
          integrationId,
          listId,
          counterpartyExternalId: {
            in: removed.map((member) => member.externalId),
          },
        },
      });
    }

    const remaining = options.onlyFollowing
      ? await this._dailyAggregate.model.channelAudienceListMember.count({
        where: {
          organizationId,
          integrationId,
          listId,
          audienceMember: {
            membershipState: ChannelAudienceMembership.FOLLOWER,
          },
        },
      })
      : 0;

    return {
      ok: true as const,
      removed,
      remaining,
      hasMore: remaining > 0,
    };
  }

  async addAudienceTriageIgnore(
    organizationId: string,
    integrationId: string,
    externalId: string,
    triage: string,
    createdByUserId?: string,
    reasons?: string[],
    options?: { snooze?: boolean }
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const member = await tx.channelAudienceMember.findFirst({
        where: { organizationId, integrationId, externalId },
        select: {
          externalId: true,
          name: true,
          username: true,
          bio: true,
          followersCount: true,
          followingCount: true,
          leadFitScore: true,
          leadFitReason: true,
          leadFitMatchedTopics: true,
        },
      });
      if (!member) {
        return { missing: 'member' as const };
      }
      const expiresAt = options?.snooze
        ? new Date(Date.now() + RELATIONSHIP_TRIAGE_SNOOZE_MS)
        : null;
      await tx.channelAudienceMemberTriageIgnore.upsert({
        where: {
          organizationId_integrationId_counterpartyExternalId_triage: {
            organizationId,
            integrationId,
            counterpartyExternalId: externalId,
            triage,
          },
        },
        create: {
          organizationId,
          integrationId,
          counterpartyExternalId: externalId,
          triage,
          expiresAt,
          ...(createdByUserId ? { createdByUserId } : {}),
        },
        update: {
          expiresAt,
        },
      });
      if (triage === 'lead' && !options?.snooze) {
        await this.upsertLeadFitFeedback(tx, {
          organizationId,
          integrationId,
          externalId,
          source: 'lead_dismiss',
          verdict: 'rejected',
          reasons: reasons ?? [],
          createdByUserId,
          member,
        });
      }
      return { ok: true as const };
    });
  }

  private async upsertLeadFitFeedback(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      integrationId: string;
      externalId: string;
      source: 'lead_dismiss' | 'list_add';
      verdict: 'rejected' | 'accepted';
      reasons: string[];
      listId?: string;
      createdByUserId?: string;
      member: {
        name: string | null;
        username: string | null;
        bio: string | null;
        followersCount: number | null;
        followingCount: number | null;
        leadFitScore: number | null;
        leadFitReason: string | null;
        leadFitMatchedTopics: string | null;
      };
    }
  ) {
    const snapshot = {
      name: params.member.name,
      username: params.member.username,
      bio: params.member.bio,
      followersCount: params.member.followersCount,
      followingCount: params.member.followingCount,
      leadFitScore: params.member.leadFitScore,
      leadFitReason: params.member.leadFitReason,
      leadFitMatchedTopics: params.member.leadFitMatchedTopics,
      reasons: JSON.stringify(params.reasons),
      ...(params.listId ? { listId: params.listId } : {}),
      ...(params.createdByUserId
        ? { createdByUserId: params.createdByUserId }
        : {}),
    };
    await tx.channelAudienceLeadFitFeedback.upsert({
      where: {
        organizationId_integrationId_counterpartyExternalId_source: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          counterpartyExternalId: params.externalId,
          source: params.source,
        },
      },
      create: {
        organizationId: params.organizationId,
        integrationId: params.integrationId,
        counterpartyExternalId: params.externalId,
        source: params.source,
        verdict: params.verdict,
        ...snapshot,
      },
      update: snapshot,
    });
  }

  async setAudienceMemberIgnored(
    organizationId: string,
    integrationId: string,
    externalId: string,
    ignoredByUserId?: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const member = await tx.channelAudienceMember.findFirst({
        where: { organizationId, integrationId, externalId },
        select: { externalId: true, ignoredAt: true },
      });
      if (!member) {
        return { missing: 'member' as const };
      }
      if (member.ignoredAt) {
        return { ok: true as const };
      }
      await tx.channelAudienceMember.update({
        where: {
          integrationId_externalId: { integrationId, externalId },
        },
        data: {
          ignoredAt: new Date(),
          ...(ignoredByUserId ? { ignoredByUserId } : { ignoredByUserId: null }),
        },
      });
      return { ok: true as const };
    });
  }

  async clearAudienceMemberIgnored(
    organizationId: string,
    integrationId: string,
    externalId: string
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const member = await tx.channelAudienceMember.findFirst({
        where: { organizationId, integrationId, externalId },
        select: { externalId: true },
      });
      if (!member) {
        return { missing: 'member' as const };
      }
      await tx.channelAudienceMember.update({
        where: {
          integrationId_externalId: { integrationId, externalId },
        },
        data: {
          ignoredAt: null,
          ignoredByUserId: null,
        },
      });
      return { ok: true as const };
    });
  }

  async upsertAudienceMemberGrade(
    organizationId: string,
    integrationId: string,
    externalId: string,
    userId: string,
    grade: number
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertNoteAccess(tx, organizationId, integrationId, externalId, userId);
      const saved = await tx.channelAudienceMemberGrade.upsert({
        where: {
          organizationId_integrationId_counterpartyExternalId_userId: {
            organizationId,
            integrationId,
            counterpartyExternalId: externalId,
            userId,
          },
        },
        create: {
          organizationId,
          integrationId,
          counterpartyExternalId: externalId,
          userId,
          grade,
        },
        update: { grade },
        select: { grade: true },
      });
      const member = await tx.channelAudienceMember.findFirst({
        where: { organizationId, integrationId, externalId },
        select: { relationshipGrade: true },
      });
      return {
        grade: saved.grade,
        relationshipGrade: member?.relationshipGrade ?? null,
      };
    });
  }

  async getFollowersByNoteCount(query: NoteCountFollowersQuery) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        query.organizationId,
        query.integrationId
      );

      const rows = await tx.channelAudienceMember.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          ...this.followerMembershipFilter(query.listId),
          ...this.audienceListFilters(
            this.audienceSearchFilter(query.search),
            this.triageFilter(query.triage),
            this.listMembershipFilter(query.listId),
            this.isBotFilter(query.isBot),
            this.ignoredVisibilityFilter(query.ignoredVisibility),
            this.noteCountFollowerKeyset(query.cursor, query.direction)
          ),
        },
        orderBy: [
          { noteCount: query.direction },
          { externalId: query.direction },
        ],
        take: query.limit + 1,
        select: this.audienceMemberListSelect(query.userId),
      });

      return {
        items: rows.slice(0, query.limit),
        hasMore: rows.length > query.limit,
      };
    });
  }

  async getFollowersByLikesCount(query: LikesCountFollowersQuery) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        query.organizationId,
        query.integrationId
      );

      const rows = await tx.channelAudienceMember.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          ...this.followerMembershipFilter(query.listId),
          ...this.audienceListFilters(
            this.audienceSearchFilter(query.search),
            this.triageFilter(query.triage),
            this.listMembershipFilter(query.listId),
            this.isBotFilter(query.isBot),
            this.ignoredVisibilityFilter(query.ignoredVisibility),
            this.likesCountFollowerKeyset(query.cursor, query.direction)
          ),
        },
        orderBy: [
          { likesCount: query.direction },
          { externalId: query.direction },
        ],
        take: query.limit + 1,
        select: this.audienceMemberListSelect(query.userId),
      });

      return {
        items: rows.slice(0, query.limit),
        hasMore: rows.length > query.limit,
      };
    });
  }

  async getAudienceLeads(query: AudienceLeadsQuery) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        query.organizationId,
        query.integrationId
      );

      const rows = await tx.channelAudienceMember.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          membershipState: {
            in: [
              ChannelAudienceMembership.UNKNOWN,
              ChannelAudienceMembership.NOT_FOLLOWER,
            ],
          },
          OR: [
            { inboundInteractionCount: { gt: 0 } },
            { leadBridgesAsLead: { some: {} } },
          ],
          triageIgnores: { none: this.activeTriageIgnoreWhere('lead') },
          ...this.audienceListFilters(
            this.audienceSearchFilter(query.search),
            this.ignoredVisibilityFilter(query.ignoredVisibility),
            this.leadFitVisibilityFilter(),
            this.excludeActiveListMembershipFilter(),
            this.leadBridgeKeyset(query.cursor, query.direction)
          ),
        },
        orderBy: [
          { leadFitScore: { sort: query.direction, nulls: 'last' } },
          { leadBridgeScore: { sort: query.direction, nulls: 'last' } },
          { lastInboundAt: { sort: query.direction, nulls: 'last' } },
          { externalId: query.direction },
        ],
        take: query.limit + 1,
        select: {
          ...this.audienceMemberListSelect(query.userId),
          inboundInteractionCount: true,
          lastInboundAt: true,
          leadBridgeScore: true,
          leadFitScore: true,
          leadFitReason: true,
          leadFitConcerns: true,
          leadFitMatchedTopics: true,
          leadFitScoredAt: true,
          leadBridgesAsLead: {
            orderBy: [
              { bridgeRelationshipGrade: { sort: 'desc', nulls: 'last' } },
              { lastSeenAt: 'desc' },
            ],
            take: 3,
            select: {
              bridgeExternalId: true,
              bridgeRelationshipGrade: true,
              bridgeMember: {
                select: { username: true, name: true },
              },
            },
          },
        },
      });

      return {
        items: rows.slice(0, query.limit),
        hasMore: rows.length > query.limit,
      };
    });
  }

  async getAudienceFollowers(query: AudienceFollowersQuery) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        query.organizationId,
        query.integrationId
      );

      const rows = await tx.channelAudienceMember.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          ...this.followerMembershipFilter(query.listId),
          ...this.audienceListFilters(
            this.audienceSearchFilter(query.search),
            this.triageFilter(query.triage),
            this.listMembershipFilter(query.listId),
            this.isBotFilter(query.isBot),
            this.ignoredVisibilityFilter(query.ignoredVisibility),
            this.audienceFollowerKeyset(query.cursor, query.direction)
          ),
        },
        orderBy: [
          { [query.sortField]: query.direction },
          { externalId: query.direction },
        ],
        take: query.limit + 1,
        select: this.audienceMemberListSelect(query.userId),
      });

      return {
        items: rows.slice(0, query.limit),
        hasMore: rows.length > query.limit,
      };
    });
  }

  async getRecentFollowers(query: RecentFollowersQuery) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        query.organizationId,
        query.integrationId
      );

      const rows = await tx.channelAudienceMember.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          membershipState: ChannelAudienceMembership.FOLLOWER,
          ignoredAt: null,
          followedAt: { gte: query.since },
          ...this.recentFollowerKeyset(query.cursor),
        },
        orderBy: [{ followedAt: 'desc' }, { externalId: 'desc' }],
        take: query.limit + 1,
        select: this.audienceMemberListSelect(query.userId),
      });

      return {
        items: rows.slice(0, query.limit),
        hasMore: rows.length > query.limit,
      };
    });
  }

  async getIgnoredAudienceFollowers(query: IgnoredAudienceFollowersQuery) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        query.organizationId,
        query.integrationId
      );

      const rows = await tx.channelAudienceMember.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          membershipState: ChannelAudienceMembership.FOLLOWER,
          ...this.audienceListFilters(
            this.audienceSearchFilter(query.search),
            this.ignoredVisibilityFilter('only'),
            this.ignoredAudienceKeyset(query.cursor, query.direction)
          ),
        },
        orderBy: [
          { ignoredAt: query.direction },
          { externalId: query.direction },
        ],
        take: query.limit + 1,
        select: this.audienceMemberListSelect(query.userId),
      });

      return {
        items: rows.slice(0, query.limit),
        hasMore: rows.length > query.limit,
      };
    });
  }

  async getFollowersByRelationshipGrade(query: GradeFollowersQuery) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        query.organizationId,
        query.integrationId
      );

      const rows = await tx.channelAudienceMember.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          ...this.followerMembershipFilter(query.listId),
          ...this.audienceListFilters(
            this.audienceSearchFilter(query.search),
            this.triageFilter(query.triage),
            this.listMembershipFilter(query.listId),
            this.isBotFilter(query.isBot),
            this.ignoredVisibilityFilter(query.ignoredVisibility),
            { relationshipFormulaVersion: RELATIONSHIP_FORMULA_VERSION },
            this.nullableGradeFollowerKeyset(
              query.cursor,
              query.direction,
              'relationshipGrade'
            )
          ),
        },
        orderBy: [
          { relationshipGrade: { sort: query.direction, nulls: 'last' } },
          { externalId: query.direction },
        ],
        take: query.limit + 1,
        select: this.audienceMemberListSelect(query.userId),
      });

      return {
        items: rows.slice(0, query.limit),
        hasMore: rows.length > query.limit,
      };
    });
  }

  async getFollowersByProjectedField(query: ProjectedFollowersQuery) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        query.organizationId,
        query.integrationId
      );
      const field = query.field;
      const rows = await tx.channelAudienceMember.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          ...this.followerMembershipFilter(query.listId),
          ...this.audienceListFilters(
            this.audienceSearchFilter(query.search),
            this.triageFilter(query.triage),
            this.listMembershipFilter(query.listId),
            this.isBotFilter(query.isBot),
            this.ignoredVisibilityFilter(query.ignoredVisibility),
            this.nullableProjectedFollowerKeyset(
              query.cursor,
              query.direction,
              field
            )
          ),
        },
        orderBy: [
          { [field]: { sort: query.direction, nulls: 'last' } },
          { externalId: query.direction },
        ],
        take: query.limit + 1,
        select: this.audienceMemberListSelect(query.userId),
      });
      return {
        items: rows.slice(0, query.limit),
        hasMore: rows.length > query.limit,
      };
    });
  }

  async getFollowersByMyGrade(query: GradeFollowersQuery) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        query.organizationId,
        query.integrationId
      );

      const take = query.limit + 1;
      const inUngraded = query.cursor != null && query.cursor.grade == null;
      const items: Array<{
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
        likesCount: number;
        relationshipGrade: number | null;
        relationshipEffortScore: number | null;
        relationshipReciprocationScore: number | null;
        relationshipNetGap: number | null;
        relationshipTriage: string | null;
        relationshipFormulaVersion: number | null;
        relationshipSnapshotAt: Date | null;
        personalGrades: Array<{ grade: number }>;
        listMemberships: Array<{ listId: string }>;
        ignoredAt: Date | null;
      }> = [];

      if (!inUngraded) {
        const graded = await tx.channelAudienceMemberGrade.findMany({
          where: {
            organizationId: query.organizationId,
            integrationId: query.integrationId,
            userId: query.userId,
            audienceMember: {
              is: {
                ...this.followerMembershipFilter(query.listId),
                ...this.audienceSearchFilter(query.search),
                ...this.triageFilter(query.triage),
                ...this.listMembershipFilter(query.listId),
                ...this.isBotFilter(query.isBot),
                ...this.ignoredVisibilityFilter(query.ignoredVisibility),
              },
            },
            ...this.myGradeGradedKeyset(query.cursor, query.direction),
          },
          orderBy: [
            { grade: query.direction },
            { counterpartyExternalId: query.direction },
          ],
          take,
          select: {
            grade: true,
            audienceMember: {
              select: this.audienceMemberListSelect(query.userId),
            },
          },
        });
        items.push(
          ...graded.map((row) => ({
            ...row.audienceMember,
            personalGrades: [{ grade: row.grade }],
          }))
        );
      }

      if (items.length < take) {
        const ungraded = await tx.channelAudienceMember.findMany({
          where: {
            organizationId: query.organizationId,
            integrationId: query.integrationId,
            ...this.followerMembershipFilter(query.listId),
            personalGrades: { none: { userId: query.userId } },
            ...this.audienceListFilters(
              this.audienceSearchFilter(query.search),
              this.triageFilter(query.triage),
              this.listMembershipFilter(query.listId),
              this.isBotFilter(query.isBot),
              this.ignoredVisibilityFilter(query.ignoredVisibility),
              this.myGradeUngradedKeyset(
                query.cursor,
                query.direction,
                inUngraded
              )
            ),
          },
          orderBy: [{ externalId: query.direction }],
          take: take - items.length,
          select: this.audienceMemberListSelect(query.userId),
        });
        items.push(...ungraded);
      }

      return {
        items: items.slice(0, query.limit),
        hasMore: items.length > query.limit,
      };
    });
  }

  async getFollowersByBotGrade(query: GradeFollowersQuery) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        query.organizationId,
        query.integrationId
      );

      const rows = await tx.channelAudienceMember.findMany({
        where: {
          organizationId: query.organizationId,
          integrationId: query.integrationId,
          ...this.followerMembershipFilter(query.listId),
          ...this.audienceListFilters(
            this.audienceSearchFilter(query.search),
            this.triageFilter(query.triage),
            this.listMembershipFilter(query.listId),
            this.isBotFilter(query.isBot),
            this.ignoredVisibilityFilter(query.ignoredVisibility),
            { botFormulaVersion: BOT_FORMULA_VERSION },
            this.nullableGradeFollowerKeyset(
              query.cursor,
              query.direction,
              'botGrade'
            )
          ),
        },
        orderBy: [
          { botGrade: { sort: query.direction, nulls: 'last' } },
          { externalId: query.direction },
        ],
        take: query.limit + 1,
        select: this.audienceMemberListSelect(query.userId),
      });

      return {
        items: rows.slice(0, query.limit),
        hasMore: rows.length > query.limit,
      };
    });
  }

  async getFollowerNoteCounts(
    organizationId: string,
    integrationId: string,
    externalIds: string[],
    userId?: string
  ): Promise<Map<string, FollowerAudienceCounts>> {
    const uniqueIds = [...new Set(externalIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return new Map();
    }

    const rows = await this._dailyAggregate.model.channelAudienceMember.findMany({
      where: {
        organizationId,
        integrationId,
        externalId: { in: uniqueIds },
      },
      select: this.audienceMemberListSelect(userId),
    });

    return new Map(
      rows.map((row) => [
        row.externalId,
        {
          noteCount: row.noteCount,
          likesCount: row.likesCount,
          relationshipGrade: row.relationshipGrade,
          myGrade: row.personalGrades?.[0]?.grade ?? null,
          relationshipEffortScore: row.relationshipEffortScore,
          relationshipReciprocationScore: row.relationshipReciprocationScore,
          relationshipNetGap: row.relationshipNetGap,
          relationshipTriage: row.relationshipTriage,
          relationshipFormulaVersion: row.relationshipFormulaVersion,
          relationshipSnapshotAt: row.relationshipSnapshotAt,
          botGrade: row.botGrade,
          isBot: row.isBot,
          botConfidence: row.botConfidence,
          botFormulaVersion: row.botFormulaVersion,
          botGradedAt: row.botGradedAt,
          listIds: (row.listMemberships ?? []).map((membership) => membership.listId),
          ignoredTriages: this.activeIgnoredTriages(row.triageIgnores ?? []),
          ignoredAt: row.ignoredAt ?? null,
        },
      ])
    );
  }

  private activeIgnoredTriages(
    ignores: Array<{ triage: string; expiresAt?: Date | null }>
  ) {
    const now = Date.now();
    return ignores
      .filter(
        (ignore) =>
          ignore.expiresAt == null || ignore.expiresAt.getTime() > now
      )
      .map((ignore) => ignore.triage);
  }

  private rankedFollowerKeyset(
    cursor: RankedFollowerCursor | undefined,
    direction: 'asc' | 'desc'
  ): Prisma.ChannelInteractionWindowSummaryWhereInput {
    if (!cursor) {
      return {};
    }

    const comparison = direction === 'desc' ? 'lt' : 'gt';
    const timeComparison: Prisma.ChannelInteractionWindowSummaryWhereInput =
      cursor.lastInteractionAt
        ? direction === 'desc'
          ? { lastInteractionAt: { lt: new Date(cursor.lastInteractionAt) } }
          : {
            OR: [
              { lastInteractionAt: { gt: new Date(cursor.lastInteractionAt) } },
              { lastInteractionAt: null },
            ],
          }
        : direction === 'desc'
          ? { lastInteractionAt: { not: null } }
          : { OR: [] };
    const externalIdComparison = { [comparison]: cursor.externalId };

    return {
      OR: [
        { interactionCount: { [comparison]: cursor.interactionCount } },
        {
          interactionCount: cursor.interactionCount,
          interactionScore: { [comparison]: cursor.interactionScore },
        },
        {
          interactionCount: cursor.interactionCount,
          interactionScore: cursor.interactionScore,
          ...timeComparison,
        },
        {
          interactionCount: cursor.interactionCount,
          interactionScore: cursor.interactionScore,
          lastInteractionAt: cursor.lastInteractionAt
            ? new Date(cursor.lastInteractionAt)
            : null,
          counterpartyExternalId: externalIdComparison,
        },
      ],
    };
  }

  private audienceSearchFilter(
    search?: string
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!search) {
      return {};
    }

    return {
      OR: [
        { username: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  private triageFilter(
    triage?: FollowerTriageFilter
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!triage) {
      return {};
    }
    // engaged_not_yet is a legacy alias of Hot (unreciprocated inbound).
    if (triage === 'hot_lead' || triage === 'engaged_not_yet') {
      return {
        OR: [
          { relationshipTriage: 'hot_lead' },
          {
            relationshipReciprocationScore: { gt: 0 },
            relationshipEffortScore: 0,
          },
        ],
        triageIgnores: {
          none: this.activeTriageIgnoreWhere(['hot_lead', 'engaged_not_yet']),
        },
      };
    }
    return {
      relationshipTriage: triage,
      triageIgnores: { none: this.activeTriageIgnoreWhere(triage) },
    };
  }

  private activeTriageIgnoreWhere(
    triage: string | string[]
  ): Prisma.ChannelAudienceMemberTriageIgnoreWhereInput {
    const now = new Date();
    return {
      triage: Array.isArray(triage) ? { in: triage } : triage,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
  }

  private isBotFilter(
    isBot?: boolean
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (isBot === undefined) {
      return {};
    }
    return { isBot };
  }

  private storedAudienceCategoryFilter(
    category: FollowerTriageFilter | (typeof FOLLOWER_AUDIENCES)[number]
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (category === 'lead') {
      return {
        membershipState: {
          in: [
            ChannelAudienceMembership.UNKNOWN,
            ChannelAudienceMembership.NOT_FOLLOWER,
          ],
        },
        OR: [
          { inboundInteractionCount: { gt: 0 } },
          { leadBridgesAsLead: { some: {} } },
        ],
        ignoredAt: null,
        triageIgnores: { none: this.activeTriageIgnoreWhere('lead') },
        AND: [
          this.leadFitVisibilityFilter(),
          this.excludeActiveListMembershipFilter(),
        ],
      };
    }
    if (category === 'ignored') {
      return {
        membershipState: ChannelAudienceMembership.FOLLOWER,
        ignoredAt: { not: null },
      };
    }
    if (category === 'cultivate') {
      return {
        ...this.cultivateEligibilityWhere(),
      };
    }
    if (category === 'hot') {
      return {
        ...this.hotEligibilityWhere(),
      };
    }
    return {
      membershipState: ChannelAudienceMembership.FOLLOWER,
      ignoredAt: null,
      ...this.triageFilter(category),
    };
  }

  private listMembershipFilter(
    listId?: string
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!listId) {
      return {};
    }
    return {
      listMemberships: {
        some: {
          listId,
          list: { deletedAt: null },
        },
      },
    };
  }

  /**
   * Leads assigned to any active custom list leave the Leads triage inbox.
   * Membership on soft-deleted lists does not count.
   */
  private excludeActiveListMembershipFilter(): Prisma.ChannelAudienceMemberWhereInput {
    return {
      listMemberships: {
        none: { list: { deletedAt: null } },
      },
    };
  }

  /**
   * Custom lists can include manually imported profiles that are not (yet)
   * known followers, so skip the FOLLOWER membership requirement when a list
   * filter is active.
   */
  private followerMembershipFilter(
    listId?: string
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (listId) {
      return {};
    }
    return { membershipState: ChannelAudienceMembership.FOLLOWER };
  }

  private ignoredVisibilityFilter(
    mode: AudienceIgnoredVisibility = 'exclude'
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (mode === 'all') {
      return {};
    }
    if (mode === 'only') {
      return { ignoredAt: { not: null } };
    }
    return { ignoredAt: null };
  }

  private leadFitVisibilityFilter(): Prisma.ChannelAudienceMemberWhereInput {
    return {
      OR: [
        { leadFitScore: null },
        { leadFitScore: { gte: LEAD_FIT_MIN_SCORE } },
      ],
    };
  }

  private ignoredAudienceKeyset(
    cursor: IgnoredAudienceFollowerCursor | undefined,
    direction: 'asc' | 'desc'
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!cursor) {
      return {};
    }
    const comparison = direction === 'desc' ? 'lt' : 'gt';
    const ignoredAt = new Date(cursor.ignoredAt);
    return {
      OR: [
        { ignoredAt: { [comparison]: ignoredAt } },
        {
          ignoredAt,
          externalId: { [comparison]: cursor.externalId },
        },
      ],
    };
  }

  private audienceListFilters(
    ...filters: Prisma.ChannelAudienceMemberWhereInput[]
  ): Prisma.ChannelAudienceMemberWhereInput {
    const present = filters.filter((filter) => Object.keys(filter).length > 0);
    if (!present.length) {
      return {};
    }

    return { AND: present };
  }

  private audienceFollowerKeyset(
    cursor: AudienceFollowerCursor | undefined,
    direction: 'asc' | 'desc'
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!cursor) {
      return {};
    }

    const comparison = direction === 'desc' ? 'lt' : 'gt';
    const field = cursor.sortField;
    const typedValue = this.audienceCursorFieldValue(field, cursor.sortValue);
    const fieldAdvance: Prisma.ChannelAudienceMemberWhereInput =
      typedValue !== null
        ? direction === 'desc'
          ? { [field]: { [comparison]: typedValue } }
          : {
            OR: [
              { [field]: { [comparison]: typedValue } },
              { [field]: null },
            ],
          }
        : direction === 'desc'
          ? { [field]: { not: null } }
          : {};
    const equalBranch: Prisma.ChannelAudienceMemberWhereInput = {
      [field]: typedValue,
      externalId: { [comparison]: cursor.externalId },
    };

    if (!Object.keys(fieldAdvance).length) {
      return equalBranch;
    }

    return {
      OR: [fieldAdvance, equalBranch],
    };
  }

  private recentFollowerKeyset(
    cursor: RecentFollowerCursor | undefined
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!cursor) {
      return {};
    }
    const followedAt = new Date(cursor.followedAt);
    return {
      OR: [
        { followedAt: { lt: followedAt } },
        {
          followedAt,
          externalId: { lt: cursor.externalId },
        },
      ],
    };
  }

  private audienceCursorFieldValue(
    field: AudienceFollowerSortField,
    value: string | number | null
  ) {
    if (value === null) {
      return null;
    }
    if (field === 'followedAt' || field === 'accountCreatedAt') {
      return new Date(String(value));
    }
    return value;
  }

  private audienceMemberListSelect(userId?: string) {
    return {
      externalId: true,
      name: true,
      username: true,
      picture: true,
      profileUrl: true,
      bio: true,
      followersCount: true,
      followingCount: true,
      followedAt: true,
      accountCreatedAt: true,
      noteCount: true,
      likesCount: true,
      inboundInteractionCount: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      relationshipGrade: true,
      relationshipEffortScore: true,
      relationshipReciprocationScore: true,
      relationshipNetGap: true,
      relationshipTriage: true,
      relationshipFormulaVersion: true,
      relationshipSnapshotAt: true,
      botGrade: true,
      isBot: true,
      botConfidence: true,
      botFormulaVersion: true,
      botGradedAt: true,
      ignoredAt: true,
      ...(userId
        ? {
          personalGrades: {
            where: { userId },
            select: { grade: true },
            take: 1,
          },
        }
        : {}),
      listMemberships: {
        where: { list: { deletedAt: null } },
        select: { listId: true },
      },
      triageIgnores: {
        select: { triage: true, expiresAt: true },
      },
    } as const;
  }

  private noteCountFollowerKeyset(
    cursor: NoteCountFollowerCursor | undefined,
    direction: 'asc' | 'desc'
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!cursor) {
      return {};
    }

    const comparison = direction === 'desc' ? 'lt' : 'gt';
    return {
      OR: [
        { noteCount: { [comparison]: cursor.noteCount } },
        {
          noteCount: cursor.noteCount,
          externalId: { [comparison]: cursor.externalId },
        },
      ],
    };
  }

  private likesCountFollowerKeyset(
    cursor: LikesCountFollowerCursor | undefined,
    direction: 'asc' | 'desc'
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!cursor) {
      return {};
    }

    const comparison = direction === 'desc' ? 'lt' : 'gt';
    return {
      OR: [
        { likesCount: { [comparison]: cursor.likesCount } },
        {
          likesCount: cursor.likesCount,
          externalId: { [comparison]: cursor.externalId },
        },
      ],
    };
  }

  private leadInboundKeyset(
    cursor: AudienceLeadCursor | undefined,
    direction: 'asc' | 'desc'
  ): Prisma.ChannelAudienceMemberWhereInput {
    return this.leadBridgeKeyset(cursor, direction);
  }

  private leadBridgeKeyset(
    cursor: AudienceLeadCursor | undefined,
    direction: 'asc' | 'desc'
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!cursor) {
      return {};
    }

    const comparison = direction === 'desc' ? 'lt' : 'gt';
    const fitScore = cursor.leadFitScore;
    const score = cursor.leadBridgeScore;
    const lastInboundAt =
      cursor.lastInboundAt == null ? null : new Date(cursor.lastInboundAt);

    const inboundTieBreak: Prisma.ChannelAudienceMemberWhereInput =
      lastInboundAt == null
        ? {
          lastInboundAt: null,
          externalId: { [comparison]: cursor.externalId },
        }
        : {
          OR: [
            { lastInboundAt: { [comparison]: lastInboundAt } },
            {
              lastInboundAt,
              externalId: { [comparison]: cursor.externalId },
            },
            ...(direction === 'desc' ? [{ lastInboundAt: null }] : []),
          ],
        };

    const bridgeTieBreak: Prisma.ChannelAudienceMemberWhereInput =
      score == null
        ? {
          AND: [{ leadBridgeScore: null }, inboundTieBreak],
        }
        : {
          OR: [
            { leadBridgeScore: { [comparison]: score } },
            {
              AND: [{ leadBridgeScore: score }, inboundTieBreak],
            },
            ...(direction === 'desc' ? [{ leadBridgeScore: null }] : []),
          ],
        };

    if (fitScore == null) {
      return {
        AND: [{ leadFitScore: null }, bridgeTieBreak],
      };
    }

    return {
      OR: [
        { leadFitScore: { [comparison]: fitScore } },
        {
          AND: [{ leadFitScore: fitScore }, bridgeTieBreak],
        },
        ...(direction === 'desc' ? [{ leadFitScore: null }] : []),
      ],
    };
  }

  async updateAudienceLeadFit(params: {
    organizationId: string;
    integrationId: string;
    externalId: string;
    leadFitScore: number;
    leadFitReason: string;
    leadFitConcerns: string[];
    leadFitMatchedTopics: string[];
    leadFitModel: string;
    leadFitVersion: number;
    leadFitScoredAt?: Date;
  }) {
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      const result = await tx.channelAudienceMember.updateMany({
        where: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          externalId: params.externalId,
        },
        data: {
          leadFitScore: params.leadFitScore,
          leadFitReason: params.leadFitReason,
          leadFitConcerns: JSON.stringify(params.leadFitConcerns),
          leadFitMatchedTopics: JSON.stringify(params.leadFitMatchedTopics),
          leadFitModel: params.leadFitModel,
          leadFitVersion: params.leadFitVersion,
          leadFitScoredAt: params.leadFitScoredAt ?? new Date(),
        },
      });
      return { updated: result.count };
    });
  }

  async listUnscoredLeadExternalIds(params: {
    organizationId: string;
    integrationId: string;
    externalIds: string[];
  }): Promise<
    Array<{
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
  > {
    if (!params.externalIds.length) {
      return [];
    }
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      return tx.channelAudienceMember.findMany({
        where: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          externalId: { in: params.externalIds },
          ...this.leadFitNeedsScoreWhere(),
        },
        select: this.leadFitCandidateSelect,
      });
    });
  }

  async listUnscoredLeadCandidatesForIntegration(params: {
    organizationId: string;
    integrationId: string;
    limit: number;
  }): Promise<
    Array<{
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
  > {
    const take = Math.max(0, params.limit);
    if (!take) {
      return [];
    }
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      return tx.channelAudienceMember.findMany({
        where: {
          organizationId: params.organizationId,
          integrationId: params.integrationId,
          membershipState: {
            in: [
              ChannelAudienceMembership.UNKNOWN,
              ChannelAudienceMembership.NOT_FOLLOWER,
            ],
          },
          AND: [
            {
              OR: [
                { inboundInteractionCount: { gt: 0 } },
                { leadBridgesAsLead: { some: {} } },
              ],
            },
            this.leadFitNeedsScoreWhere(),
          ],
          triageIgnores: { none: this.activeTriageIgnoreWhere('lead') },
        },
        orderBy: [
          { lastInboundAt: { sort: 'desc', nulls: 'last' } },
          { externalId: 'desc' },
        ],
        take,
        select: this.leadFitCandidateSelect,
      });
    });
  }

  async listLeadFitFeedbackExamples(params: {
    organizationId: string;
    integrationId: string;
    limit?: number;
  }): Promise<{
    rejected: Array<{
      counterpartyExternalId: string;
      name: string | null;
      username: string | null;
      bio: string | null;
      reasons: string[];
    }>;
    accepted: Array<{
      counterpartyExternalId: string;
      name: string | null;
      username: string | null;
      bio: string | null;
      reasons: string[];
    }>;
  }> {
    const take = Math.max(
      0,
      params.limit ?? LEAD_FIT_FEEDBACK_EXAMPLE_LIMIT
    );
    if (!take) {
      return { rejected: [], accepted: [] };
    }
    return this.withSerializableRetry(async (tx) => {
      await this.assertOwnedIntegration(
        tx,
        params.organizationId,
        params.integrationId
      );
      const [rejectedRows, acceptedRows] = await Promise.all([
        tx.channelAudienceLeadFitFeedback.findMany({
          where: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            verdict: 'rejected',
          },
          orderBy: { updatedAt: 'desc' },
          take,
          select: {
            counterpartyExternalId: true,
            name: true,
            username: true,
            bio: true,
            reasons: true,
          },
        }),
        tx.channelAudienceLeadFitFeedback.findMany({
          where: {
            organizationId: params.organizationId,
            integrationId: params.integrationId,
            verdict: 'accepted',
          },
          orderBy: { updatedAt: 'desc' },
          take: take * 2,
          select: {
            counterpartyExternalId: true,
            name: true,
            username: true,
            bio: true,
            reasons: true,
          },
        }),
      ]);
      const rejectedIds = new Set(
        rejectedRows.map((row) => row.counterpartyExternalId)
      );
      const mapRow = (row: {
        counterpartyExternalId: string;
        name: string | null;
        username: string | null;
        bio: string | null;
        reasons: string | null;
      }) => ({
        counterpartyExternalId: row.counterpartyExternalId,
        name: row.name,
        username: row.username,
        bio: row.bio,
        reasons: this.parseJsonStringArray(row.reasons),
      });
      return {
        rejected: rejectedRows.map(mapRow),
        accepted: acceptedRows
          .filter((row) => !rejectedIds.has(row.counterpartyExternalId))
          .slice(0, take)
          .map(mapRow),
      };
    });
  }

  private leadFitNeedsScoreWhere(): Prisma.ChannelAudienceMemberWhereInput {
    return {
      OR: [
        { leadFitScoredAt: null },
        { leadFitVersion: null },
        { leadFitVersion: { lt: LEAD_FIT_VERSION } },
      ],
    };
  }

  private parseJsonStringArray(value: string | null): string[] {
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      return [];
    }
  }

  private get leadFitCandidateSelect() {
    return {
      externalId: true,
      name: true,
      username: true,
      bio: true,
      followersCount: true,
      followingCount: true,
      leadBridgesAsLead: {
        orderBy: [
          { bridgeRelationshipGrade: { sort: 'desc', nulls: 'last' } },
          { lastSeenAt: 'desc' },
        ],
        take: 3,
        select: {
          bridgeRelationshipGrade: true,
          bridgeMember: {
            select: { username: true },
          },
        },
      },
    } satisfies Prisma.ChannelAudienceMemberSelect;
  }

  private nullableGradeFollowerKeyset(
    cursor: GradeFollowerCursor | undefined,
    direction: 'asc' | 'desc',
    field: 'relationshipGrade' | 'botGrade'
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!cursor) {
      return {};
    }

    const comparison = direction === 'desc' ? 'lt' : 'gt';
    if (cursor.grade == null) {
      return {
        [field]: null,
        externalId: { [comparison]: cursor.externalId },
      };
    }

    return {
      OR: [
        { [field]: { [comparison]: cursor.grade } },
        {
          [field]: cursor.grade,
          externalId: { [comparison]: cursor.externalId },
        },
        { [field]: null },
      ],
    };
  }

  private nullableProjectedFollowerKeyset(
    cursor: ProjectedFollowerCursor | undefined,
    direction: 'asc' | 'desc',
    field: ProjectedFollowersQuery['field']
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!cursor) {
      return {};
    }
    const comparison = direction === 'desc' ? 'lt' : 'gt';
    if (cursor.value == null) {
      return {
        [field]: null,
        externalId: { [comparison]: cursor.externalId },
      };
    }
    return {
      OR: [
        { [field]: { [comparison]: cursor.value } },
        {
          [field]: cursor.value,
          externalId: { [comparison]: cursor.externalId },
        },
        { [field]: null },
      ],
    };
  }

  private myGradeGradedKeyset(
    cursor: GradeFollowerCursor | undefined,
    direction: 'asc' | 'desc'
  ): Prisma.ChannelAudienceMemberGradeWhereInput {
    if (!cursor || cursor.grade == null) {
      return {};
    }

    const comparison = direction === 'desc' ? 'lt' : 'gt';
    return {
      OR: [
        { grade: { [comparison]: cursor.grade } },
        {
          grade: cursor.grade,
          counterpartyExternalId: { [comparison]: cursor.externalId },
        },
      ],
    };
  }

  private myGradeUngradedKeyset(
    cursor: GradeFollowerCursor | undefined,
    direction: 'asc' | 'desc',
    inUngraded: boolean
  ): Prisma.ChannelAudienceMemberWhereInput {
    if (!inUngraded || !cursor) {
      return {};
    }

    const comparison = direction === 'desc' ? 'lt' : 'gt';
    return { externalId: { [comparison]: cursor.externalId } };
  }

  private failureReason(
    category: NonNullable<
      ChannelInteractionSubscriptionReconciliationResult['subscriptions'][number]['failureCategory']
    >
  ) {
    return {
      configuration: 'Tracking configuration is incomplete.',
      authentication: 'Tracking authentication needs attention.',
      authorization: 'Tracking permissions do not allow this subscription.',
      entitlement: 'This provider plan does not include this tracking feature.',
      quota: 'The provider tracking quota has been reached.',
      transient: 'The provider is temporarily unavailable.',
      unknown: 'Tracking setup could not be completed.',
    }[category];
  }

  private async assertOwnedIntegration(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string
  ) {
    const integration = await tx.integration.findFirst({
      where: { id: integrationId, organizationId },
      select: { id: true },
    });
    if (!integration) {
      throw new Error('Channel integration does not belong to organization');
    }
  }

  /**
   * The channel selects the strategy; the registry owns its current version, so
   * a shipped profile version bump makes every projection stale on its own.
   */
  private async getRelationshipGradeStrategy(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string
  ): Promise<RelationshipGradeStrategySelection> {
    const integration = await tx.integration.findFirst({
      where: { id: integrationId, organizationId },
      select: { strategyId: true },
    });
    if (!integration) {
      throw new Error('Channel integration does not belong to organization');
    }
    const strategy = resolveChannelStrategy(integration.strategyId);
    return { strategyId: strategy.id, strategyVersion: strategy.version };
  }

  private relationshipStrategyBranches() {
    return listChannelStrategies().map((strategy) => ({
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      selection: this.storedStrategyIdSelection(strategy.id),
    }));
  }

  /**
   * Unknown or legacy stored identifiers resolve to the fallback strategy, so
   * the fallback branch has to match everything outside the registry too.
   */
  private storedStrategyIdSelection(strategyId: ChannelStrategyId) {
    return strategyId === FALLBACK_CHANNEL_STRATEGY_ID
      ? {
        notIn: CHANNEL_STRATEGY_IDS.filter(
          (id) => id !== FALLBACK_CHANNEL_STRATEGY_ID
        ) as string[],
      }
      : { equals: strategyId as string };
  }

  private relationshipDueCutoff(
    snapshotAt: Date,
    cadence?: RelationshipGradeScheduleConfig
  ) {
    return relationshipGradeDueCutoff(snapshotAt, cadence);
  }

  private async aggregateRelationshipInteractionCounts(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string,
    externalIds: string[],
    snapshotAt: Date
  ): Promise<RelationshipGradeBatchMember[]> {
    if (!externalIds.length) {
      return [];
    }
    const aggregates = await tx.channelInteractionEvent.groupBy({
      by: ['counterpartyExternalId', 'kind', 'direction'],
      where: {
        organizationId,
        integrationId,
        counterpartyExternalId: { in: externalIds },
        eventAt: {
          gte: new Date(snapshotAt.getTime() - RELATIONSHIP_WINDOW_MS),
          lte: snapshotAt,
        },
      },
      _count: { _all: true },
    });
    const counts = new Map<string, RelationshipGradeBatchMember>();
    for (const externalId of externalIds) {
      counts.set(externalId, {
        externalId,
        interactionCounts: createRelationshipInteractionCounts(),
      });
    }
    for (const aggregate of aggregates) {
      const member = counts.get(aggregate.counterpartyExternalId);
      const kind = aggregate.kind.toLowerCase() as ChannelInteractionScoreKind;
      const direction =
        aggregate.direction.toLowerCase() as ChannelInteractionScoreDirection;
      if (!member?.interactionCounts[kind]) continue;
      member.interactionCounts[kind][direction] += aggregate._count._all;
    }
    return externalIds.map((externalId) => counts.get(externalId)!);
  }

  private writeCurrentRelationshipProjections(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    snapshots: RelationshipGradeSnapshotInput[],
    options?: { force?: boolean }
  ) {
    return Promise.all(
      snapshots.map((snapshot) =>
        tx.channelAudienceMember.updateMany({
          where: {
            organizationId,
            integrationId,
            externalId: snapshot.externalId,
            // A batch scored under the previous selection must not mark
            // projections current after the channel switched strategy.
            integration: {
              is: {
                strategyId: this.storedStrategyIdSelection(snapshot.strategyId),
              },
            },
            ...(options?.force
              ? {}
              : {
                OR: [
                  { relationshipSnapshotAt: null },
                  { relationshipSnapshotAt: { lte: snapshotAt } },
                ],
              }),
          },
          data: {
            relationshipGrade: snapshot.grade,
            relationshipEffortScore: snapshot.effortScore,
            relationshipReciprocationScore: snapshot.reciprocationScore,
            relationshipNetGap:
              snapshot.reciprocationScore - snapshot.effortScore,
            relationshipTriage: snapshot.triage,
            relationshipFormulaVersion: snapshot.formulaVersion,
            relationshipStrategyId: snapshot.strategyId,
            relationshipStrategyVersion: snapshot.strategyVersion,
            relationshipSnapshotAt: snapshotAt,
          },
        })
      )
    );
  }

  private async upsertHotLeadSnooze(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string,
    externalId: string,
    eventAt: Date
  ) {
    const expiresAt = new Date(eventAt.getTime() + RELATIONSHIP_HOT_SNOOZE_MS);
    await tx.channelAudienceMemberTriageIgnore.upsert({
      where: {
        organizationId_integrationId_counterpartyExternalId_triage: {
          organizationId,
          integrationId,
          counterpartyExternalId: externalId,
          triage: 'hot_lead',
        },
      },
      create: {
        organizationId,
        integrationId,
        counterpartyExternalId: externalId,
        triage: 'hot_lead',
        expiresAt,
      },
      update: {
        expiresAt,
      },
    });
  }

  private async assertNoteAccess(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string,
    externalId: string,
    authorUserId: string
  ) {
    await this.assertOwnedIntegration(tx, organizationId, integrationId);
    const [member, author] = await Promise.all([
      tx.channelAudienceMember.findFirst({
        where: { organizationId, integrationId, externalId },
        select: { id: true },
      }),
      tx.userOrganization.findFirst({
        where: { organizationId, userId: authorUserId, disabled: false },
        select: { id: true },
      }),
    ]);
    if (!member || !author) {
      throw new Error('Channel audience member does not belong to organization');
    }
  }

  private async getInteractionTrackingInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string
  ) {
    const [followerSync, subscriptions] = await Promise.all([
      tx.channelFollowerSyncState.findFirst({
        where: { organizationId, integrationId },
        select: { activeGeneration: true, status: true, completedAt: true },
      }),
      tx.channelInteractionSubscription.findMany({
        where: { organizationId, integrationId },
        select: {
          state: true,
          trackingStartedAt: true,
          failureCategory: true,
          failureReason: true,
        },
      }),
    ]);
    return { followerSync, subscriptions };
  }

  private async upsertAudienceMember(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string,
    profile: AudienceProfile,
    membership?: ChannelAudienceMembership,
    followerSyncGeneration?: string
  ) {
    const membershipEvidenceGeneration =
      membership && !followerSyncGeneration
        ? (
          await tx.channelFollowerSyncState.findFirst({
            where: {
              organizationId,
              integrationId,
              pendingGeneration: { not: null },
              status: ChannelFollowerSyncStatus.IN_PROGRESS,
            },
            select: { pendingGeneration: true },
          })
        )?.pendingGeneration || null
        : undefined;
    const profileData = {
      ...(profile.name !== undefined ? { name: profile.name } : {}),
      ...(profile.username !== undefined ? { username: profile.username } : {}),
      ...(profile.picture !== undefined ? { picture: profile.picture } : {}),
      ...(profile.profileUrl !== undefined ? { profileUrl: profile.profileUrl } : {}),
      ...(profile.bio !== undefined ? { bio: profile.bio } : {}),
      ...(profile.followersCount !== undefined
        ? { followersCount: profile.followersCount }
        : {}),
      ...(profile.followingCount !== undefined
        ? { followingCount: profile.followingCount }
        : {}),
      // Sync pages must not overwrite webhook-precise followedAt on refresh.
      ...(!followerSyncGeneration && profile.followedAt !== undefined
        ? { followedAt: profile.followedAt }
        : {}),
      ...(profile.accountCreatedAt !== undefined
        ? { accountCreatedAt: profile.accountCreatedAt }
        : {}),
      ...(profile.botGrade !== undefined ? { botGrade: profile.botGrade } : {}),
      ...(profile.isBot !== undefined ? { isBot: profile.isBot } : {}),
      ...(profile.botConfidence !== undefined
        ? { botConfidence: profile.botConfidence }
        : {}),
      ...(profile.botFormulaVersion !== undefined
        ? { botFormulaVersion: profile.botFormulaVersion }
        : {}),
      ...(profile.botGradedAt !== undefined
        ? { botGradedAt: profile.botGradedAt }
        : {}),
    };
    // Sync pages rarely include a provider follow date. Stamp followedAt only
    // on create so hourly refreshes do not overwrite webhook-precise times.
    const syncCreateFollowedAt = followerSyncGeneration
      ? {
        followedAt:
          profile.followedAt !== undefined
            ? profile.followedAt
            : new Date(),
      }
      : {};
    return tx.channelAudienceMember.upsert({
      where: {
        integrationId_externalId: {
          integrationId,
          externalId: profile.externalId,
        },
      },
      create: {
        organizationId,
        integrationId,
        externalId: profile.externalId,
        ...profileData,
        ...syncCreateFollowedAt,
        ...(membership && !followerSyncGeneration
          ? {
            membershipState: membership,
            membershipEvidenceGeneration,
          }
          : {}),
        ...(followerSyncGeneration ? { followerSyncGeneration } : {}),
      },
      update: {
        ...profileData,
        ...(membership && !followerSyncGeneration
          ? {
            membershipState: membership,
            membershipEvidenceGeneration,
          }
          : {}),
        ...(followerSyncGeneration ? { followerSyncGeneration } : {}),
      },
    });
  }

  private async withSerializableRetry<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await (this._transaction.model as any).$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: any) {
        lastError = error;
        if (error?.code !== 'P2034' || attempt === TRANSACTION_ATTEMPTS - 1) {
          throw error;
        }
      }
    }
    throw lastError;
  }
}

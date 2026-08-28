import { assertRelationshipScoringProfile } from './channel-strategy.scoring';
import {
  CHANNEL_INTERACTION_SCORE_KINDS,
  CHANNEL_STRATEGY_IDS,
  ChannelConversionProfile,
  ChannelInteractionScoreKind,
  ChannelStrategy,
  ChannelStrategyId,
  FollowerMembershipState,
  ResolvedMaterializationConfig,
  StrategyMaterializationProfile,
} from './channel-strategy.types';
import { brandAwarenessStrategy } from './strategies/brand-awareness.strategy';
import { communityRetentionStrategy } from './strategies/community-retention.strategy';
import { customerSupportStrategy } from './strategies/customer-support.strategy';
import { growAudienceStrategy } from './strategies/grow-audience.strategy';
import { leadCaptureStrategy } from './strategies/lead-capture.strategy';

const MATERIALIZATION_LIMITS = {
  maxPoolSize: 500,
  maxPickLimit: 100,
  maxFitBackfillLimit: 100,
  maxFeedbackExampleLimit: 20,
  maxStaleDays: 90,
  maxLookbackHours: 168,
  minNearFullRatio: 0.5,
  maxNearFullRatio: 1,
  maxWarmGradeThreshold: 5,
  maxFitMinScore: 100,
} as const;

const CONVERSION_LIMITS = {
  maxProfileVersion: 1000,
  maxAttributionWindowDays: 365,
  maxWindowDays: 90,
  maxCooldownDays: 90,
  maxMinimumActiveUtcDays: 30,
  maxThreshold: 10000,
  maxWeight: 1000,
  maxSlaHours: 168,
  maxInferredResolutionDelayHours: 720,
  maxConversionTypeLength: 64,
  maxClickIdParameterLength: 32,
} as const;

function isChannelInteractionScoreKind(
  value: unknown
): value is ChannelInteractionScoreKind {
  return (
    typeof value === 'string' &&
    CHANNEL_INTERACTION_SCORE_KINDS.includes(
      value as ChannelInteractionScoreKind
    )
  );
}

function isFollowerMembershipState(
  value: unknown
): value is FollowerMembershipState {
  return (
    value === 'NOT_FOLLOWER' || value === 'FOLLOWER' || value === 'UNKNOWN'
  );
}

function assertNonEmptyConversionType(value: string, label: string) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > CONVERSION_LIMITS.maxConversionTypeLength
  ) {
    throw new RangeError(`Invalid ${label}`);
  }
}

function assertPositiveFiniteWeight(value: number, label: string) {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    value > CONVERSION_LIMITS.maxWeight
  ) {
    throw new RangeError(`Invalid ${label}`);
  }
}

function assertInteractionKindList(kinds: readonly unknown[], label: string) {
  if (!kinds.length) {
    throw new RangeError(`Invalid ${label}: must be non-empty`);
  }
  const seen = new Set<string>();
  for (const kind of kinds) {
    if (!isChannelInteractionScoreKind(kind)) {
      throw new RangeError(`Invalid ${label}: unsupported interaction kind`);
    }
    if (seen.has(kind)) {
      throw new RangeError(`Invalid ${label}: duplicate interaction kind`);
    }
    seen.add(kind);
  }
}

function assertPositiveBoundedInteger(
  value: number,
  max: number,
  label: string
) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new RangeError(`Invalid ${label}: ${value}`);
  }
}

export function assertMaterializationProfile(
  profile: StrategyMaterializationProfile
) {
  if (!Number.isSafeInteger(profile.version) || profile.version < 1) {
    throw new RangeError('Invalid materialization profile version');
  }

  assertPositiveBoundedInteger(
    profile.hot.candidatePoolSize,
    MATERIALIZATION_LIMITS.maxPoolSize,
    'hot candidate pool size'
  );
  assertPositiveBoundedInteger(
    profile.hot.pickLimit,
    MATERIALIZATION_LIMITS.maxPickLimit,
    'hot pick limit'
  );
  if (
    !Number.isFinite(profile.hot.nearFullRatio) ||
    profile.hot.nearFullRatio < MATERIALIZATION_LIMITS.minNearFullRatio ||
    profile.hot.nearFullRatio > MATERIALIZATION_LIMITS.maxNearFullRatio
  ) {
    throw new RangeError('Invalid hot near-full ratio');
  }
  assertPositiveBoundedInteger(
    profile.hot.recentEventLookbackHours,
    MATERIALIZATION_LIMITS.maxLookbackHours,
    'hot recent-event lookback hours'
  );

  assertPositiveBoundedInteger(
    profile.lead.fitBackfillLimit,
    MATERIALIZATION_LIMITS.maxFitBackfillLimit,
    'lead fit backfill limit'
  );
  assertPositiveBoundedInteger(
    profile.lead.fitMinScore,
    MATERIALIZATION_LIMITS.maxFitMinScore,
    'lead fit minimum score'
  );
  assertPositiveBoundedInteger(
    profile.lead.feedbackExampleLimit,
    MATERIALIZATION_LIMITS.maxFeedbackExampleLimit,
    'lead feedback example limit'
  );

  assertPositiveBoundedInteger(
    profile.cultivate.candidatePoolSize,
    MATERIALIZATION_LIMITS.maxPoolSize,
    'cultivate candidate pool size'
  );
  assertPositiveBoundedInteger(
    profile.cultivate.pickLimit,
    MATERIALIZATION_LIMITS.maxPickLimit,
    'cultivate pick limit'
  );
  if (
    !Number.isFinite(profile.cultivate.nearFullRatio) ||
    profile.cultivate.nearFullRatio < MATERIALIZATION_LIMITS.minNearFullRatio ||
    profile.cultivate.nearFullRatio > MATERIALIZATION_LIMITS.maxNearFullRatio
  ) {
    throw new RangeError('Invalid cultivate near-full ratio');
  }
  if (
    !Number.isFinite(profile.cultivate.warmGradeThreshold) ||
    profile.cultivate.warmGradeThreshold <= 0 ||
    profile.cultivate.warmGradeThreshold >
      MATERIALIZATION_LIMITS.maxWarmGradeThreshold
  ) {
    throw new RangeError('Invalid cultivate warm grade threshold');
  }
  assertPositiveBoundedInteger(
    profile.cultivate.staleDays,
    MATERIALIZATION_LIMITS.maxStaleDays,
    'cultivate stale days'
  );
  assertPositiveBoundedInteger(
    profile.cultivate.fallbackPickLimit,
    MATERIALIZATION_LIMITS.maxPickLimit,
    'cultivate fallback pick limit'
  );
}

export function assertConversionProfile(profile: ChannelConversionProfile) {
  if (
    !Number.isSafeInteger(profile.profileVersion) ||
    profile.profileVersion < 1 ||
    profile.profileVersion > CONVERSION_LIMITS.maxProfileVersion
  ) {
    throw new RangeError('Invalid conversion profile version');
  }

  switch (profile.kind) {
    case 'follower_transition': {
      assertNonEmptyConversionType(
        profile.conversionType,
        'follower conversion type'
      );
      if (
        !isFollowerMembershipState(profile.fromState) ||
        !isFollowerMembershipState(profile.toState)
      ) {
        throw new RangeError('Invalid follower transition state');
      }
      if (profile.fromState === profile.toState) {
        throw new RangeError(
          'Invalid follower transition: fromState equals toState'
        );
      }
      break;
    }
    case 'website_goal': {
      assertNonEmptyConversionType(
        profile.conversionType,
        'website goal conversion type'
      );
      assertPositiveBoundedInteger(
        profile.attributionWindowDays,
        CONVERSION_LIMITS.maxAttributionWindowDays,
        'website goal attribution window days'
      );
      if (
        typeof profile.clickIdParameter !== 'string' ||
        !profile.clickIdParameter.trim() ||
        profile.clickIdParameter.length >
          CONVERSION_LIMITS.maxClickIdParameterLength
      ) {
        throw new RangeError('Invalid website goal click id parameter');
      }
      break;
    }
    case 'amplification': {
      assertNonEmptyConversionType(
        profile.conversionType,
        'amplification conversion type'
      );
      assertPositiveBoundedInteger(
        profile.windowDays,
        CONVERSION_LIMITS.maxWindowDays,
        'amplification window days'
      );
      assertPositiveBoundedInteger(
        profile.minimumActiveUtcDays,
        CONVERSION_LIMITS.maxMinimumActiveUtcDays,
        'amplification minimum active UTC days'
      );
      assertPositiveBoundedInteger(
        profile.cooldownDays,
        CONVERSION_LIMITS.maxCooldownDays,
        'amplification cooldown days'
      );
      if (
        !Number.isFinite(profile.threshold) ||
        profile.threshold <= 0 ||
        profile.threshold > CONVERSION_LIMITS.maxThreshold
      ) {
        throw new RangeError('Invalid amplification threshold');
      }
      assertInteractionKindList(
        profile.acceptedInboundKinds,
        'amplification accepted inbound kinds'
      );
      for (const kind of profile.acceptedInboundKinds) {
        const weight = profile.inboundKindWeights[kind];
        if (weight === undefined) {
          throw new RangeError(
            'Invalid amplification inbound kind weights: missing accepted kind'
          );
        }
        assertPositiveFiniteWeight(
          weight,
          `amplification inbound kind weight for ${kind}`
        );
      }
      for (const [kind, weight] of Object.entries(profile.inboundKindWeights)) {
        if (!isChannelInteractionScoreKind(kind)) {
          throw new RangeError('Invalid amplification inbound kind weights');
        }
        if (!profile.acceptedInboundKinds.includes(kind)) {
          throw new RangeError(
            'Invalid amplification inbound kind weights: unexpected kind'
          );
        }
        if (weight === undefined) {
          continue;
        }
        assertPositiveFiniteWeight(
          weight,
          `amplification inbound kind weight for ${kind}`
        );
      }
      if (profile.minimumActiveUtcDays > profile.windowDays) {
        throw new RangeError(
          'Invalid amplification minimum active UTC days: exceeds window'
        );
      }
      break;
    }
    case 'customer_support': {
      assertNonEmptyConversionType(
        profile.slaConversionType,
        'customer support SLA conversion type'
      );
      assertNonEmptyConversionType(
        profile.resolutionConversionType,
        'customer support resolution conversion type'
      );
      assertPositiveBoundedInteger(
        profile.firstResponseSlaHours,
        CONVERSION_LIMITS.maxSlaHours,
        'customer support first-response SLA hours'
      );
      assertInteractionKindList(
        profile.inboundKinds,
        'customer support inbound kinds'
      );
      assertInteractionKindList(
        profile.outboundKinds,
        'customer support outbound kinds'
      );
      if (profile.conversationKeyPolicy !== 'conversation_or_actor') {
        throw new RangeError(
          'Invalid customer support conversation key policy'
        );
      }
      if (typeof profile.explicitResolutionEnabled !== 'boolean') {
        throw new RangeError(
          'Invalid customer support explicit resolution flag'
        );
      }
      if (typeof profile.inferredResolutionEnabled !== 'boolean') {
        throw new RangeError(
          'Invalid customer support inferred resolution flag'
        );
      }
      if (profile.inferredResolutionEnabled) {
        if (profile.inferredResolutionDelayHours === null) {
          throw new RangeError(
            'Invalid customer support inferred resolution delay: required when inference enabled'
          );
        }
        assertPositiveBoundedInteger(
          profile.inferredResolutionDelayHours,
          CONVERSION_LIMITS.maxInferredResolutionDelayHours,
          'customer support inferred resolution delay hours'
        );
      } else if (
        profile.inferredResolutionDelayHours !== null &&
        profile.inferredResolutionDelayHours !== undefined
      ) {
        throw new RangeError(
          'Invalid customer support inferred resolution delay: must be null when inference disabled'
        );
      }
      break;
    }
    default: {
      const exhaustive: never = profile;
      throw new RangeError(
        `Unsupported conversion profile kind: ${exhaustive}`
      );
    }
  }
}

function assertValidStrategy(strategy: ChannelStrategy) {
  if (!CHANNEL_STRATEGY_IDS.includes(strategy.id)) {
    throw new Error(`Unsupported channel strategy: ${strategy.id}`);
  }
  if (!Number.isSafeInteger(strategy.version) || strategy.version < 1) {
    throw new Error(`Invalid channel strategy version: ${strategy.id}`);
  }
  if (
    !strategy.agent.directives.length ||
    strategy.agent.directives.some((directive) => !directive.trim()) ||
    !strategy.ui.defaultFilter ||
    !strategy.ui.defaultSort ||
    !strategy.ui.filterPriority.length ||
    !strategy.ui.compactMetrics.length
  ) {
    throw new Error(`Invalid channel strategy metadata: ${strategy.id}`);
  }
  assertRelationshipScoringProfile(strategy.getScoringProfile());
  assertMaterializationProfile(strategy.getMaterializationProfile());
  assertConversionProfile(strategy.getConversionProfile());
}

function createRegistry(strategies: readonly ChannelStrategy[]) {
  const registry = {} as Record<ChannelStrategyId, ChannelStrategy>;
  for (const strategy of strategies) {
    assertValidStrategy(strategy);
    if (registry[strategy.id]) {
      throw new Error(`Duplicate channel strategy: ${strategy.id}`);
    }
    registry[strategy.id] = strategy;
  }
  if (
    strategies.length !== CHANNEL_STRATEGY_IDS.length ||
    !CHANNEL_STRATEGY_IDS.every((id) => registry[id])
  ) {
    throw new Error('Channel strategy registry is incomplete');
  }
  return Object.freeze(registry);
}

export const channelStrategyRegistry = createRegistry([
  growAudienceStrategy,
  leadCaptureStrategy,
  communityRetentionStrategy,
  brandAwarenessStrategy,
  customerSupportStrategy,
]);

export const FALLBACK_CHANNEL_STRATEGY_ID: ChannelStrategyId =
  growAudienceStrategy.id;

export function listChannelStrategies(): ChannelStrategy[] {
  return CHANNEL_STRATEGY_IDS.map((id) => channelStrategyRegistry[id]);
}

export function isChannelStrategyId(
  value: unknown
): value is ChannelStrategyId {
  return (
    typeof value === 'string' &&
    CHANNEL_STRATEGY_IDS.includes(value as ChannelStrategyId)
  );
}

export function assertChannelStrategyId(
  value: unknown
): asserts value is ChannelStrategyId {
  if (!isChannelStrategyId(value)) {
    throw new Error(`Unsupported channel strategy: ${String(value)}`);
  }
}

export function getChannelStrategy(id: ChannelStrategyId): ChannelStrategy {
  return channelStrategyRegistry[id];
}

export function resolveChannelStrategy(id: unknown): ChannelStrategy {
  return isChannelStrategyId(id)
    ? getChannelStrategy(id)
    : growAudienceStrategy;
}

export function resolveMaterializationConfig(
  strategyId: unknown
): ResolvedMaterializationConfig {
  const strategy = resolveChannelStrategy(strategyId);
  const profile = strategy.getMaterializationProfile();

  return Object.freeze({
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    materializationVersion: profile.version,
    profile,
  });
}

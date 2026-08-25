import {
  assertRelationshipScoringProfile,
} from './channel-strategy.scoring';
import {
  CHANNEL_STRATEGY_IDS,
  ChannelStrategy,
  ChannelStrategyId,
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

export const FALLBACK_CHANNEL_STRATEGY_ID: ChannelStrategyId = growAudienceStrategy.id;

export function listChannelStrategies(): ChannelStrategy[] {
  return CHANNEL_STRATEGY_IDS.map((id) => channelStrategyRegistry[id]);
}

export function isChannelStrategyId(value: unknown): value is ChannelStrategyId {
  return typeof value === 'string' && CHANNEL_STRATEGY_IDS.includes(value as ChannelStrategyId);
}

export function assertChannelStrategyId(value: unknown): asserts value is ChannelStrategyId {
  if (!isChannelStrategyId(value)) {
    throw new Error(`Unsupported channel strategy: ${String(value)}`);
  }
}

export function getChannelStrategy(id: ChannelStrategyId): ChannelStrategy {
  return channelStrategyRegistry[id];
}

export function resolveChannelStrategy(
  id: unknown
): ChannelStrategy {
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

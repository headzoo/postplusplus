import {
  assertRelationshipScoringProfile,
} from './channel-strategy.scoring';
import {
  CHANNEL_STRATEGY_IDS,
  ChannelStrategy,
  ChannelStrategyId,
} from './channel-strategy.types';
import { brandAwarenessStrategy } from './strategies/brand-awareness.strategy';
import { communityRetentionStrategy } from './strategies/community-retention.strategy';
import { customerSupportStrategy } from './strategies/customer-support.strategy';
import { growAudienceStrategy } from './strategies/grow-audience.strategy';
import { leadCaptureStrategy } from './strategies/lead-capture.strategy';

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

import {
  assertChannelStrategyId,
  channelStrategyRegistry,
  getChannelStrategy,
  isChannelStrategyId,
  resolveChannelStrategy,
} from './channel-strategy.registry';
import { CHANNEL_STRATEGY_IDS } from './channel-strategy.types';
import { GROW_AUDIENCE_PROFILE } from './strategies/strategy.shared';

const EXPERTISE_THEME_NUDGES: Record<
  (typeof CHANNEL_STRATEGY_IDS)[number],
  string
> = {
  grow_audience:
    'Prefer reciprocal mutual deepening and timely first replies over broad one-sided outreach.',
  lead_capture:
    'Prefer relevant, non-salesy follow-up and warm-network context; disengage from poor fits.',
  community_retention:
    'Re-engage cooling mutuals selectively, match effort for one-sided relationships, and steward proven advocates.',
  brand_awareness:
    'Acknowledge mentions and amplification genuinely; steward repeat amplifiers without transactional appreciation.',
  customer_support:
    'Use calm complaint-reply patterns, protect sensitive details, and know when to disengage or escalate.',
};

describe('channelStrategyRegistry', () => {
  it('contains each supported strategy exactly once', () => {
    expect(Object.keys(channelStrategyRegistry).sort()).toEqual(
      [...CHANNEL_STRATEGY_IDS].sort()
    );
    expect(getChannelStrategy('grow_audience').version).toBe(1);
  });

  it('distinguishes strict write validation from safe legacy reads', () => {
    expect(isChannelStrategyId('lead_capture')).toBe(true);
    expect(isChannelStrategyId('unknown')).toBe(false);
    expect(() => assertChannelStrategyId('unknown')).toThrow(
      'Unsupported channel strategy'
    );
    expect(resolveChannelStrategy('unknown').id).toBe('grow_audience');
    expect(resolveChannelStrategy(null).id).toBe('grow_audience');
  });

  it('exposes complete immutable strategy metadata', () => {
    for (const strategy of Object.values(channelStrategyRegistry)) {
      expect(strategy.agent.directives.length).toBeGreaterThan(0);
      expect(strategy.ui.defaultFilter).toBeTruthy();
      expect(strategy.ui.defaultSort).toBeTruthy();
      expect(strategy.getScoringProfile().scoreCap).toBeGreaterThan(0);
    }
  });

  it('includes a concise expertise-theme nudge for every strategy', () => {
    for (const id of CHANNEL_STRATEGY_IDS) {
      const strategy = getChannelStrategy(id);
      expect(strategy.agent.directives[0]).toBe(EXPERTISE_THEME_NUDGES[id]);
      expect(strategy.version).toBe(1);
      expect(strategy.getScoringProfile().formulaVersion).toBe(
        GROW_AUDIENCE_PROFILE.formulaVersion
      );
    }
  });
});

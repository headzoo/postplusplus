import {
  assertChannelStrategyId,
  channelStrategyRegistry,
  getChannelStrategy,
  isChannelStrategyId,
  resolveChannelStrategy,
} from './channel-strategy.registry';
import { CHANNEL_STRATEGY_IDS } from './channel-strategy.types';

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
});

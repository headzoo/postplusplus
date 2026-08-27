import {
  calculateRelationshipGrade,
  getInteractionScore,
  getRelationshipTriage,
} from './channel-strategy.scoring';
import { getChannelStrategy } from './channel-strategy.registry';

function score(
  strategyId: Parameters<typeof getChannelStrategy>[0],
  effortScore: number,
  reciprocationScore: number
) {
  const strategy = getChannelStrategy(strategyId);
  return calculateRelationshipGrade(
    { effortScore, reciprocationScore },
    strategy.id,
    strategy.version,
    strategy.getScoringProfile()
  );
}

describe('channel strategy scoring', () => {
  it.each([
    [0, 0, null, null, 'quiet'],
    [8, 0, 1, 0, 'over_invested'],
    [0, 8, 2, 0, 'hot_lead'],
    [0, 3, 1.5, 0, 'hot_lead'],
    [10, 10, 3, 1, 'mutual'],
    [40, 40, 5, 1, 'mutual'],
    [30, 10, 1, 1 / 3, 'over_invested'],
  ])(
    'keeps the Grow audience v1 baseline for %i/%i',
    (effortScore, reciprocationScore, grade, reciprocity, triage) => {
      const result = score('grow_audience', effortScore, reciprocationScore);
      expect(result).toMatchObject({
        grade,
        reciprocity,
        formulaVersion: 4,
        strategyId: 'grow_audience',
        strategyVersion: 1,
        triage,
      });
    }
  );

  it('applies the documented interaction biases', () => {
    const grow = getChannelStrategy('grow_audience').getScoringProfile();
    const lead = getChannelStrategy('lead_capture').getScoringProfile();
    const community = getChannelStrategy(
      'community_retention'
    ).getScoringProfile();
    const awareness = getChannelStrategy('brand_awareness').getScoringProfile();
    const support = getChannelStrategy('customer_support').getScoringProfile();

    expect(getInteractionScore(lead, 'reply', 'inbound')).toBeGreaterThan(
      getInteractionScore(grow, 'reply', 'inbound')
    );
    expect(lead.hotDirectionalRatio).toBeLessThan(grow.hotDirectionalRatio);
    expect(getInteractionScore(community, 'reply', 'outbound')).toBeGreaterThan(
      getInteractionScore(grow, 'reply', 'outbound')
    );
    expect(getInteractionScore(awareness, 'repost', 'inbound')).toBeGreaterThan(
      getInteractionScore(grow, 'repost', 'inbound')
    );
    expect(getInteractionScore(support, 'reply', 'outbound')).toBeGreaterThan(
      getInteractionScore(grow, 'reply', 'outbound')
    );
    expect(support.outboundExcessPenaltyWeight).toBe(0);
    expect(
      getRelationshipTriage({ effortScore: 24, reciprocationScore: 0 }, support)
    ).toBe('over_invested');
  });

  it('is deterministic and rejects invalid numeric input', () => {
    expect(score('lead_capture', 10, 12)).toEqual(
      score('lead_capture', 10, 12)
    );
    const strategy = getChannelStrategy('grow_audience');
    expect(() =>
      calculateRelationshipGrade(
        { effortScore: 1.5, reciprocationScore: 1 },
        strategy.id,
        strategy.version,
        strategy.getScoringProfile()
      )
    ).toThrow(RangeError);
  });
});

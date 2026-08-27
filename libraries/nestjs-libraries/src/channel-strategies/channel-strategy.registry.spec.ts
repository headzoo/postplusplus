import {
  assertChannelStrategyId,
  assertConversionProfile,
  channelStrategyRegistry,
  getChannelStrategy,
  isChannelStrategyId,
  resolveChannelStrategy,
  resolveMaterializationConfig,
} from './channel-strategy.registry';
import {
  CHANNEL_STRATEGY_IDS,
  ChannelConversionProfile,
  TRIAGE_PIPELINE_KINDS,
} from './channel-strategy.types';
import {
  AMPLIFICATION_CONVERSION_PROFILE,
  CUSTOMER_SUPPORT_CONVERSION_PROFILE,
  DEFAULT_MATERIALIZATION_PROFILE,
  FOLLOWER_TRANSITION_CONVERSION_PROFILE,
  GROW_AUDIENCE_PROFILE,
  WEBSITE_GOAL_CONVERSION_PROFILE,
} from './strategies/strategy.shared';

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
      expect(strategy.getMaterializationProfile().version).toBeGreaterThan(0);
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

  it('provides validated immutable materialization profiles for every strategy', () => {
    for (const strategy of Object.values(channelStrategyRegistry)) {
      const profile = strategy.getMaterializationProfile();
      const profileAgain = strategy.getMaterializationProfile();

      expect(profile).toEqual(DEFAULT_MATERIALIZATION_PROFILE);
      expect(profile).toBe(profileAgain);
      expect(profile.hot).toEqual({
        candidatePoolSize: 100,
        pickLimit: 20,
        nearFullRatio: 0.9,
        recentEventLookbackHours: 24,
      });
      expect(profile.lead).toEqual({
        fitBackfillLimit: 25,
        fitMinScore: 50,
        feedbackExampleLimit: 8,
      });
      expect(profile.cultivate).toEqual({
        candidatePoolSize: 100,
        pickLimit: 20,
        nearFullRatio: 0.9,
        warmGradeThreshold: 3.5,
        staleDays: 14,
      });
    }
  });

  it('resolves materialization config from strategy selection with fallback', () => {
    const resolved = resolveMaterializationConfig('lead_capture');
    expect(resolved).toEqual({
      strategyId: 'lead_capture',
      strategyVersion: 1,
      materializationVersion: 1,
      profile: DEFAULT_MATERIALIZATION_PROFILE,
    });

    const fallback = resolveMaterializationConfig('legacy-unknown');
    expect(fallback.strategyId).toBe('grow_audience');
    expect(fallback.materializationVersion).toBe(1);
    expect(Object.isFrozen(fallback)).toBe(true);
  });

  it('covers every triage pipeline kind in materialization profiles', () => {
    for (const triage of TRIAGE_PIPELINE_KINDS) {
      const profile = getChannelStrategy('grow_audience').getMaterializationProfile();
      expect(profile[triage]).toBeDefined();
    }
  });

  it('provides validated immutable conversion profiles for every strategy', () => {
    const expectedProfiles: Record<
      (typeof CHANNEL_STRATEGY_IDS)[number],
      ChannelConversionProfile
    > = {
      grow_audience: FOLLOWER_TRANSITION_CONVERSION_PROFILE,
      community_retention: FOLLOWER_TRANSITION_CONVERSION_PROFILE,
      lead_capture: WEBSITE_GOAL_CONVERSION_PROFILE,
      brand_awareness: AMPLIFICATION_CONVERSION_PROFILE,
      customer_support: CUSTOMER_SUPPORT_CONVERSION_PROFILE,
    };

    for (const id of CHANNEL_STRATEGY_IDS) {
      const profile = getChannelStrategy(id).getConversionProfile();
      const profileAgain = getChannelStrategy(id).getConversionProfile();

      expect(profile).toEqual(expectedProfiles[id]);
      expect(profile).toBe(profileAgain);
      expect(Object.isFrozen(profile)).toBe(true);
      expect(profile.profileVersion).toBe(1);
    }
  });

  it('maps follower strategies to NOT_FOLLOWER -> FOLLOWER transitions', () => {
    for (const id of ['grow_audience', 'community_retention'] as const) {
      const profile = getChannelStrategy(id).getConversionProfile();
      expect(profile).toMatchObject({
        kind: 'follower_transition',
        conversionType: 'follower_gained',
        fromState: 'NOT_FOLLOWER',
        toState: 'FOLLOWER',
      });
    }
  });

  it('maps lead capture to a 30-day website goal profile', () => {
    expect(getChannelStrategy('lead_capture').getConversionProfile()).toMatchObject({
      kind: 'website_goal',
      conversionType: 'website_goal',
      attributionWindowDays: 30,
      clickIdParameter: 'pp_click_id',
    });
  });

  it('maps brand awareness to amplification defaults with complete inbound weights', () => {
    const profile = getChannelStrategy('brand_awareness').getConversionProfile();
    expect(profile).toMatchObject({
      kind: 'amplification',
      conversionType: 'amplification_threshold',
      windowDays: 7,
      acceptedInboundKinds: ['mention', 'repost'],
      inboundKindWeights: {
        mention: 1,
        repost: 2,
      },
      threshold: 5,
      minimumActiveUtcDays: 2,
      cooldownDays: 7,
    });

    if (profile.kind !== 'amplification') {
      throw new Error('Expected amplification conversion profile');
    }

    for (const kind of profile.acceptedInboundKinds) {
      expect(profile.inboundKindWeights[kind]).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(profile.acceptedInboundKinds)).toBe(true);
    expect(Object.isFrozen(profile.inboundKindWeights)).toBe(true);
  });

  it('maps customer support to SLA and explicit resolution defaults', () => {
    expect(getChannelStrategy('customer_support').getConversionProfile()).toMatchObject({
      kind: 'customer_support',
      slaConversionType: 'support_sla_hit',
      resolutionConversionType: 'support_issue_resolved',
      firstResponseSlaHours: 24,
      explicitResolutionEnabled: true,
      inferredResolutionEnabled: false,
      inferredResolutionDelayHours: null,
      conversationKeyPolicy: 'conversation_or_actor',
    });
  });

  it('rejects invalid conversion profiles during registry validation', () => {
    expect(() =>
      assertConversionProfile({
        kind: 'website_goal',
        profileVersion: 1,
        conversionType: 'website_goal',
        attributionWindowDays: 0,
        clickIdParameter: 'pp_click_id',
      })
    ).toThrow('Invalid website goal attribution window days');

    expect(() =>
      assertConversionProfile({
        kind: 'amplification',
        profileVersion: 1,
        conversionType: 'amplification_threshold',
        windowDays: 7,
        acceptedInboundKinds: ['mention'],
        inboundKindWeights: {},
        threshold: 5,
        minimumActiveUtcDays: 2,
        cooldownDays: 7,
      })
    ).toThrow('Invalid amplification inbound kind weights: missing accepted kind');

    expect(() =>
      assertConversionProfile({
        kind: 'follower_transition',
        profileVersion: 1,
        conversionType: 'follower_gained',
        fromState: 'FOLLOWER',
        toState: 'FOLLOWER',
      })
    ).toThrow('Invalid follower transition: fromState equals toState');

    expect(() =>
      assertConversionProfile({
        kind: 'customer_support',
        profileVersion: 1,
        slaConversionType: 'support_sla_hit',
        resolutionConversionType: 'support_issue_resolved',
        inboundKinds: ['mention'],
        outboundKinds: ['reply'],
        firstResponseSlaHours: 24,
        conversationKeyPolicy: 'conversation_or_actor',
        explicitResolutionEnabled: true,
        inferredResolutionEnabled: false,
        inferredResolutionDelayHours: 12,
      })
    ).toThrow(
      'Invalid customer support inferred resolution delay: must be null when inference disabled'
    );
  });
});

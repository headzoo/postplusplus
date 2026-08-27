import {
  ChannelConversionProfile,
  ChannelStrategy,
  ChannelStrategyId,
  RelationshipScoringProfile,
  StrategyMaterializationProfile,
} from '../channel-strategy.types';

export const GROW_AUDIENCE_PROFILE: RelationshipScoringProfile = {
  formulaVersion: 4,
  scoreCap: 40,
  meaningfulActivityThreshold: 8,
  hotDirectionalRatio: 1.5,
  touchedHotDirectionalRatio: 2,
  overInvestedDirectionalRatio: 1.5,
  interactionWeights: {
    like: { inbound: 2, outbound: 1 },
    mention: { inbound: 4, outbound: 2 },
    repost: { inbound: 6, outbound: 3 },
    reply: { inbound: 8, outbound: 4 },
    follow: { inbound: 10, outbound: 5 },
  },
  inboundPriorityWeight: 1,
  reciprocityRewardWeight: 1,
  outboundExcessPenaltyWeight: 1,
  selectedOutboundContributionWeight: 0,
};

const BASE_AGENT_DIRECTIVES = [
  'Use relationship signals as decision support, not as a guarantee.',
  'Keep recommendations actionable and concise.',
];

export const DEFAULT_MATERIALIZATION_PROFILE: StrategyMaterializationProfile = {
  version: 1,
  hot: {
    candidatePoolSize: 100,
    pickLimit: 20,
    nearFullRatio: 0.9,
    recentEventLookbackHours: 24,
  },
  lead: {
    fitBackfillLimit: 25,
    fitMinScore: 50,
    feedbackExampleLimit: 8,
  },
  cultivate: {
    candidatePoolSize: 100,
    pickLimit: 20,
    nearFullRatio: 0.9,
    warmGradeThreshold: 3.5,
    staleDays: 14,
  },
};

export const FOLLOWER_TRANSITION_CONVERSION_PROFILE: ChannelConversionProfile =
  {
    kind: 'follower_transition',
    profileVersion: 1,
    conversionType: 'follower_gained',
    fromState: 'NOT_FOLLOWER',
    toState: 'FOLLOWER',
  };

export const WEBSITE_GOAL_CONVERSION_PROFILE: ChannelConversionProfile = {
  kind: 'website_goal',
  profileVersion: 1,
  conversionType: 'website_goal',
  attributionWindowDays: 30,
  clickIdParameter: 'pp_click_id',
};

export const AMPLIFICATION_CONVERSION_PROFILE: ChannelConversionProfile = {
  kind: 'amplification',
  profileVersion: 1,
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
};

export const CUSTOMER_SUPPORT_CONVERSION_PROFILE: ChannelConversionProfile = {
  kind: 'customer_support',
  profileVersion: 1,
  slaConversionType: 'support_sla_hit',
  resolutionConversionType: 'support_issue_resolved',
  inboundKinds: ['mention', 'reply'],
  outboundKinds: ['reply'],
  firstResponseSlaHours: 24,
  conversationKeyPolicy: 'conversation_or_actor',
  explicitResolutionEnabled: true,
  inferredResolutionEnabled: false,
  inferredResolutionDelayHours: null,
};

function freezeMaterializationProfile(
  profile: StrategyMaterializationProfile
): StrategyMaterializationProfile {
  return Object.freeze({
    version: profile.version,
    hot: Object.freeze({ ...profile.hot }),
    lead: Object.freeze({ ...profile.lead }),
    cultivate: Object.freeze({ ...profile.cultivate }),
  });
}

function freezeConversionProfile(
  profile: ChannelConversionProfile
): ChannelConversionProfile {
  switch (profile.kind) {
    case 'follower_transition':
      return Object.freeze({ ...profile });
    case 'website_goal':
      return Object.freeze({ ...profile });
    case 'amplification':
      return Object.freeze({
        ...profile,
        acceptedInboundKinds: Object.freeze([...profile.acceptedInboundKinds]),
        inboundKindWeights: Object.freeze({ ...profile.inboundKindWeights }),
      });
    case 'customer_support':
      return Object.freeze({
        ...profile,
        inboundKinds: Object.freeze([...profile.inboundKinds]),
        outboundKinds: Object.freeze([...profile.outboundKinds]),
      });
    default: {
      const exhaustive: never = profile;
      throw new Error(`Unsupported conversion profile kind: ${exhaustive}`);
    }
  }
}

export function createStrategy(
  id: ChannelStrategyId,
  label: string,
  description: string,
  profile: RelationshipScoringProfile,
  conversionProfile: ChannelConversionProfile,
  ui?: Partial<ChannelStrategy['ui']>,
  directives: string[] = [],
  materializationProfile?: StrategyMaterializationProfile
): ChannelStrategy {
  const frozenMaterializationProfile = freezeMaterializationProfile(
    materializationProfile ?? DEFAULT_MATERIALIZATION_PROFILE
  );
  const frozenConversionProfile = freezeConversionProfile(conversionProfile);

  return {
    id,
    version: 1,
    label: { key: `channelStrategies.${id}.label`, defaultValue: label },
    description: {
      key: `channelStrategies.${id}.description`,
      defaultValue: description,
    },
    ui: {
      defaultFilter: 'all',
      defaultSort: 'recent',
      filterPriority: [
        'all',
        'leads',
        'hot',
        'cultivate',
        'followed',
        'mutual',
        'quiet',
        'costly',
        'ignored',
        'bots',
      ],
      filterEmphasis: 'all',
      compactMetrics: [
        {
          key: 'relationship',
          label: {
            key: 'channelStrategies.metrics.relationship',
            defaultValue: 'Relationship',
          },
        },
      ],
      emptyState: {
        key: `channelStrategies.${id}.emptyState`,
        defaultValue: 'No relationships match this view yet.',
      },
      assistantInitialCopy: {
        key: `channelStrategies.${id}.assistantInitialCopy`,
        defaultValue: `I can help you prioritize relationships for ${label.toLowerCase()}.`,
      },
      suggestedQuestions: [
        {
          key: `channelStrategies.${id}.suggestedQuestions.prioritize`,
          defaultValue: 'Who should I prioritize today?',
        },
      ],
      ...ui,
    },
    agent: {
      summary: {
        key: `channelStrategies.${id}.agent.summary`,
        defaultValue: description,
      },
      directives: [...directives, ...BASE_AGENT_DIRECTIVES],
    },
    getScoringProfile: () => profile,
    getMaterializationProfile: () => frozenMaterializationProfile,
    getConversionProfile: () => frozenConversionProfile,
  };
}

import {
  ChannelStrategy,
  ChannelStrategyId,
  RelationshipScoringProfile,
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

export function createStrategy(
  id: ChannelStrategyId,
  label: string,
  description: string,
  profile: RelationshipScoringProfile,
  ui?: Partial<ChannelStrategy['ui']>,
  directives: string[] = []
): ChannelStrategy {
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
        'mutual',
        'quiet',
        'costly',
        'bots',
        'ignored',
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
  };
}

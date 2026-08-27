import { RelationshipScoringProfile } from '../channel-strategy.types';
import {
  AMPLIFICATION_CONVERSION_PROFILE,
  createStrategy,
  GROW_AUDIENCE_PROFILE,
} from './strategy.shared';

const brandAwarenessProfile: RelationshipScoringProfile = {
  ...GROW_AUDIENCE_PROFILE,
  interactionWeights: {
    ...GROW_AUDIENCE_PROFILE.interactionWeights,
    mention: { inbound: 7, outbound: 2 },
    repost: { inbound: 10, outbound: 3 },
  },
  inboundPriorityWeight: 1.15,
};

export const brandAwarenessStrategy = createStrategy(
  'brand_awareness',
  'Build awareness',
  'Prioritize people amplifying and mentioning your brand.',
  brandAwarenessProfile,
  AMPLIFICATION_CONVERSION_PROFILE,
  {
    defaultFilter: 'all',
    defaultSort: 'interactions',
    filterPriority: ['all', 'hot'],
    filterEmphasis: 'hot',
    emptyState: {
      key: 'channelStrategies.brand_awareness.emptyState',
      defaultValue:
        'No recent amplification or mention activity is available for this channel yet.',
    },
    assistantInitialCopy: {
      key: 'channelStrategies.brand_awareness.assistantInitialCopy',
      defaultValue:
        'Hi! I can help you spot the people amplifying this channel.',
    },
    suggestedQuestions: [
      {
        key: 'channelStrategies.brand_awareness.suggestedQuestions.amplifiers',
        defaultValue: 'Who amplified my content recently?',
      },
      {
        key: 'channelStrategies.brand_awareness.suggestedQuestions.mentions',
        defaultValue: 'Which mentions deserve a response?',
      },
      {
        key: 'channelStrategies.brand_awareness.suggestedQuestions.reach',
        defaultValue: 'Who reshares my posts most often?',
      },
    ],
  },
  [
    'Acknowledge mentions and amplification genuinely; steward repeat amplifiers without transactional appreciation.',
    'Prioritize amplification signals such as mentions and reposts when ranking people.',
    'Explain reach with the interactions you can verify, not with follower counts alone.',
  ]
);

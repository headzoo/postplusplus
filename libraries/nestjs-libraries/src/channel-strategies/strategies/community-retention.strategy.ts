import { RelationshipScoringProfile } from '../channel-strategy.types';
import {
  createStrategy,
  FOLLOWER_TRANSITION_CONVERSION_PROFILE,
  GROW_AUDIENCE_PROFILE,
} from './strategy.shared';

const communityRetentionProfile: RelationshipScoringProfile = {
  ...GROW_AUDIENCE_PROFILE,
  interactionWeights: {
    ...GROW_AUDIENCE_PROFILE.interactionWeights,
    like: { inbound: 2, outbound: 2 },
    mention: { inbound: 4, outbound: 3 },
    repost: { inbound: 6, outbound: 4 },
    reply: { inbound: 8, outbound: 6 },
    follow: { inbound: 10, outbound: 5 },
  },
  reciprocityRewardWeight: 1.25,
  selectedOutboundContributionWeight: 0.15,
};

export const communityRetentionStrategy = createStrategy(
  'community_retention',
  'Retain community',
  'Strengthen useful two-way interactions with your community.',
  communityRetentionProfile,
  FOLLOWER_TRANSITION_CONVERSION_PROFILE,
  {
    defaultFilter: 'cultivate',
    defaultSort: 'recent',
    filterPriority: ['cultivate', 'mutual', 'all'],
    filterEmphasis: 'cultivate',
    emptyState: {
      key: 'channelStrategies.community_retention.emptyState',
      defaultValue:
        'No community relationships need nurturing right now. Check mutual relationships as new activity arrives.',
    },
    assistantInitialCopy: {
      key: 'channelStrategies.community_retention.assistantInitialCopy',
      defaultValue:
        'Hi! I can help you nurture the community relationships that need attention.',
    },
    suggestedQuestions: [
      {
        key: 'channelStrategies.community_retention.suggestedQuestions.attention',
        defaultValue: 'Which community relationships need attention this week?',
      },
      {
        key: 'channelStrategies.community_retention.suggestedQuestions.unanswered',
        defaultValue: 'Who have I not replied to recently?',
      },
      {
        key: 'channelStrategies.community_retention.suggestedQuestions.cooling',
        defaultValue: 'Which mutual relationships are going quiet?',
      },
    ],
  },
  [
    'Re-engage cooling mutuals selectively, match effort for one-sided relationships, and steward proven advocates.',
    'Prioritize two-way relationships that are cooling off and need outbound attention.',
    'Prefer nurturing existing relationships over sourcing new contacts.',
  ]
);

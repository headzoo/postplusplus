import { RelationshipScoringProfile } from '../channel-strategy.types';
import { createStrategy, GROW_AUDIENCE_PROFILE } from './strategy.shared';

const customerSupportProfile: RelationshipScoringProfile = {
  ...GROW_AUDIENCE_PROFILE,
  interactionWeights: {
    ...GROW_AUDIENCE_PROFILE.interactionWeights,
    mention: { inbound: 7, outbound: 2 },
    reply: { inbound: 10, outbound: 7 },
  },
  inboundPriorityWeight: 1.25,
  outboundExcessPenaltyWeight: 0,
  selectedOutboundContributionWeight: 0.2,
};

export const customerSupportStrategy = createStrategy(
  'customer_support',
  'Support customers',
  'Prioritize incoming support conversations while recognizing replies.',
  customerSupportProfile,
  {
    defaultFilter: 'costly',
    defaultSort: 'recent',
    filterPriority: ['costly', 'engaged', 'all'],
    filterEmphasis: 'costly',
    emptyState: {
      key: 'channelStrategies.customer_support.emptyState',
      defaultValue:
        'No relationships need additional support attention right now.',
    },
    assistantInitialCopy: {
      key: 'channelStrategies.customer_support.assistantInitialCopy',
      defaultValue:
        'Hi! I can help you clear the support conversations waiting on this channel.',
    },
    suggestedQuestions: [
      {
        key: 'channelStrategies.customer_support.suggestedQuestions.waiting',
        defaultValue: 'Who is waiting on a reply from me?',
      },
      {
        key: 'channelStrategies.customer_support.suggestedQuestions.costly',
        defaultValue: 'Which conversations are costing me the most effort?',
      },
      {
        key: 'channelStrategies.customer_support.suggestedQuestions.helped',
        defaultValue: 'Who did I already help this week?',
      },
    ],
  },
  [
    'Prioritize unanswered inbound conversations and people the channel already invests effort in.',
    'Treat unresolved support threads as more urgent than growth opportunities.',
  ]
);

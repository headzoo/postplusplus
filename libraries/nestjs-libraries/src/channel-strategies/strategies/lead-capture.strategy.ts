import { RelationshipScoringProfile } from '../channel-strategy.types';
import { createStrategy, GROW_AUDIENCE_PROFILE } from './strategy.shared';

const leadCaptureProfile: RelationshipScoringProfile = {
  ...GROW_AUDIENCE_PROFILE,
  hotDirectionalRatio: 1.25,
  interactionWeights: {
    ...GROW_AUDIENCE_PROFILE.interactionWeights,
    mention: { inbound: 6, outbound: 2 },
    reply: { inbound: 10, outbound: 4 },
    follow: { inbound: 12, outbound: 5 },
  },
  inboundPriorityWeight: 1.2,
};

export const leadCaptureStrategy = createStrategy(
  'lead_capture',
  'Capture leads',
  'Surface high-intent inbound conversations and follows.',
  leadCaptureProfile,
  {
    defaultFilter: 'leads',
    defaultSort: 'fit',
    filterPriority: ['leads', 'hot', 'engaged', 'all'],
    filterEmphasis: 'leads',
    emptyState: {
      key: 'channelStrategies.lead_capture.emptyState',
      defaultValue:
        'No leads match this view yet. New lead signals appear as people interact with your channel.',
    },
    assistantInitialCopy: {
      key: 'channelStrategies.lead_capture.assistantInitialCopy',
      defaultValue:
        'Hi! I can help you work the highest-intent leads on this channel.',
    },
    suggestedQuestions: [
      {
        key: 'channelStrategies.lead_capture.suggestedQuestions.followUp',
        defaultValue: 'Which leads should I follow up with first?',
      },
      {
        key: 'channelStrategies.lead_capture.suggestedQuestions.engagedNotFollowing',
        defaultValue: 'Who engaged recently but does not follow yet?',
      },
      {
        key: 'channelStrategies.lead_capture.suggestedQuestions.dismiss',
        defaultValue: 'Which leads look like a poor fit for my channel?',
      },
    ],
  },
  [
    'Prioritize high-intent inbound signals: leads, mentions, replies, and new follows.',
    'Treat lead grades as a ranking hint; verify the person with follower tools before recommending outreach.',
  ]
);

import {
  createStrategy,
  FOLLOWER_TRANSITION_CONVERSION_PROFILE,
  GROW_AUDIENCE_PROFILE,
} from './strategy.shared';

export const growAudienceStrategy = createStrategy(
  'grow_audience',
  'Grow audience',
  'Prioritize reciprocal relationships that can expand your audience.',
  GROW_AUDIENCE_PROFILE,
  FOLLOWER_TRANSITION_CONVERSION_PROFILE,
  {
    assistantInitialCopy: {
      key: 'channelStrategies.grow_audience.assistantInitialCopy',
      defaultValue:
        'Hi! I can help you find the relationships worth investing in to grow this channel.',
    },
    suggestedQuestions: [
      {
        key: 'channelStrategies.grow_audience.suggestedQuestions.engage',
        defaultValue: 'Who should I engage with to grow my audience?',
      },
      {
        key: 'channelStrategies.grow_audience.suggestedQuestions.mutual',
        defaultValue: 'Which mutual relationships are worth deepening?',
      },
      {
        key: 'channelStrategies.grow_audience.suggestedQuestions.newFollowers',
        defaultValue: 'Who followed recently that I have not replied to?',
      },
    ],
  },
  [
    'Prefer reciprocal mutual deepening and timely first replies over broad one-sided outreach.',
    'Prioritize reciprocal relationships that can expand reach over one-sided activity.',
    'Name the relationship signal (mutual, hot lead, quiet) behind every suggestion.',
    'For “Who followed recently that I have not replied to?”, call listRecentFollowers with withoutOutboundSinceFollow: true.',
  ]
);

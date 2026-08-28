import {
  RELATIONSHIP_DIRECTIONAL_RATIO,
  RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD,
  RELATIONSHIP_WINDOW_DAYS,
} from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.scoring';
import { FOLLOWER_CATEGORY_DESCRIPTIONS } from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';
import { FollowerSegmentSlug } from '@gitroom/frontend/components/followers/follower.segments';

export type FollowerSegmentHelpCopy = {
  summaryKey: string;
  defaultSummary: string;
  calculationKey: string;
  defaultCalculation: string;
  calculationParams?: Record<string, string | number>;
};

export const FOLLOWER_SEGMENT_HELP_COPY: Partial<
  Record<FollowerSegmentSlug, FollowerSegmentHelpCopy>
> = {
  leads: {
    summaryKey: 'followers_board_leads_description',
    defaultSummary: FOLLOWER_CATEGORY_DESCRIPTIONS.lead,
    calculationKey: 'followers_segment_help_leads_calculation',
    defaultCalculation:
      'Leads are people who interact with the channel but are not followers yet, including warm-network prospects reached through bridges (for example “Via @handle”). Membership comes from audience state and recent interactions—not from the Mutual/Quiet/Costly effort ratios. Cards may show an optional Fit score. You can follow them (when the channel supports it), move them to a list, remove them with a reason, or snooze them.',
  },
  hot: {
    summaryKey: 'followers_board_hot_description',
    defaultSummary: FOLLOWER_CATEGORY_DESCRIPTIONS.hot,
    calculationKey: 'followers_segment_help_hot_calculation',
    defaultCalculation:
      'Hot is an hourly materialized list of relationships that need reciprocation—not a live sort by net effort gap. A background job builds a rules candidate pool, optionally reranks with AI, and stores a bounded set of picks for the current UTC hour. New activity can take up to about an hour to appear. Cards may show a reason and suggested action. Dismissing removes the person from the view immediately even if the underlying pick row remains until the next batch.',
  },
  cultivate: {
    summaryKey: 'followers_board_cultivate_description',
    defaultSummary: FOLLOWER_CATEGORY_DESCRIPTIONS.cultivate,
    calculationKey: 'followers_segment_help_cultivate_calculation',
    defaultCalculation:
      'Cultivate is an hourly materialized list of warm relationships that have not received outbound attention recently. A background job selects candidates from relationship grades and recency rules, optionally reranks with AI, and stores picks for the hour. Cards may show a reason and suggested action. This is for nurturing existing warmth—not for new leads.',
  },
  followed: {
    summaryKey: 'followers_board_followed_description',
    defaultSummary: FOLLOWER_CATEGORY_DESCRIPTIONS.followed,
    calculationKey: 'followers_segment_help_followed_calculation',
    defaultCalculation:
      'Followed is based on channel follow-state membership: people this channel follows who have not followed back yet. It is not derived from effort scores or triage ratios.',
  },
  conversions: {
    summaryKey: 'followers_board_conversions_description',
    defaultSummary: FOLLOWER_CATEGORY_DESCRIPTIONS.converted,
    calculationKey: 'followers_segment_help_conversions_calculation',
    defaultCalculation:
      'Conversions lists people with at least one recorded conversion event on this channel. What counts as a conversion depends on the channel’s active strategy (for example a follower gain, attributed website goal, amplification threshold, or support outcome). Events are stored when evidence is accepted and are not recomputed when strategy changes later.',
  },
  mutual: {
    summaryKey: 'followers_board_mutual_description',
    defaultSummary: FOLLOWER_CATEGORY_DESCRIPTIONS.mutual,
    calculationKey: 'followers_segment_help_mutual_calculation',
    defaultCalculation:
      'Mutual uses live relationship scores over roughly the last {{windowDays}} days. Interactions (likes, mentions, reposts, replies, follows) add to Your effort (outbound) and Their effort (inbound). When both sides have meaningful activity (at least {{meaningfulThreshold}} points) and neither side is strongly ahead by the Hot or Costly ratios, the relationship is Mutual—effort is balanced.',
    calculationParams: {
      windowDays: RELATIONSHIP_WINDOW_DAYS,
      meaningfulThreshold: RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD,
    },
  },
  quiet: {
    summaryKey: 'followers_board_quiet_description',
    defaultSummary: FOLLOWER_CATEGORY_DESCRIPTIONS.quiet,
    calculationKey: 'followers_segment_help_quiet_calculation',
    defaultCalculation:
      'Quiet uses live relationship scores over roughly the last {{windowDays}} days. When the higher of Your effort and Their effort stays below the meaningful-activity threshold ({{meaningfulThreshold}} points), the relationship is Quiet—little activity either way.',
    calculationParams: {
      windowDays: RELATIONSHIP_WINDOW_DAYS,
      meaningfulThreshold: RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD,
    },
  },
  costly: {
    summaryKey: 'followers_board_costly_description',
    defaultSummary: FOLLOWER_CATEGORY_DESCRIPTIONS.over_invested,
    calculationKey: 'followers_segment_help_costly_calculation',
    defaultCalculation:
      'Costly (over-invested) uses live relationship scores over roughly the last {{windowDays}} days. When Your effort is at least {{meaningfulThreshold}} points and is {{overInvestedRatio}}× or more Their effort (or they have no reciprocation), the channel is investing more than it gets back.',
    calculationParams: {
      windowDays: RELATIONSHIP_WINDOW_DAYS,
      meaningfulThreshold: RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD,
      overInvestedRatio: RELATIONSHIP_DIRECTIONAL_RATIO,
    },
  },
  ignored: {
    summaryKey: 'followers_board_ignored_description',
    defaultSummary: FOLLOWER_CATEGORY_DESCRIPTIONS.ignored,
    calculationKey: 'followers_segment_help_ignored_calculation',
    defaultCalculation:
      'Ignored is an organization-managed visibility state, not a relationship score. Marking someone Ignored hides them from other Followers views; you can find them again under this column.',
  },
  unfollowed: {
    summaryKey: 'followers_board_unfollowed_description',
    defaultSummary: FOLLOWER_CATEGORY_DESCRIPTIONS.unfollowed,
    calculationKey: 'followers_segment_help_unfollowed_calculation',
    defaultCalculation:
      'Unfollowed is based on follow-state history: people this channel still follows who used to follow and no longer do. It is not derived from effort scores.',
  },
  bots: {
    summaryKey: 'followers_board_bots_description',
    defaultSummary: 'Likely automated accounts.',
    calculationKey: 'followers_segment_help_bots_calculation',
    defaultCalculation:
      'Bots filters by bot likelihood using signals such as account age, posting patterns, and engagement shape. Cards may show a robot icon or bot grade. This is a classification filter, not an effort-based triage.',
  },
};

export const getFollowerSegmentHelpCopy = (
  slug: FollowerSegmentSlug
): FollowerSegmentHelpCopy | null => FOLLOWER_SEGMENT_HELP_COPY[slug] ?? null;

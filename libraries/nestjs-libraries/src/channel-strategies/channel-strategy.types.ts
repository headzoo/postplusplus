export const CHANNEL_STRATEGY_IDS = [
  'grow_audience',
  'lead_capture',
  'community_retention',
  'brand_awareness',
  'customer_support',
] as const;

export type ChannelStrategyId = (typeof CHANNEL_STRATEGY_IDS)[number];

export const CHANNEL_INTERACTION_SCORE_KINDS = [
  'like',
  'mention',
  'repost',
  'reply',
  'follow',
] as const;

export type ChannelInteractionScoreKind =
  (typeof CHANNEL_INTERACTION_SCORE_KINDS)[number];
export type ChannelInteractionScoreDirection = 'inbound' | 'outbound';

export type RelationshipInteractionCounts = Record<
  ChannelInteractionScoreKind,
  Record<ChannelInteractionScoreDirection, number>
>;
export type RelationshipTriage =
  | 'quiet'
  | 'hot_lead'
  | 'over_invested'
  | 'mutual';

export type LocalizedCopy = {
  key: string;
  defaultValue: string;
};

export type ChannelStrategyUi = {
  defaultFilter: string;
  defaultSort: string;
  filterPriority: string[];
  filterEmphasis: string;
  compactMetrics: Array<{ key: string; label: LocalizedCopy }>;
  emptyState: LocalizedCopy;
  assistantInitialCopy: LocalizedCopy;
  suggestedQuestions: LocalizedCopy[];
};

export type ChannelStrategyAgent = {
  summary: LocalizedCopy;
  directives: readonly string[];
};

export type RelationshipScoringProfile = {
  formulaVersion: number;
  scoreCap: number;
  meaningfulActivityThreshold: number;
  hotDirectionalRatio: number;
  touchedHotDirectionalRatio: number;
  overInvestedDirectionalRatio: number;
  interactionWeights: Record<
    ChannelInteractionScoreKind,
    Record<ChannelInteractionScoreDirection, number>
  >;
  inboundPriorityWeight: number;
  reciprocityRewardWeight: number;
  outboundExcessPenaltyWeight: number;
  selectedOutboundContributionWeight: number;
};

export type StrategyScoringInput = {
  effortScore: number;
  reciprocationScore: number;
};

export type StrategyScoreResult = {
  grade: number | null;
  reciprocity: number | null;
  formulaVersion: number;
  strategyId: ChannelStrategyId;
  strategyVersion: number;
  triage: RelationshipTriage;
};

export type ChannelStrategy = {
  readonly id: ChannelStrategyId;
  readonly version: number;
  readonly label: LocalizedCopy;
  readonly description: LocalizedCopy;
  readonly ui: ChannelStrategyUi;
  readonly agent: ChannelStrategyAgent;
  getScoringProfile(): RelationshipScoringProfile;
  prepare?: (input: unknown) => unknown;
  scoreRelationship?: (input: StrategyScoringInput) => StrategyScoreResult;
  triage?: (input: StrategyScoringInput) => RelationshipTriage;
};

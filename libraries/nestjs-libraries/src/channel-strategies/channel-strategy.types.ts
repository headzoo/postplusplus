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

export const TRIAGE_PIPELINE_KINDS = ['hot', 'lead', 'cultivate'] as const;

export type TriagePipelineKind = (typeof TRIAGE_PIPELINE_KINDS)[number];

export type HotMaterializationConfig = {
  candidatePoolSize: number;
  pickLimit: number;
  nearFullRatio: number;
  recentEventLookbackHours: number;
};

export type LeadMaterializationConfig = {
  fitBackfillLimit: number;
  fitMinScore: number;
  feedbackExampleLimit: number;
};

export type CultivateMaterializationConfig = {
  candidatePoolSize: number;
  pickLimit: number;
  nearFullRatio: number;
  warmGradeThreshold: number;
  staleDays: number;
};

export type StrategyMaterializationProfile = {
  version: number;
  hot: HotMaterializationConfig;
  lead: LeadMaterializationConfig;
  cultivate: CultivateMaterializationConfig;
};

export type ResolvedMaterializationConfig = {
  strategyId: ChannelStrategyId;
  strategyVersion: number;
  materializationVersion: number;
  profile: StrategyMaterializationProfile;
};

export const FOLLOWER_MEMBERSHIP_STATES = [
  'NOT_FOLLOWER',
  'FOLLOWER',
  'UNKNOWN',
] as const;

export type FollowerMembershipState =
  (typeof FOLLOWER_MEMBERSHIP_STATES)[number];

export type FollowerTransitionConversionProfile = {
  kind: 'follower_transition';
  profileVersion: number;
  conversionType: string;
  fromState: FollowerMembershipState;
  toState: FollowerMembershipState;
};

export type WebsiteGoalConversionProfile = {
  kind: 'website_goal';
  profileVersion: number;
  conversionType: string;
  attributionWindowDays: number;
  clickIdParameter: string;
};

export type AmplificationConversionProfile = {
  kind: 'amplification';
  profileVersion: number;
  conversionType: string;
  windowDays: number;
  acceptedInboundKinds: readonly ChannelInteractionScoreKind[];
  inboundKindWeights: Readonly<
    Partial<Record<ChannelInteractionScoreKind, number>>
  >;
  threshold: number;
  minimumActiveUtcDays: number;
  cooldownDays: number;
};

export type SupportConversationKeyPolicy = 'conversation_or_actor';

export type CustomerSupportConversionProfile = {
  kind: 'customer_support';
  profileVersion: number;
  slaConversionType: string;
  resolutionConversionType: string;
  inboundKinds: readonly ChannelInteractionScoreKind[];
  outboundKinds: readonly ChannelInteractionScoreKind[];
  firstResponseSlaHours: number;
  conversationKeyPolicy: SupportConversationKeyPolicy;
  explicitResolutionEnabled: boolean;
  inferredResolutionEnabled: boolean;
  inferredResolutionDelayHours: number | null;
};

export type ChannelConversionProfile =
  | FollowerTransitionConversionProfile
  | WebsiteGoalConversionProfile
  | AmplificationConversionProfile
  | CustomerSupportConversionProfile;

export type ChannelStrategy = {
  readonly id: ChannelStrategyId;
  readonly version: number;
  readonly label: LocalizedCopy;
  readonly description: LocalizedCopy;
  readonly ui: ChannelStrategyUi;
  readonly agent: ChannelStrategyAgent;
  getScoringProfile(): RelationshipScoringProfile;
  getMaterializationProfile(): StrategyMaterializationProfile;
  getConversionProfile(): ChannelConversionProfile;
  prepare?: (input: unknown) => unknown;
  scoreRelationship?: (input: StrategyScoringInput) => StrategyScoreResult;
  triage?: (input: StrategyScoringInput) => RelationshipTriage;
};

import {
  CHANNEL_INTERACTION_SCORE_KINDS,
  ChannelInteractionScoreDirection,
  ChannelInteractionScoreKind,
  ChannelStrategyId,
  RelationshipInteractionCounts,
  RelationshipScoringProfile,
  RelationshipTriage,
  StrategyScoreResult,
  StrategyScoringInput,
} from './channel-strategy.types';

export function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function assertRelationshipScores(input: StrategyScoringInput) {
  if (
    !Number.isSafeInteger(input.effortScore) ||
    !Number.isSafeInteger(input.reciprocationScore) ||
    input.effortScore < 0 ||
    input.reciprocationScore < 0
  ) {
    throw new RangeError(
      'Relationship scores must be non-negative safe integers'
    );
  }
}

export function getInteractionScore(
  profile: RelationshipScoringProfile,
  kind: ChannelInteractionScoreKind,
  direction: ChannelInteractionScoreDirection
) {
  const score = profile.interactionWeights[kind]?.[direction];
  if (!Number.isFinite(score) || score < 0) {
    throw new Error('Unsupported interaction kind or direction');
  }
  return score;
}

export function createRelationshipInteractionCounts(): RelationshipInteractionCounts {
  return CHANNEL_INTERACTION_SCORE_KINDS.reduce(
    (counts, kind) => ({ ...counts, [kind]: { inbound: 0, outbound: 0 } }),
    {} as RelationshipInteractionCounts
  );
}

export function scoreInteractionCounts(
  profile: RelationshipScoringProfile,
  counts: RelationshipInteractionCounts,
  direction: ChannelInteractionScoreDirection
) {
  return CHANNEL_INTERACTION_SCORE_KINDS.reduce(
    (score, kind) =>
      score +
      (counts?.[kind]?.[direction] ?? 0) *
        getInteractionScore(profile, kind, direction),
    0
  );
}

export function getRelationshipTriage(
  input: StrategyScoringInput,
  profile: RelationshipScoringProfile
): RelationshipTriage {
  assertRelationshipScores(input);
  const { effortScore, reciprocationScore } = input;
  // Unreciprocated inbound engagement is Hot (formerly engaged_not_yet).
  if (effortScore === 0 && reciprocationScore > 0) {
    return 'hot_lead';
  }
  if (
    Math.max(effortScore, reciprocationScore) <
    profile.meaningfulActivityThreshold
  ) {
    return 'quiet';
  }
  const hotRatio = profile.touchedHotDirectionalRatio;
  if (
    reciprocationScore >= profile.meaningfulActivityThreshold &&
    reciprocationScore >= hotRatio * effortScore
  ) {
    return 'hot_lead';
  }
  if (
    effortScore >= profile.meaningfulActivityThreshold &&
    (reciprocationScore === 0 ||
      effortScore >= profile.overInvestedDirectionalRatio * reciprocationScore)
  ) {
    return 'over_invested';
  }
  return 'mutual';
}

export function calculateRelationshipGrade(
  input: StrategyScoringInput,
  strategyId: ChannelStrategyId,
  strategyVersion: number,
  profile: RelationshipScoringProfile
): StrategyScoreResult {
  assertRelationshipScores(input);
  const { effortScore, reciprocationScore } = input;
  const triage = getRelationshipTriage(input, profile);
  if (effortScore === 0 && reciprocationScore === 0) {
    return {
      grade: null,
      reciprocity: null,
      formulaVersion: profile.formulaVersion,
      strategyId,
      strategyVersion,
      triage,
    };
  }
  const reciprocity =
    Math.min(effortScore, reciprocationScore) /
    Math.max(effortScore, reciprocationScore);
  const effort = Math.min(effortScore / profile.scoreCap, 1);
  const reciprocation = Math.min(reciprocationScore / profile.scoreCap, 1);
  const priority = Math.min(
    1,
    Math.max(
      0,
      profile.inboundPriorityWeight * reciprocation +
        profile.reciprocityRewardWeight * Math.min(effort, reciprocation) +
        profile.selectedOutboundContributionWeight * effort -
        profile.outboundExcessPenaltyWeight *
          Math.max(effort - reciprocation, 0)
    )
  );
  return {
    grade: roundToHalf(1 + 4 * priority),
    reciprocity,
    formulaVersion: profile.formulaVersion,
    strategyId,
    strategyVersion,
    triage,
  };
}

export function assertRelationshipScoringProfile(
  profile: RelationshipScoringProfile
) {
  const values = [
    profile.formulaVersion,
    profile.scoreCap,
    profile.meaningfulActivityThreshold,
    profile.hotDirectionalRatio,
    profile.touchedHotDirectionalRatio,
    profile.overInvestedDirectionalRatio,
    profile.inboundPriorityWeight,
    profile.reciprocityRewardWeight,
    profile.outboundExcessPenaltyWeight,
    profile.selectedOutboundContributionWeight,
    ...Object.values(profile.interactionWeights).flatMap((directions) =>
      Object.values(directions)
    ),
  ];
  if (
    !values.every((value) => Number.isFinite(value) && value >= 0) ||
    !Number.isInteger(profile.formulaVersion) ||
    profile.formulaVersion < 1 ||
    profile.scoreCap <= 0 ||
    profile.meaningfulActivityThreshold <= 0 ||
    profile.hotDirectionalRatio <= 0 ||
    profile.touchedHotDirectionalRatio <= 0 ||
    profile.overInvestedDirectionalRatio <= 0
  ) {
    throw new RangeError('Invalid relationship scoring profile');
  }
}

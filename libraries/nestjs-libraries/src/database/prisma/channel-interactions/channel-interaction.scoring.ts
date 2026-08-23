export type ChannelInteractionScoreKind =
  | 'like'
  | 'mention'
  | 'repost'
  | 'reply'
  | 'follow';
export type ChannelInteractionScoreDirection = 'inbound' | 'outbound';

export const RELATIONSHIP_FORMULA_VERSION = 3;
export const RELATIONSHIP_SCORE_CAP = 40;
export const RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD = 8;
export const RELATIONSHIP_DIRECTIONAL_RATIO = 1.5;
export const RELATIONSHIP_TOUCHED_DIRECTIONAL_RATIO = 2;
export const RELATIONSHIP_WINDOW_DAYS = 30;
export const RELATIONSHIP_CADENCE_DAYS = 3;
export const RELATIONSHIP_HOT_SNOOZE_DAYS = 3;
export const RELATIONSHIP_TRIAGE_SNOOZE_DAYS = 7;
export const RELATIONSHIP_WINDOW_MS =
  RELATIONSHIP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const RELATIONSHIP_CADENCE_MS =
  RELATIONSHIP_CADENCE_DAYS * 24 * 60 * 60 * 1000;
export const RELATIONSHIP_HOT_SNOOZE_MS =
  RELATIONSHIP_HOT_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
export const RELATIONSHIP_TRIAGE_SNOOZE_MS =
  RELATIONSHIP_TRIAGE_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

export type RelationshipTriage =
  | 'quiet'
  | 'hot_lead'
  | 'over_invested'
  | 'mutual';

const SCORES: Record<
  ChannelInteractionScoreKind,
  Record<ChannelInteractionScoreDirection, number>
> = {
  like: { inbound: 2, outbound: 1 },
  mention: { inbound: 4, outbound: 2 },
  repost: { inbound: 6, outbound: 3 },
  reply: { inbound: 8, outbound: 4 },
  follow: { inbound: 10, outbound: 5 },
};

export function getChannelInteractionScore(
  kind: ChannelInteractionScoreKind,
  direction: ChannelInteractionScoreDirection
): number {
  const score = SCORES[kind]?.[direction];
  if (score === undefined) {
    throw new Error('Unsupported interaction kind or direction');
  }
  return score;
}

function assertRelationshipScores(
  effortScore: number,
  reciprocationScore: number
) {
  if (
    !Number.isSafeInteger(effortScore) ||
    !Number.isSafeInteger(reciprocationScore) ||
    effortScore < 0 ||
    reciprocationScore < 0
  ) {
    throw new RangeError('Relationship scores must be non-negative integers');
  }
}

export function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

export function scoreToStars(rawScore: number) {
  if (!Number.isSafeInteger(rawScore) || rawScore < 0) {
    throw new RangeError('Relationship score must be a non-negative integer');
  }
  return roundToHalf(
    1 + 4 * Math.min(rawScore / RELATIONSHIP_SCORE_CAP, 1)
  );
}

export function getRelationshipTriage(
  effortScore: number,
  reciprocationScore: number
): RelationshipTriage {
  assertRelationshipScores(effortScore, reciprocationScore);
  if (
    Math.max(effortScore, reciprocationScore) <
    RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD
  ) {
    return 'quiet';
  }
  const hotRatio =
    effortScore > 0
      ? RELATIONSHIP_TOUCHED_DIRECTIONAL_RATIO
      : RELATIONSHIP_DIRECTIONAL_RATIO;
  if (
    reciprocationScore >= RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD &&
    (effortScore === 0 || reciprocationScore >= hotRatio * effortScore)
  ) {
    return 'hot_lead';
  }
  if (
    effortScore >= RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD &&
    (reciprocationScore === 0 ||
      effortScore >= RELATIONSHIP_DIRECTIONAL_RATIO * reciprocationScore)
  ) {
    return 'over_invested';
  }
  return 'mutual';
}

export function isEngagedNotYet(
  effortScore: number,
  reciprocationScore: number
) {
  return (
    Number.isSafeInteger(effortScore) &&
    Number.isSafeInteger(reciprocationScore) &&
    reciprocationScore > 0 &&
    effortScore === 0
  );
}

export function calculateRelationshipGrade(
  effortScore: number,
  reciprocationScore: number
) {
  assertRelationshipScores(effortScore, reciprocationScore);
  if (effortScore === 0 && reciprocationScore === 0) {
    return {
      reciprocity: null,
      grade: null,
      formulaVersion: RELATIONSHIP_FORMULA_VERSION,
    };
  }
  const reciprocity =
    Math.min(effortScore, reciprocationScore) /
    Math.max(effortScore, reciprocationScore);
  const effort = Math.min(effortScore / RELATIONSHIP_SCORE_CAP, 1);
  const reciprocation = Math.min(reciprocationScore / RELATIONSHIP_SCORE_CAP, 1);
  const priority = Math.min(
    1,
    Math.max(
      0,
      reciprocation +
      Math.min(effort, reciprocation) -
      Math.max(effort - reciprocation, 0)
    )
  );
  return {
    reciprocity,
    grade: roundToHalf(1 + 4 * priority),
    formulaVersion: RELATIONSHIP_FORMULA_VERSION,
  };
}

export const PERSONAL_GRADE_VALUES = [
  1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5,
] as const;

export type PersonalRelationshipGrade = (typeof PERSONAL_GRADE_VALUES)[number];

export function isPersonalRelationshipGrade(
  value: number
): value is PersonalRelationshipGrade {
  return PERSONAL_GRADE_VALUES.includes(value as PersonalRelationshipGrade);
}

export function applyPersonalRelationshipGrade(
  grade: number | null,
  myGrade: number | null
) {
  if (myGrade == null) {
    return grade;
  }
  if (!isPersonalRelationshipGrade(myGrade)) {
    throw new RangeError('Personal grade must be a half-star value between 1 and 5');
  }
  const base = grade == null ? 3 : grade;
  return Math.min(5, Math.max(1, Math.round((base + (myGrade - 3)) * 2) / 2));
}

export const BOT_FORMULA_VERSION = 1;
export const BOT_CONFIDENCE_THRESHOLD = 0.55;
export const BOT_GRADE_VALUES = [1, 2, 3, 4, 5] as const;
export type BotGrade = (typeof BOT_GRADE_VALUES)[number];

export type BotScoreInput = {
  name?: string | null;
  username?: string | null;
  picture?: string | null;
  bio?: string | null;
  followersCount?: number | null;
  followingCount?: number | null;
  accountCreatedAt?: Date | string | null;
  inboundInteractionCount?: number | null;
  noteCount?: number | null;
  likesCount?: number | null;
  relationshipEffortScore?: number | null;
  relationshipReciprocationScore?: number | null;
  now?: Date;
};

export type BotScoreResult = {
  botGrade: BotGrade | null;
  isBot: boolean | null;
  botConfidence: number;
  botFormulaVersion: number;
};

const BOT_SIGNAL_WEIGHTS = {
  sparseProfile: 0.2,
  highFollowRatio: 0.25,
  zeroFollowersMassFollowing: 0.2,
  youngAccountMassFollowing: 0.15,
  usernamePattern: 0.15,
  trackedEngagement: -0.35,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function hasText(value: string | null | undefined, minLength = 1) {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function parseAccountCreatedAt(value: Date | string | null | undefined) {
  if (value == null) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function usernameLooksAutomated(username: string | null | undefined) {
  if (!username) {
    return false;
  }
  const normalized = username.trim().toLowerCase().replace(/^@/, '');
  if (!normalized) {
    return false;
  }
  if (/user\d{4,}/.test(normalized)) {
    return true;
  }
  if (/\d{8,}/.test(normalized)) {
    return true;
  }
  return /[a-z]{2,}\d{6,}$/.test(normalized);
}

function sparseProfileSignal(input: BotScoreInput) {
  const hasIdentityContext =
    input.name != null ||
    input.username != null ||
    input.picture != null ||
    input.bio != null;
  if (!hasIdentityContext) {
    return null;
  }
  const hasPicture = hasText(input.picture);
  const hasBio = hasText(input.bio, 10);
  const name = input.name?.trim().toLowerCase() ?? '';
  const username = input.username?.trim().toLowerCase().replace(/^@/, '') ?? '';
  const nameLooksGeneric =
    !name || (username.length > 0 && name === username);
  return !hasPicture && !hasBio && nameLooksGeneric ? 1 : 0;
}

function followRatioContribution(input: BotScoreInput): {
  highFollowRatio: number | null;
  zeroFollowersMassFollowing: number | null;
} {
  if (
    !Number.isSafeInteger(input.followersCount) ||
    !Number.isSafeInteger(input.followingCount) ||
    input.followersCount! < 0 ||
    input.followingCount! < 0
  ) {
    return { highFollowRatio: null, zeroFollowersMassFollowing: null };
  }
  const followers = input.followersCount!;
  const following = input.followingCount!;
  const ratio = following / Math.max(followers, 1);
  return {
    highFollowRatio: ratio >= 10 ? 1 : ratio >= 5 ? 0.5 : 0,
    zeroFollowersMassFollowing: followers === 0 && following >= 100 ? 1 : 0,
  };
}

function youngAccountMassFollowingSignal(input: BotScoreInput) {
  if (!Number.isSafeInteger(input.followingCount) || input.followingCount! < 0) {
    return null;
  }
  const createdAt = parseAccountCreatedAt(input.accountCreatedAt);
  if (!createdAt) {
    return null;
  }
  const now = input.now ?? new Date();
  const ageMs = now.getTime() - createdAt.getTime();
  if (ageMs < 0) {
    return null;
  }
  return ageMs <= 30 * DAY_MS && input.followingCount! >= 200 ? 1 : 0;
}

function engagementSignal(input: BotScoreInput) {
  const fieldsPresent =
    input.inboundInteractionCount != null ||
    input.noteCount != null ||
    input.likesCount != null ||
    input.relationshipEffortScore != null ||
    input.relationshipReciprocationScore != null;
  if (!fieldsPresent) {
    return null;
  }
  const hasInbound =
    Number.isSafeInteger(input.inboundInteractionCount) &&
    input.inboundInteractionCount! > 0;
  const hasNotes =
    Number.isSafeInteger(input.noteCount) && input.noteCount! > 0;
  const hasLikes =
    Number.isSafeInteger(input.likesCount) && input.likesCount! > 0;
  const hasRelationship =
    (Number.isSafeInteger(input.relationshipEffortScore) &&
      input.relationshipEffortScore! >=
        RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD) ||
    (Number.isSafeInteger(input.relationshipReciprocationScore) &&
      input.relationshipReciprocationScore! >=
        RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD);
  return hasInbound || hasNotes || hasLikes || hasRelationship ? 1 : 0;
}

function scoreToBotGrade(rawScore: number): BotGrade {
  return Math.min(5, Math.max(1, Math.ceil(rawScore * 5))) as BotGrade;
}

export function calculateBotGrade(input: BotScoreInput): BotScoreResult {
  const contributions: Array<{ weight: number; value: number }> = [];

  const sparse = sparseProfileSignal(input);
  if (sparse != null) {
    contributions.push({
      weight: BOT_SIGNAL_WEIGHTS.sparseProfile,
      value: sparse,
    });
  }

  const followSignals = followRatioContribution(input);
  if (followSignals.highFollowRatio != null) {
    contributions.push({
      weight: BOT_SIGNAL_WEIGHTS.highFollowRatio,
      value: followSignals.highFollowRatio,
    });
  }
  if (followSignals.zeroFollowersMassFollowing != null) {
    contributions.push({
      weight: BOT_SIGNAL_WEIGHTS.zeroFollowersMassFollowing,
      value: followSignals.zeroFollowersMassFollowing,
    });
  }

  const young = youngAccountMassFollowingSignal(input);
  if (young != null) {
    contributions.push({
      weight: BOT_SIGNAL_WEIGHTS.youngAccountMassFollowing,
      value: young,
    });
  }

  if (input.username != null || input.name != null) {
    contributions.push({
      weight: BOT_SIGNAL_WEIGHTS.usernamePattern,
      value: usernameLooksAutomated(input.username) ? 1 : 0,
    });
  }

  const engagement = engagementSignal(input);
  if (engagement != null) {
    contributions.push({
      weight: BOT_SIGNAL_WEIGHTS.trackedEngagement,
      value: engagement,
    });
  }

  if (!contributions.length) {
    return {
      botGrade: null,
      isBot: null,
      botConfidence: 0,
      botFormulaVersion: BOT_FORMULA_VERSION,
    };
  }

  const weightMagnitude = contributions.reduce(
    (sum, item) => sum + Math.abs(item.weight),
    0
  );
  const weightedSum = contributions.reduce(
    (sum, item) => sum + item.weight * item.value,
    0
  );
  const maxPositiveWeight = Object.values(BOT_SIGNAL_WEIGHTS)
    .filter((weight) => weight > 0)
    .reduce((sum, weight) => sum + weight, 0);
  const confidence = clamp01(weightMagnitude / maxPositiveWeight);
  const rawScore = clamp01(weightedSum / weightMagnitude);
  const botGrade = scoreToBotGrade(rawScore);
  const isBot =
    confidence < BOT_CONFIDENCE_THRESHOLD
      ? null
      : botGrade >= 4
        ? true
        : botGrade <= 2
          ? false
          : null;

  return {
    botGrade,
    isBot,
    botConfidence: Math.round(confidence * 1000) / 1000,
    botFormulaVersion: BOT_FORMULA_VERSION,
  };
}

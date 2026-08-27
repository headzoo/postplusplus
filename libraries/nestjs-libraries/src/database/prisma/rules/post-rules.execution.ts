import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import {
  PostRuleAction,
  PostRuleCondition,
  PostRuleConditionMatch,
  PostRuleConditionMetric,
  PostRuleConditionOperator,
  PostRuleManualRescheduleConfig,
  PostRuleNormalizedMetrics,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';
import {
  isPollingPostRuleAction,
  POST_RULE_MAX_EVALUATIONS,
} from '@gitroom/nestjs-libraries/database/prisma/rules/post-rules.domain';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * A `PROCESSING` claim older than this is assumed to belong to a worker that
 * died before it could finalize, so a later attempt may take it over. Keep it
 * comfortably above the slowest remote action a single evaluation performs.
 */
export const POST_RULE_STALE_CLAIM_MS = 15 * 60 * 1000;

export const POST_RULE_SKIP_REASONS = [
  'EVALUATION_UNAVAILABLE',
  'RUN_NOT_ACTIVE',
  'RULE_UNAVAILABLE',
  'ASSIGNMENT_REMOVED',
  'POST_UNAVAILABLE',
  'POST_ALREADY_REMOVED',
  'CAPABILITY_UNAVAILABLE',
  'ACTION_CONFIG_UNAVAILABLE',
] as const;

export type PostRuleSkipReason = (typeof POST_RULE_SKIP_REASONS)[number];

export type PostRuleConditionEvaluation =
  | { status: 'EVALUATED'; matched: boolean }
  | { status: 'MISSING_METRICS'; missing: PostRuleConditionMetric[] };

const METRIC_READERS: Record<
  PostRuleConditionMetric,
  (metrics: PostRuleNormalizedMetrics) => number | undefined
> = {
  LIKES: (metrics) => metrics.likes,
  REPLIES: (metrics) => metrics.replies,
};

const compare = (
  value: number,
  operator: PostRuleConditionOperator,
  threshold: number
): boolean => {
  switch (operator) {
    case 'LT':
      return value < threshold;
    case 'LTE':
      return value <= threshold;
    case 'GT':
      return value > threshold;
    case 'GTE':
      return value >= threshold;
    default:
      return false;
  }
};

/**
 * Conditions never fall back to zero: a metric the provider could not report is
 * returned as missing so the caller can fail closed instead of removing a post
 * because analytics were unavailable.
 */
export const evaluatePostRuleConditions = (
  conditions: readonly PostRuleCondition[],
  conditionMatch: PostRuleConditionMatch,
  metrics: PostRuleNormalizedMetrics
): PostRuleConditionEvaluation => {
  if (!conditions.length) {
    return { status: 'EVALUATED', matched: true };
  }

  const missing = conditions
    .filter((condition) => {
      const value = METRIC_READERS[condition.metric]?.(metrics);
      return typeof value !== 'number' || !Number.isFinite(value);
    })
    .map((condition) => condition.metric);

  if (missing.length) {
    return { status: 'MISSING_METRICS', missing };
  }

  const results = conditions.map((condition) =>
    compare(
      METRIC_READERS[condition.metric](metrics) as number,
      condition.operator,
      condition.threshold
    )
  );

  return {
    status: 'EVALUATED',
    matched:
      conditionMatch === 'ALL' ? results.every(Boolean) : results.some(Boolean),
  };
};

export const buildPostRuleNotifyMessage = (input: {
  ruleName: string;
  providerIdentifier: string;
  metrics: PostRuleNormalizedMetrics;
  releaseURL?: string | null;
}): { subject: string; message: string } => {
  const subject = `Rule "${input.ruleName}" matched`;
  const metricParts: string[] = [];
  if (typeof input.metrics.likes === 'number') {
    metricParts.push(`${input.metrics.likes} likes`);
  }
  if (typeof input.metrics.replies === 'number') {
    metricParts.push(`${input.metrics.replies} replies`);
  }
  const metricsText =
    metricParts.length > 0 ? metricParts.join(', ') : 'updated engagement';
  const link = input.releaseURL || `${process.env.FRONTEND_URL || ''}/calendar`;
  const message = `Your ${input.providerIdentifier} post matched rule "${input.ruleName}" (${metricsText}). ${link}`;
  return { subject, message };
};

export const postRuleEvaluationCount = (rule: {
  action: PostRuleAction;
  maxEvaluations: number | null;
}): number => {
  if (!isPollingPostRuleAction(rule.action)) {
    return 1;
  }
  return Math.max(
    1,
    Math.min(rule.maxEvaluations || 1, POST_RULE_MAX_EVALUATIONS)
  );
};

export const postRuleEvaluationScheduledAt = (
  publishedAt: Date,
  rule: {
    action: PostRuleAction;
    initialDelayHours: number;
    evaluationIntervalHours: number | null;
  },
  evaluationIndex: number
): Date => {
  const intervalHours = isPollingPostRuleAction(rule.action)
    ? rule.evaluationIntervalHours || 0
    : 0;
  const hours = rule.initialDelayHours + intervalHours * evaluationIndex;
  return new Date(publishedAt.getTime() + hours * 60 * 60 * 1000);
};

/**
 * Manual reschedule targets are stored as a repeatable offset, so every attempt
 * resolves against the evaluation instant instead of a timestamp that went
 * stale after the first attempt.
 */
export const resolveManualRescheduleDate = (
  config: PostRuleManualRescheduleConfig,
  now: Date
): Date => {
  const zone = (() => {
    try {
      dayjs.utc(now).tz(config.timezone);
      return config.timezone;
    } catch {
      return 'UTC';
    }
  })();

  const [rawHour, rawMinute] = (config.timeOfDay || '').split(':');
  const hour = Number.isInteger(Number(rawHour)) ? Number(rawHour) : 0;
  const minute = Number.isInteger(Number(rawMinute)) ? Number(rawMinute) : 0;
  const reference = dayjs.utc(now).tz(zone);

  let target = reference
    .add(Math.max(0, config.daysAfterEvaluation || 0), 'day')
    .hour(hour)
    .minute(minute)
    .second(0)
    .millisecond(0);

  while (!target.isAfter(reference)) {
    target = target.add(1, 'day');
  }

  return target.utc().toDate();
};

export type PostRuleGroupMember = {
  id: string;
  parentPostId: string | null;
  releaseId: string | null;
  platformDeletedAt: Date | null;
};

/**
 * Remote removal walks a thread from its deepest reply upwards: providers reject
 * or orphan replies whose parent is already gone.
 */
export const orderPostGroupForRemoval = <T extends PostRuleGroupMember>(
  members: readonly T[]
): T[] => {
  const byId = new Map(members.map((member) => [member.id, member]));
  const depth = (member: T): number => {
    let current: PostRuleGroupMember | undefined = member;
    let distance = 0;
    const seen = new Set<string>();
    while (current?.parentPostId && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parentPostId);
      if (!current) {
        break;
      }
      distance += 1;
    }
    return distance;
  };

  return [...members].sort(
    (first, second) =>
      depth(second) - depth(first) || first.id.localeCompare(second.id)
  );
};

/**
 * The successor group doubles as the idempotency key for the reschedule side
 * effect: an activity retry finds the group that a previous attempt created
 * instead of publishing the same content twice.
 */
export const postRuleSuccessorKey = (
  runId: string,
  evaluationIndex: number
): string => `rule_${runId}_${evaluationIndex}`;

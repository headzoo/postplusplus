import {
  PostRuleAction,
  PostRuleCondition,
  PostRuleConditionMatch,
  PostRuleConditionOperator,
  PostRuleListItemResponse,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';

export const RULES_EMPTY_STATE_CUTOVER_NOTE =
  'Create a Rule to automate post lifecycle based on engagement. Legacy Plugs were not migrated — recreate your rules and channel or Pipeline assignments here.';

export const filterRulesByChannel = (
  rules: PostRuleListItemResponse[],
  channelId?: string
): PostRuleListItemResponse[] => {
  if (!channelId) {
    return rules;
  }

  return rules.filter((rule) => rule.integrationIds.includes(channelId));
};

export const formatActionLabel = (action: PostRuleAction): string => {
  switch (action) {
    case 'REMOVE':
      return 'Remove';
    case 'AUTO_REPOST':
      return 'Auto Repost';
    case 'AUTO_PLUG':
      return 'Auto Plug';
    case 'NOTIFY':
      return 'Notify';
    default:
      return action;
  }
};

export const formatMetricLabel = (metric: string): string => {
  switch (metric) {
    case 'LIKES':
      return 'Likes';
    case 'REPLIES':
      return 'Replies';
    default:
      return metric;
  }
};

export const formatOperatorSymbol = (
  operator: PostRuleConditionOperator
): string => {
  switch (operator) {
    case 'LT':
      return '<';
    case 'LTE':
      return '≤';
    case 'GT':
      return '>';
    case 'GTE':
      return '≥';
    default:
      return operator;
  }
};

export const formatOperatorLabel = (
  operator: PostRuleConditionOperator
): string => {
  switch (operator) {
    case 'LT':
      return 'less than';
    case 'LTE':
      return 'less than or equal to';
    case 'GT':
      return 'greater than';
    case 'GTE':
      return 'greater than or equal to';
    default:
      return operator;
  }
};

export const formatConditionPreview = (
  conditionMatch: PostRuleConditionMatch,
  conditions: PostRuleCondition[]
): string => {
  if (conditions.length === 0) {
    return 'No conditions';
  }

  const parts = conditions.map((c) => {
    const metric = formatMetricLabel(c.metric);
    const operator = formatOperatorLabel(c.operator);
    return `${metric} ${operator} ${c.threshold}`;
  });

  if (parts.length === 1) {
    return parts[0];
  }

  const joiner = conditionMatch === 'ANY' ? ' OR ' : ' AND ';
  return parts.join(joiner);
};

export const formatTimingPreview = (
  action: PostRuleAction,
  initialDelayHours: number,
  evaluationIntervalHours?: number | null,
  maxEvaluations?: number | null
): string => {
  const initial =
    initialDelayHours === 0
      ? 'immediately'
      : initialDelayHours === 1
      ? '1 hour'
      : `${initialDelayHours} hours`;

  if (action === 'REMOVE') {
    return `Evaluate ${initial} after publish`;
  }

  if (!evaluationIntervalHours || !maxEvaluations) {
    return `Evaluate ${initial} after publish`;
  }

  const interval =
    evaluationIntervalHours === 1
      ? '1 hour'
      : `${evaluationIntervalHours} hours`;

  return `Evaluate ${initial} after publish, then every ${interval} (max ${maxEvaluations}×)`;
};

export const formatReschedulePreview = (
  rescheduleConfig:
    | {
        mode: 'MANUAL';
        daysAfterEvaluation: number;
        timeOfDay: string;
        timezone: string;
      }
    | { mode: 'PIPELINE'; pipelineId: string }
    | null,
  maxRescheduleAttempts?: number | null
): string | null => {
  if (!rescheduleConfig) {
    return null;
  }

  const attemptsStr = maxRescheduleAttempts
    ? ` (max ${maxRescheduleAttempts}×)`
    : '';

  if (rescheduleConfig.mode === 'MANUAL') {
    const days =
      rescheduleConfig.daysAfterEvaluation === 0
        ? 'same day'
        : rescheduleConfig.daysAfterEvaluation === 1
        ? '1 day'
        : `${rescheduleConfig.daysAfterEvaluation} days`;
    return `Reschedule ${days} after evaluation at ${rescheduleConfig.timeOfDay} (${rescheduleConfig.timezone})${attemptsStr}`;
  }

  return `Reschedule to Pipeline${attemptsStr}`;
};

import {
  PostRuleAction,
  PostRuleActionConfig,
  PostRuleCondition,
  PostRuleConditionMetric,
  PostRuleRescheduleConfig,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';

export const POST_RULE_MAX_EVALUATIONS = 50;
export const POST_RULE_MAX_DELAY_HOURS = 8760;
export const POST_RULE_MAX_RESCHEDULE_ATTEMPTS = 100;

export const isPollingPostRuleAction = (action: PostRuleAction): boolean =>
  action === 'AUTO_REPOST' || action === 'AUTO_PLUG' || action === 'NOTIFY';

const ABSOLUTE_RESCHEDULE_KEYS = new Set([
  'date',
  'scheduledAt',
  'publishDate',
  'absoluteDate',
  'timestamp',
]);

export type PostRuleDefinitionValidationIssue = {
  property: string;
  message: string;
};

export type PostRuleDefinitionInput = {
  action: PostRuleAction;
  initialDelayHours: number;
  evaluationIntervalHours?: number | null;
  maxEvaluations?: number | null;
  conditions: PostRuleCondition[];
  actionConfig?: PostRuleActionConfig | null;
  rescheduleConfig?: PostRuleRescheduleConfig | null;
  maxRescheduleAttempts?: number | null;
};

export const hasDuplicateConditionMetrics = (
  conditions: PostRuleCondition[]
): boolean => {
  const seen = new Set<PostRuleConditionMetric>();
  for (const condition of conditions) {
    if (seen.has(condition.metric)) {
      return true;
    }
    seen.add(condition.metric);
  }
  return false;
};

export const containsAbsoluteRescheduleTimestamp = (
  value: unknown
): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (ABSOLUTE_RESCHEDULE_KEYS.has(key)) {
      return true;
    }
    if (containsAbsoluteRescheduleTimestamp(nested)) {
      return true;
    }
  }

  return false;
};

export const validatePostRuleDefinition = (
  input: PostRuleDefinitionInput
): PostRuleDefinitionValidationIssue[] => {
  const issues: PostRuleDefinitionValidationIssue[] = [];

  if (input.initialDelayHours < 0) {
    issues.push({
      property: 'initialDelayHours',
      message: 'initialDelayHours must be nonnegative',
    });
  }

  if (input.initialDelayHours > POST_RULE_MAX_DELAY_HOURS) {
    issues.push({
      property: 'initialDelayHours',
      message: `initialDelayHours must be at most ${POST_RULE_MAX_DELAY_HOURS}`,
    });
  }

  if (hasDuplicateConditionMetrics(input.conditions)) {
    issues.push({
      property: 'conditions',
      message: 'each condition metric may appear only once',
    });
  }

  const isPollingAction = isPollingPostRuleAction(input.action);

  if (isPollingAction) {
    if (
      input.evaluationIntervalHours == null ||
      input.evaluationIntervalHours < 1
    ) {
      issues.push({
        property: 'evaluationIntervalHours',
        message:
          'evaluationIntervalHours is required and must be at least 1 for polling actions',
      });
    } else if (input.evaluationIntervalHours > POST_RULE_MAX_DELAY_HOURS) {
      issues.push({
        property: 'evaluationIntervalHours',
        message: `evaluationIntervalHours must be at most ${POST_RULE_MAX_DELAY_HOURS}`,
      });
    }

    if (input.maxEvaluations == null || input.maxEvaluations < 1) {
      issues.push({
        property: 'maxEvaluations',
        message:
          'maxEvaluations is required and must be at least 1 for polling actions',
      });
    } else if (input.maxEvaluations > POST_RULE_MAX_EVALUATIONS) {
      issues.push({
        property: 'maxEvaluations',
        message: `maxEvaluations must be at most ${POST_RULE_MAX_EVALUATIONS}`,
      });
    }
  } else if (
    input.evaluationIntervalHours != null ||
    input.maxEvaluations != null
  ) {
    issues.push({
      property: 'action',
      message: 'evaluation timing fields are only valid for polling actions',
    });
  }

  if (input.action === 'AUTO_PLUG') {
    const content = (input.actionConfig as { content?: string } | null)
      ?.content;
    if (!content || content.trim().length < 3) {
      issues.push({
        property: 'actionConfig.content',
        message:
          'AUTO_PLUG requires actionConfig.content with at least 3 characters',
      });
    }
  }

  if (input.action !== 'REMOVE') {
    if (input.rescheduleConfig != null) {
      issues.push({
        property: 'rescheduleConfig',
        message: 'rescheduleConfig is only valid for REMOVE actions',
      });
    }
    if (input.maxRescheduleAttempts != null) {
      issues.push({
        property: 'maxRescheduleAttempts',
        message: 'maxRescheduleAttempts is only valid for REMOVE actions',
      });
    }
  }

  if (input.rescheduleConfig != null) {
    if (containsAbsoluteRescheduleTimestamp(input.rescheduleConfig)) {
      issues.push({
        property: 'rescheduleConfig',
        message:
          'rescheduleConfig must use repeatable relative scheduling, not absolute timestamps',
      });
    }

    if (
      input.maxRescheduleAttempts == null ||
      input.maxRescheduleAttempts < 1
    ) {
      issues.push({
        property: 'maxRescheduleAttempts',
        message:
          'maxRescheduleAttempts is required and must be at least 1 when rescheduling is enabled',
      });
    } else if (
      input.maxRescheduleAttempts > POST_RULE_MAX_RESCHEDULE_ATTEMPTS
    ) {
      issues.push({
        property: 'maxRescheduleAttempts',
        message: `maxRescheduleAttempts must be at most ${POST_RULE_MAX_RESCHEDULE_ATTEMPTS}`,
      });
    }

    if (input.rescheduleConfig.mode === 'MANUAL') {
      if (
        input.rescheduleConfig.daysAfterEvaluation < 0 ||
        input.rescheduleConfig.daysAfterEvaluation > 365
      ) {
        issues.push({
          property: 'rescheduleConfig.daysAfterEvaluation',
          message: 'daysAfterEvaluation must be between 0 and 365',
        });
      }
    }

    if (
      input.rescheduleConfig.mode === 'PIPELINE' &&
      !input.rescheduleConfig.pipelineId?.trim()
    ) {
      issues.push({
        property: 'rescheduleConfig.pipelineId',
        message: 'pipeline reschedule requires a pipelineId',
      });
    }
  }

  return issues;
};

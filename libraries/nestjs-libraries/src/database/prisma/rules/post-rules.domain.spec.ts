import {
  containsAbsoluteRescheduleTimestamp,
  hasDuplicateConditionMetrics,
  validatePostRuleDefinition,
} from './post-rules.domain';

describe('post-rules.domain', () => {
  it('detects duplicate condition metrics', () => {
    expect(
      hasDuplicateConditionMetrics([
        { metric: 'LIKES', operator: 'LT', threshold: 1 },
        { metric: 'LIKES', operator: 'LT', threshold: 2 },
      ])
    ).toBe(true);
  });

  it('flags absolute reschedule timestamps', () => {
    expect(
      containsAbsoluteRescheduleTimestamp({
        mode: 'MANUAL',
        publishDate: '2026-01-01T00:00:00.000Z',
      })
    ).toBe(true);
  });

  it('accepts unconditional removal definitions', () => {
    expect(
      validatePostRuleDefinition({
        action: 'REMOVE',
        initialDelayHours: 12,
        conditions: [],
      })
    ).toHaveLength(0);
  });

  it('requires bounded polling configuration', () => {
    const issues = validatePostRuleDefinition({
      action: 'AUTO_REPOST',
      initialDelayHours: 6,
      conditions: [{ metric: 'LIKES', operator: 'GTE', threshold: 5 }],
    });
    expect(issues.map((issue) => issue.property)).toEqual(
      expect.arrayContaining(['evaluationIntervalHours', 'maxEvaluations'])
    );
  });

  it('requires bounded polling configuration for NOTIFY', () => {
    const issues = validatePostRuleDefinition({
      action: 'NOTIFY',
      initialDelayHours: 1,
      conditions: [{ metric: 'REPLIES', operator: 'GTE', threshold: 1 }],
    });
    expect(issues.map((issue) => issue.property)).toEqual(
      expect.arrayContaining(['evaluationIntervalHours', 'maxEvaluations'])
    );
  });

  it('accepts a valid NOTIFY definition', () => {
    expect(
      validatePostRuleDefinition({
        action: 'NOTIFY',
        initialDelayHours: 1,
        evaluationIntervalHours: 6,
        maxEvaluations: 8,
        conditions: [{ metric: 'REPLIES', operator: 'GTE', threshold: 1 }],
      })
    ).toHaveLength(0);
  });

  it('rejects reschedule config for NOTIFY', () => {
    const issues = validatePostRuleDefinition({
      action: 'NOTIFY',
      initialDelayHours: 1,
      evaluationIntervalHours: 6,
      maxEvaluations: 3,
      conditions: [],
      rescheduleConfig: {
        mode: 'PIPELINE',
        pipelineId: 'pipeline-1',
      },
      maxRescheduleAttempts: 1,
    });
    expect(issues.map((issue) => issue.property)).toEqual(
      expect.arrayContaining(['rescheduleConfig', 'maxRescheduleAttempts'])
    );
  });

  it('requires maxRescheduleAttempts when rescheduling', () => {
    const issues = validatePostRuleDefinition({
      action: 'REMOVE',
      initialDelayHours: 24,
      conditions: [],
      rescheduleConfig: {
        mode: 'PIPELINE',
        pipelineId: 'pipeline-1',
      },
    });
    expect(
      issues.some((issue) => issue.property === 'maxRescheduleAttempts')
    ).toBe(true);
  });
});

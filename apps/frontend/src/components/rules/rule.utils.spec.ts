import {
  RULES_EMPTY_STATE_CUTOVER_NOTE,
  filterRulesByChannel,
  formatActionLabel,
} from './rule.utils';
import { PostRuleListItemResponse } from '@gitroom/nestjs-libraries/dtos/rules/rule.types';

const listItem = (
  overrides: Partial<PostRuleListItemResponse> = {}
): PostRuleListItemResponse => ({
  id: 'rule-1',
  name: 'Test Rule',
  enabled: true,
  action: 'REMOVE',
  initialDelayHours: 24,
  evaluationIntervalHours: null,
  maxEvaluations: null,
  conditionMatch: 'ANY',
  conditions: [],
  integrationIds: ['channel-1'],
  integrationCount: 1,
  pipelineCount: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('rule.utils cutover copy', () => {
  it('explains legacy Plugs were not migrated and must be recreated', () => {
    expect(RULES_EMPTY_STATE_CUTOVER_NOTE).toMatch(
      /legacy plugs were not migrated/i
    );
    expect(RULES_EMPTY_STATE_CUTOVER_NOTE).toMatch(/recreate/i);
    expect(RULES_EMPTY_STATE_CUTOVER_NOTE).not.toMatch(/\/plugs/);
  });
});

describe('formatActionLabel', () => {
  it('labels known post-rule actions', () => {
    expect(formatActionLabel('REMOVE')).toBe('Remove');
    expect(formatActionLabel('AUTO_REPOST')).toBe('Auto Repost');
    expect(formatActionLabel('AUTO_PLUG')).toBe('Auto Plug');
    expect(formatActionLabel('NOTIFY')).toBe('Notify');
  });
});

describe('filterRulesByChannel', () => {
  it('returns all rules when no channel is selected', () => {
    const rules = [
      listItem({ id: 'rule-1', integrationIds: ['channel-1'] }),
      listItem({ id: 'rule-2', integrationIds: ['channel-2'] }),
    ];

    expect(filterRulesByChannel(rules)).toEqual(rules);
    expect(filterRulesByChannel(rules, undefined)).toEqual(rules);
  });

  it('returns only rules assigned to the selected channel', () => {
    const rules = [
      listItem({ id: 'rule-1', integrationIds: ['channel-1', 'channel-2'] }),
      listItem({ id: 'rule-2', integrationIds: ['channel-2'] }),
      listItem({ id: 'rule-3', integrationIds: [] }),
    ];

    expect(filterRulesByChannel(rules, 'channel-1')).toEqual([rules[0]]);
    expect(filterRulesByChannel(rules, 'channel-2')).toEqual([
      rules[0],
      rules[1],
    ]);
    expect(filterRulesByChannel(rules, 'channel-3')).toEqual([]);
  });
});

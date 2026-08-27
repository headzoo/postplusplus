'use client';

import { FC, useCallback } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  PostRuleAction,
  PostRuleCondition,
  PostRuleConditionMatch,
  PostRuleConditionMetric,
  PostRuleConditionOperator,
  PostRuleCapabilitiesResponse,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';
import { formatOperatorLabel } from '@gitroom/frontend/components/rules/rule.utils';

export const ConditionEditor: FC<{
  action: PostRuleAction;
  capabilities: PostRuleCapabilitiesResponse;
  conditionMatch: PostRuleConditionMatch;
  conditions: PostRuleCondition[];
  onConditionMatchChange: (match: PostRuleConditionMatch) => void;
  onConditionsChange: (conditions: PostRuleCondition[]) => void;
}> = ({
  action,
  capabilities,
  conditionMatch,
  conditions,
  onConditionMatchChange,
  onConditionsChange,
}) => {
  const t = useT();

  const availableMetrics =
    capabilities.actions.find((a) => a.key === action)?.metrics || [];

  const addCondition = useCallback(() => {
    const defaultMetric = availableMetrics[0]?.key || 'LIKES';
    onConditionsChange([
      ...conditions,
      {
        metric: defaultMetric as PostRuleConditionMetric,
        operator: 'LT',
        threshold: 10,
      },
    ]);
  }, [conditions, availableMetrics, onConditionsChange]);

  const removeCondition = useCallback(
    (index: number) => {
      onConditionsChange(conditions.filter((_, i) => i !== index));
    },
    [conditions, onConditionsChange]
  );

  const updateCondition = useCallback(
    (index: number, updates: Partial<PostRuleCondition>) => {
      onConditionsChange(
        conditions.map((c, i) => (i === index ? { ...c, ...updates } : c))
      );
    },
    [conditions, onConditionsChange]
  );

  return (
    <div className="flex flex-col gap-[12px] rounded-[8px] border border-newBorder bg-newBgColor p-[16px]">
      {conditions.length === 0 ? (
        <div className="text-[14px] opacity-70 text-center py-[12px]">
          {t(
            'no_conditions',
            'No conditions defined. The action will always execute.'
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-[8px]">
            <span className="text-[14px] font-[600]">
              {t('execute_when', 'Execute when')}
            </span>
            <select
              value={conditionMatch}
              onChange={(e) =>
                onConditionMatchChange(e.target.value as PostRuleConditionMatch)
              }
              className="h-[36px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[8px] text-[14px] outline-none flex-shrink-0"
            >
              <option value="ANY">{t('any', 'ANY')}</option>
              <option value="ALL">{t('all', 'ALL')}</option>
            </select>
            <span className="text-[14px] font-[600]">
              {t('of_the_following', 'of the following:')}
            </span>
          </div>

          <div className="flex flex-col gap-[8px]">
            {conditions.map((condition, index) => (
              <div
                key={index}
                className="flex items-center gap-[8px] flex-wrap"
              >
                <select
                  value={condition.metric}
                  onChange={(e) =>
                    updateCondition(index, {
                      metric: e.target.value as PostRuleConditionMetric,
                    })
                  }
                  className="h-[36px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[8px] text-[14px] outline-none flex-shrink-0"
                >
                  {availableMetrics.map((metric) => (
                    <option key={metric.key} value={metric.key}>
                      {metric.label}
                    </option>
                  ))}
                </select>
                <select
                  value={condition.operator}
                  onChange={(e) =>
                    updateCondition(index, {
                      operator: e.target.value as PostRuleConditionOperator,
                    })
                  }
                  className="h-[36px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[8px] text-[14px] outline-none flex-shrink-0"
                >
                  <option value="LT">{formatOperatorLabel('LT')}</option>
                  <option value="LTE">{formatOperatorLabel('LTE')}</option>
                  <option value="GT">{formatOperatorLabel('GT')}</option>
                  <option value="GTE">{formatOperatorLabel('GTE')}</option>
                </select>
                <input
                  type="number"
                  min={0}
                  max={1000000000}
                  value={condition.threshold}
                  onChange={(e) =>
                    updateCondition(index, {
                      threshold: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="h-[36px] w-[120px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[8px] text-[14px] outline-none"
                />
                <Button
                  secondary
                  onClick={() => removeCondition(index)}
                  className="!px-[12px]"
                >
                  {t('remove', 'Remove')}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <div>
        <Button
          secondary
          onClick={addCondition}
          disabled={availableMetrics.length === 0}
        >
          {t('add_condition', 'Add Condition')}
        </Button>
      </div>

      {availableMetrics.length === 0 && (
        <p className="text-[12px] text-yellow-500">
          {t(
            'no_metrics_available',
            'This action does not have supported metrics for conditions. The action will always execute.'
          )}
        </p>
      )}
    </div>
  );
};

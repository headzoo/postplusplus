'use client';

import { FC, useCallback } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useRuleAssignmentOptions } from '@gitroom/frontend/components/rules/use.rule.assignment.options';
import {
  PostRuleAction,
  PostRuleConditionMetric,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';

export const RuleAssignmentPicker: FC<{
  action: PostRuleAction;
  metrics: PostRuleConditionMetric[];
  integrationIds: string[];
  pipelineIds: string[];
  onIntegrationIdsChange: (ids: string[]) => void;
  onPipelineIdsChange: (ids: string[]) => void;
}> = ({
  action,
  metrics,
  integrationIds,
  pipelineIds,
  onIntegrationIdsChange,
  onPipelineIdsChange,
}) => {
  const t = useT();
  const { integrationOptions, pipelineOptions, isLoading } =
    useRuleAssignmentOptions(action, metrics);

  const toggleIntegration = useCallback(
    (id: string) => {
      const newIds = integrationIds.includes(id)
        ? integrationIds.filter((i) => i !== id)
        : [...integrationIds, id];
      onIntegrationIdsChange(newIds);
    },
    [integrationIds, onIntegrationIdsChange]
  );

  const togglePipeline = useCallback(
    (id: string) => {
      const newIds = pipelineIds.includes(id)
        ? pipelineIds.filter((i) => i !== id)
        : [...pipelineIds, id];
      onPipelineIdsChange(newIds);
    },
    [pipelineIds, onPipelineIdsChange]
  );

  if (isLoading) {
    return (
      <div className="text-[14px] opacity-70">{t('loading', 'Loading...')}</div>
    );
  }

  return (
    <div className="flex flex-col gap-[12px] rounded-[8px] border border-newBorder bg-newBgColor p-[16px]">
      <div className="flex flex-col gap-[12px]">
        <div className="text-[14px] font-[600]">
          {t('channels', 'Channels')}
        </div>
        {integrationOptions.length === 0 ? (
          <div className="text-[14px] opacity-70">
            {t('no_channels_available', 'No channels available.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[8px]">
            {integrationOptions.map((option) => (
              <label
                key={option.id}
                className={clsx(
                  'flex items-center gap-[8px] p-[8px] rounded-[8px] border border-newBorder cursor-pointer hover:bg-newBgColorInner',
                  integrationIds.includes(option.id) && 'bg-newBgColorInner',
                  option.disabled && 'opacity-50 cursor-not-allowed'
                )}
                title={option.disabledReason}
              >
                <input
                  type="checkbox"
                  checked={integrationIds.includes(option.id)}
                  onChange={() => toggleIntegration(option.id)}
                  disabled={option.disabled}
                  className="w-[16px] h-[16px]"
                />
                <div className="flex items-center gap-[8px] flex-1 min-w-0">
                  {option.identifier && (
                    <img
                      src={`/icons/platforms/${option.identifier}.png`}
                      className="w-[20px] h-[20px] rounded-[4px] shrink-0"
                      alt={option.identifier}
                    />
                  )}
                  <span className="text-[14px] truncate">{option.name}</span>
                </div>
                {option.disabled && (
                  <span className="text-[11px] text-yellow-500 shrink-0">
                    {t('incompatible', 'Incompatible')}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-[12px]">
        <div className="text-[14px] font-[600]">
          {t('pipelines', 'Pipelines')}
        </div>
        {pipelineOptions.length === 0 ? (
          <div className="text-[14px] opacity-70">
            {t('no_active_pipelines', 'No active Pipelines available.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[8px]">
            {pipelineOptions.map((option) => (
              <label
                key={option.id}
                className={clsx(
                  'flex items-center gap-[8px] p-[8px] rounded-[8px] border border-newBorder cursor-pointer hover:bg-newBgColorInner',
                  pipelineIds.includes(option.id) && 'bg-newBgColorInner'
                )}
              >
                <input
                  type="checkbox"
                  checked={pipelineIds.includes(option.id)}
                  onChange={() => togglePipeline(option.id)}
                  className="w-[16px] h-[16px]"
                />
                <span className="text-[14px] truncate">{option.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="text-[12px] opacity-70">
        {t(
          'assignments_note',
          'Select channels and/or Pipelines where this Rule should apply. Incompatible channels (those that do not support the action or metrics) are disabled.'
        )}
      </div>
    </div>
  );
};

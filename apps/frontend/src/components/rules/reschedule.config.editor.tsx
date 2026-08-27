'use client';

import { FC, useCallback } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { usePipelineList } from '@gitroom/frontend/components/pipelines/use.pipeline.list';
import { PostRuleRescheduleConfig } from '@gitroom/nestjs-libraries/dtos/rules/rule.types';

export const RescheduleConfigEditor: FC<{
  rescheduleConfig: PostRuleRescheduleConfig | null;
  maxRescheduleAttempts: number | undefined;
  onRescheduleConfigChange: (config: PostRuleRescheduleConfig | null) => void;
  onMaxRescheduleAttemptsChange: (attempts: number | undefined) => void;
}> = ({
  rescheduleConfig,
  maxRescheduleAttempts,
  onRescheduleConfigChange,
  onMaxRescheduleAttemptsChange,
}) => {
  const t = useT();
  const { data: pipelines = [] } = usePipelineList();
  const activePipelines = pipelines.filter((p) => p.active);

  const handleModeChange = useCallback(
    (mode: string) => {
      if (mode === 'NONE') {
        onRescheduleConfigChange(null);
        onMaxRescheduleAttemptsChange(undefined);
      } else if (mode === 'MANUAL') {
        onRescheduleConfigChange({
          mode: 'MANUAL',
          daysAfterEvaluation: 1,
          timeOfDay: '09:00',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        onMaxRescheduleAttemptsChange(3);
      } else if (mode === 'PIPELINE') {
        const firstPipeline = activePipelines[0];
        if (firstPipeline) {
          onRescheduleConfigChange({
            mode: 'PIPELINE',
            pipelineId: firstPipeline.id,
          });
          onMaxRescheduleAttemptsChange(3);
        }
      }
    },
    [activePipelines, onRescheduleConfigChange, onMaxRescheduleAttemptsChange]
  );

  const currentMode = !rescheduleConfig
    ? 'NONE'
    : rescheduleConfig.mode === 'MANUAL'
    ? 'MANUAL'
    : 'PIPELINE';

  return (
    <div className="flex flex-col gap-[12px] rounded-[8px] border border-newBorder bg-newBgColor p-[16px]">
      <div className="flex flex-col gap-[8px]">
        <label className="text-[14px] font-[600]">{t('mode', 'Mode')}</label>
        <select
          value={currentMode}
          onChange={(e) => handleModeChange(e.target.value)}
          className="h-[44px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[12px] text-[14px] outline-none"
        >
          <option value="NONE">
            {t('do_not_reschedule', 'Do not reschedule')}
          </option>
          <option value="MANUAL">
            {t('manual_reschedule', 'Manual reschedule')}
          </option>
          <option value="PIPELINE">
            {t('pipeline_reschedule', 'Pipeline reschedule')}
          </option>
        </select>
      </div>

      {rescheduleConfig?.mode === 'MANUAL' && (
        <>
          <div className="flex flex-col gap-[8px]">
            <label className="text-[14px] font-[600]">
              {t('days_after_evaluation', 'Days after evaluation')}
            </label>
            <input
              type="number"
              min={0}
              max={365}
              value={rescheduleConfig.daysAfterEvaluation}
              onChange={(e) =>
                onRescheduleConfigChange({
                  ...rescheduleConfig,
                  daysAfterEvaluation: parseInt(e.target.value, 10) || 0,
                })
              }
              className="h-[44px] w-full rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] text-[14px] outline-none"
            />
            <p className="text-[12px] opacity-70">
              {t(
                'days_after_evaluation_description',
                '0 = same day; 1+ = that many days after evaluation completes.'
              )}
            </p>
          </div>

          <div className="flex flex-col gap-[8px]">
            <label className="text-[14px] font-[600]">
              {t('time_of_day', 'Time of day (HH:MM)')}
            </label>
            <input
              type="time"
              value={rescheduleConfig.timeOfDay}
              onChange={(e) =>
                onRescheduleConfigChange({
                  ...rescheduleConfig,
                  timeOfDay: e.target.value,
                })
              }
              className="h-[44px] w-full rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] text-[14px] outline-none"
            />
          </div>

          <div className="flex flex-col gap-[8px]">
            <label className="text-[14px] font-[600]">
              {t('timezone', 'Timezone')}
            </label>
            <input
              type="text"
              value={rescheduleConfig.timezone}
              onChange={(e) =>
                onRescheduleConfigChange({
                  ...rescheduleConfig,
                  timezone: e.target.value,
                })
              }
              className="h-[44px] w-full rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] text-[14px] outline-none"
            />
            <p className="text-[12px] opacity-70">
              {t(
                'timezone_description',
                'IANA timezone identifier (e.g., America/New_York).'
              )}
            </p>
          </div>
        </>
      )}

      {rescheduleConfig?.mode === 'PIPELINE' && (
        <div className="flex flex-col gap-[8px]">
          <label className="text-[14px] font-[600]">
            {t('pipeline', 'Pipeline')}
          </label>
          <select
            value={rescheduleConfig.pipelineId}
            onChange={(e) =>
              onRescheduleConfigChange({
                ...rescheduleConfig,
                pipelineId: e.target.value,
              })
            }
            className="h-[44px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[12px] text-[14px] outline-none"
          >
            {activePipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
          {activePipelines.length === 0 && (
            <p className="text-[12px] text-yellow-500">
              {t(
                'no_active_pipelines',
                'No active Pipelines available. Create a Pipeline first.'
              )}
            </p>
          )}
        </div>
      )}

      {rescheduleConfig && (
        <div className="flex flex-col gap-[8px]">
          <label className="text-[14px] font-[600]">
            {t('max_reschedule_attempts', 'Max reschedule attempts')}
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={maxRescheduleAttempts ?? ''}
            onChange={(e) =>
              onMaxRescheduleAttemptsChange(
                parseInt(e.target.value, 10) || undefined
              )
            }
            className="h-[44px] w-full rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] text-[14px] outline-none"
          />
          <p className="text-[12px] opacity-70">
            {t(
              'max_reschedule_attempts_description',
              'Maximum number of times to reschedule and re-attempt removal.'
            )}
          </p>
        </div>
      )}
    </div>
  );
};

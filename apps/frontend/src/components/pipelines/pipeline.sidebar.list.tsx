'use client';

import { FC, KeyboardEvent, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { SVGLine } from '@gitroom/frontend/components/launches/launches.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PipelineChannels } from '@gitroom/frontend/components/pipelines/pipeline.channels';
import { PipelineSummary } from '@gitroom/frontend/components/pipelines/pipeline.types';

export const PipelineSidebarList: FC<{
  collapsed: boolean;
  pipelines: PipelineSummary[];
  selectedPipelineId?: string;
  isLoading?: boolean;
  error?: unknown;
  onSelectPipeline: (pipeline: PipelineSummary) => void;
  activeOnly?: boolean;
}> = ({
  pipelines,
  selectedPipelineId,
  isLoading,
  error,
  onSelectPipeline,
  activeOnly = false,
}) => {
    const t = useT();
    const pipelinesLabel = t('pipelines', 'Pipelines');

    const visiblePipelines = useMemo(
      () =>
        activeOnly
          ? pipelines.filter((pipeline) => pipeline.active)
          : pipelines,
      [activeOnly, pipelines]
    );

    const handlePipelineKeyDown = useCallback(
      (pipeline: PipelineSummary) => (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectPipeline(pipeline);
        }
      },
      [onSelectPipeline]
    );

    return (
      <div
        className="pt-[20px] border-t border-newBorder flex flex-col gap-[15px]"
        role="radiogroup"
        aria-label={pipelinesLabel}
      >
        <h2 className="group-[.sidebar]:hidden text-[20px] font-[500]">
          {pipelinesLabel}
        </h2>

        {isLoading && (
          <div className="text-[13px] opacity-60 group-[.sidebar]:hidden">
            {t('loading', 'Loading...')}
          </div>
        )}

        {!!error && !isLoading && (
          <div className="text-[13px] text-red-500 group-[.sidebar]:hidden">
            {t(
              'pipelines_load_error',
              'Failed to load Pipelines. Please refresh and try again.'
            )}
          </div>
        )}

        {!isLoading && !error && !visiblePipelines.length && (
          <div className="text-[13px] opacity-60 group-[.sidebar]:hidden">
            {activeOnly
              ? t('no_active_pipelines', 'No active Pipelines')
              : t('no_pipelines_yet', 'No Pipelines yet')}
          </div>
        )}

        {visiblePipelines.map((pipeline) => {
          const isSelected = selectedPipelineId === pipeline.id;

          return (
            <div
              key={pipeline.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              title={pipeline.name}
              onClick={() => onSelectPipeline(pipeline)}
              onKeyDown={handlePipelineKeyDown(pipeline)}
              className={clsx(
                'relative flex gap-[12px] items-center group/pipeline justify-center hover:bg-boxHover rounded-e-[8px] hover:opacity-100 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary',
                !isSelected && 'opacity-20'
              )}
            >
              <div className="absolute start-0 top-0 bottom-0 w-[4px] -ms-[12px] rounded-s-[3px] opacity-0 group-hover/pipeline:opacity-100 transition-opacity">
                <SVGLine />
              </div>
              <div className="group-[.sidebar]:flex hidden">
                <PipelineChannels channels={pipeline.channels} compact />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-[4px] group-[.sidebar]:hidden">
                <div className="flex items-center gap-[8px] min-w-0">
                  <span className="flex-1 whitespace-nowrap text-ellipsis overflow-hidden">
                    {pipeline.name}
                  </span>
                  <div
                    className="w-[12px] h-[12px] rounded-full shrink-0 border border-newBorder"
                    style={{ backgroundColor: pipeline.color }}
                    aria-hidden="true"
                  />
                </div>
                <PipelineChannels channels={pipeline.channels} compact />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

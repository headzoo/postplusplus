'use client';

import {
  FC,
  Fragment,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useDrag, useDrop } from 'react-dnd';
import { Button } from '@gitroom/react/form/button';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { getTimezone } from '@gitroom/frontend/components/layout/set.timezone';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ChevronLeftIcon } from '@gitroom/frontend/components/ui/icons';
import {
  ChannelMenu,
  ChannelsSidebar,
} from '@gitroom/frontend/components/launches/channels.sidebar';
import {
  resolveChannelId,
  setLastChannelId,
} from '@gitroom/frontend/components/launches/helpers/last-channel';
import {
  IntegrationListItem,
  useIntegrationList,
} from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import {
  filterPipelinesByChannel,
  filterScheduleOccurrencesByChannel,
  filterScheduleOccurrencesByPipeline,
  getPipelineScheduleWeek,
  getReadableForegroundColor,
  minuteOfDayToTime,
  PIPELINE_DAYS,
  PIPELINE_SCHEDULE_DRAG_TYPE,
  convertDisplayScheduleTargetToPipelineSlot,
  pipelineScheduleSlotsEqual,
} from '@gitroom/frontend/components/pipelines/pipeline.utils';
import { PipelineSidebarList } from '@gitroom/frontend/components/pipelines/pipeline.sidebar.list';
import { usePipelineList } from '@gitroom/frontend/components/pipelines/use.pipeline.list';
import {
  PipelineScheduleOccurrence,
  PipelineScheduleDragItem,
  PipelineSummary,
} from '@gitroom/frontend/components/pipelines/pipeline.types';
import {
  pipelineGlobalScheduleKey,
  usePipelineGlobalSchedule,
} from '@gitroom/frontend/components/pipelines/use.pipeline.global.schedule';
import { useDeletePipelineScheduleSlot } from '@gitroom/frontend/components/pipelines/use.pipeline.schedule.slot.delete';
import { useMovePipelineScheduleSlot } from '@gitroom/frontend/components/pipelines/use.pipeline.schedule.slot.move';
import { useScrollToHour } from '@gitroom/frontend/components/launches/helpers/use.scroll.to.hour';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const formatDateHeader = (date: dayjs.Dayjs, timezone: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: 'short',
  }).format(date.toDate());

const formatHour = (hour: number) =>
  new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2020, 0, 1, hour)));

const formatOccurrenceDetails = (
  occurrence: PipelineScheduleOccurrence,
  displayTimezone: string
) => {
  const scheduledFor = new Intl.DateTimeFormat(undefined, {
    timeZone: displayTimezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(occurrence.scheduledFor));
  const sourceDay = PIPELINE_DAYS[occurrence.dayOfWeek]?.label;
  return `${scheduledFor} · ${occurrence.pipelineTimezone} · ${
    occurrence.active ? 'Active' : 'Paused'
  } · Source: ${sourceDay} ${minuteOfDayToTime(occurrence.minuteOfDay)}`;
};

const PipelineScheduleOccurrencePill: FC<{
  occurrence: PipelineScheduleOccurrence;
  displayTimezone: string;
  pending: boolean;
  onRemove: (occurrence: PipelineScheduleOccurrence) => void;
  pausedLabel: string;
  removeLabel: string;
  slotLabel: string;
}> = ({
  occurrence,
  displayTimezone,
  pending,
  onRemove,
  pausedLabel,
  removeLabel,
  slotLabel,
}) => {
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: PIPELINE_SCHEDULE_DRAG_TYPE,
      item: {
        source: {
          dayOfWeek: occurrence.dayOfWeek,
          minuteOfDay: occurrence.minuteOfDay,
        },
        occurrenceId: occurrence.id,
        pipelineId: occurrence.pipelineId,
        pipelineName: occurrence.pipelineName,
        pipelineTimezone: occurrence.pipelineTimezone,
        pipelineColor: occurrence.pipelineColor,
        active: occurrence.active,
        expectedScheduleRevision: occurrence.scheduleRevision,
      } satisfies PipelineScheduleDragItem,
      canDrag: !pending,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [occurrence, pending]
  );
  const sourceDay = PIPELINE_DAYS[occurrence.dayOfWeek]?.label;
  const sourceTime = minuteOfDayToTime(occurrence.minuteOfDay);
  const details = formatOccurrenceDetails(occurrence, displayTimezone);
  const activeForeground = occurrence.active
    ? getReadableForegroundColor(occurrence.pipelineColor)
    : undefined;

  return (
    <div
      // @ts-ignore react-dnd connector type
      ref={drag}
      title={details}
      className={clsx(
        'flex min-w-0 items-center justify-between gap-[4px] rounded-[6px] px-[7px] py-[5px] text-[12px]',
        !pending && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
        occurrence.active
          ? ''
          : 'border border-newBorder bg-newBgColorInner text-textColor opacity-60'
      )}
      style={
        occurrence.active
          ? {
              backgroundColor: occurrence.pipelineColor,
              color: activeForeground,
            }
          : undefined
      }
    >
      <span
        className="min-w-0 truncate"
        aria-label={`${occurrence.pipelineName}. ${details}`}
      >
        {occurrence.pipelineName}
      </span>
      {!occurrence.active && (
        <span className="shrink-0 rounded-[3px] border border-current px-[3px] py-[1px] text-[10px]">
          {pausedLabel}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => onRemove(occurrence)}
        className="inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded hover:bg-newBgColor/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btnPrimary disabled:cursor-not-allowed"
        aria-label={`${removeLabel} ${occurrence.pipelineName} ${sourceDay} ${sourceTime} ${slotLabel}`}
      >
        <svg
          viewBox="0 0 12 12"
          className="h-[10px] w-[10px]"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2.5 2.5l7 7M9.5 2.5l-7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
};

const PipelineScheduleDropZone: FC<{
  date: string;
  minuteOfDay: number;
  className?: string;
  onDrop: (
    item: PipelineScheduleDragItem,
    displayCalendarDate: string,
    targetDisplayMinuteOfDay: number
  ) => void;
  children: ReactNode;
}> = ({ date, minuteOfDay, className, onDrop, children }) => {
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: PIPELINE_SCHEDULE_DRAG_TYPE,
      drop: (item: PipelineScheduleDragItem) => onDrop(item, date, minuteOfDay),
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }),
    }),
    [date, minuteOfDay, onDrop]
  );

  return (
    <div
      // @ts-ignore react-dnd connector type
      ref={drop}
      className={clsx(
        'flex min-h-[32px] flex-1 flex-col gap-[4px] rounded-[4px]',
        isOver &&
          canDrop &&
          'bg-btnPrimary/10 outline outline-1 outline-btnPrimary/40',
        className
      )}
    >
      {children}
    </div>
  );
};

export const PipelineGlobalSchedule: FC = () => {
  const t = useT();
  const router = useRouter();
  const decision = useDecisionModal();
  const toaster = useToaster();
  const { data: integrations = [], isLoading: integrationsLoading } =
    useIntegrationList();
  const {
    data: pipelines = [],
    error: pipelinesError,
    isLoading: pipelinesLoading,
  } = usePipelineList();
  const [selectedChannelId, setSelectedChannelId] = useState<string>();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>();
  const hasRestoredChannel = useRef(false);
  const [displayTimezone, setDisplayTimezone] = useState<string>();
  const [pendingOccurrenceIds, setPendingOccurrenceIds] = useState<Set<string>>(
    new Set()
  );
  const [scheduleError, setScheduleError] = useState('');

  useEffect(() => {
    setDisplayTimezone(getTimezone());
  }, []);

  const week = useMemo(
    () =>
      displayTimezone ? getPipelineScheduleWeek(displayTimezone) : undefined,
    [displayTimezone]
  );
  const globalScheduleKey = week
    ? pipelineGlobalScheduleKey(week.startDate, week.endDate)
    : undefined;
  const { data, error, isLoading, mutate } = usePipelineGlobalSchedule(
    week?.startDate,
    week?.endDate
  );
  const deleteScheduleSlot = useDeletePipelineScheduleSlot(globalScheduleKey);
  const moveScheduleSlot = useMovePipelineScheduleSlot(globalScheduleKey);

  useEffect(() => {
    if (hasRestoredChannel.current || !integrations.length) {
      return;
    }
    hasRestoredChannel.current = true;
    const restored = resolveChannelId({
      eligibleIds: integrations.map((integration) => integration.id),
      currentId: undefined,
    });
    if (restored) {
      setSelectedChannelId(restored);
    }
  }, [integrations]);

  const handleChannelSelect = useCallback(
    (integration: IntegrationListItem) => {
      const nextId =
        selectedChannelId === integration.id ? undefined : integration.id;
      if (nextId) {
        setLastChannelId(nextId);
        setSelectedPipelineId(undefined);
      }
      setSelectedChannelId(nextId);
    },
    [selectedChannelId]
  );

  const handlePipelineSelect = useCallback(
    (pipeline: PipelineSummary) => {
      const nextId =
        selectedPipelineId === pipeline.id ? undefined : pipeline.id;
      if (nextId) {
        setSelectedChannelId(undefined);
      }
      setSelectedPipelineId(nextId);
    },
    [selectedPipelineId]
  );

  const matchingPipelines = useMemo(
    () => filterPipelinesByChannel(pipelines || [], selectedChannelId),
    [pipelines, selectedChannelId]
  );

  const visibleOccurrences = useMemo(() => {
    const occurrences = data || [];
    if (selectedPipelineId) {
      return filterScheduleOccurrencesByPipeline(
        occurrences,
        selectedPipelineId
      );
    }
    return filterScheduleOccurrencesByChannel(
      occurrences,
      pipelines || [],
      selectedChannelId
    );
  }, [data, pipelines, selectedChannelId, selectedPipelineId]);

  const occurrencesByCell = useMemo(() => {
    const cells = new Map<string, PipelineScheduleOccurrence[]>();
    if (!displayTimezone) {
      return cells;
    }
    for (const occurrence of visibleOccurrences) {
      const localTime = dayjs(occurrence.scheduledFor).tz(displayTimezone);
      const key = `${localTime.format('YYYY-MM-DD')}:${localTime.hour()}:${
        localTime.minute() >= 30 ? 30 : 0
      }`;
      cells.set(key, [...(cells.get(key) || []), occurrence]);
    }
    return cells;
  }, [displayTimezone, visibleOccurrences]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const earliestHour = useMemo(() => {
    if (isLoading || !visibleOccurrences.length || !displayTimezone) {
      return null;
    }
    let minHour: number | null = null;
    for (const occurrence of visibleOccurrences) {
      const hour = dayjs(occurrence.scheduledFor).tz(displayTimezone).hour();
      if (minHour === null || hour < minHour) {
        minHour = hour;
      }
    }
    return minHour;
  }, [displayTimezone, isLoading, visibleOccurrences]);
  useScrollToHour(scrollRef, earliestHour, week?.startDate || '');

  const removeSlot = useCallback(
    async (occurrence: PipelineScheduleOccurrence) => {
      if (pendingOccurrenceIds.has(occurrence.id)) {
        return;
      }
      const day = PIPELINE_DAYS[occurrence.dayOfWeek]?.label;
      const sourceTime = minuteOfDayToTime(occurrence.minuteOfDay);
      const approved = await decision.open({
        title: t(
          'remove_pipeline_schedule_slot',
          'Remove Pipeline schedule slot?'
        ),
        description: `Removing "${occurrence.pipelineName}" on ${day} at ${sourceTime} (${occurrence.pipelineTimezone}) will remove this recurring source slot from every future week.`,
        approveLabel: t('remove', 'Remove'),
        cancelLabel: t('cancel', 'Cancel'),
      });
      if (!approved) {
        return;
      }

      setScheduleError('');
      setPendingOccurrenceIds((current) => new Set(current).add(occurrence.id));
      try {
        await deleteScheduleSlot(occurrence.pipelineId, {
          dayOfWeek: occurrence.dayOfWeek,
          minuteOfDay: occurrence.minuteOfDay,
        });
        toaster.show(
          t(
            'pipeline_schedule_slot_removed',
            'Pipeline schedule slot removed.'
          ),
          'success'
        );
      } catch (err: any) {
        const message =
          err?.message ||
          t(
            'pipeline_schedule_slot_remove_failed',
            'Failed to remove the Pipeline schedule slot. The schedule has been refreshed.'
          );
        setScheduleError(message);
        toaster.show(message, 'warning');
        await mutate();
      } finally {
        setPendingOccurrenceIds((current) => {
          const next = new Set(current);
          next.delete(occurrence.id);
          return next;
        });
      }
    },
    [decision, deleteScheduleSlot, mutate, pendingOccurrenceIds, t, toaster]
  );

  const moveSlot = useCallback(
    async (
      item: PipelineScheduleDragItem,
      displayCalendarDate: string,
      targetDisplayMinuteOfDay: number
    ) => {
      if (
        !item.occurrenceId ||
        !item.pipelineId ||
        !item.pipelineName ||
        !item.pipelineTimezone ||
        item.expectedScheduleRevision === undefined ||
        pendingOccurrenceIds.has(item.occurrenceId)
      ) {
        return;
      }

      const conversion = convertDisplayScheduleTargetToPipelineSlot(
        displayCalendarDate,
        targetDisplayMinuteOfDay,
        displayTimezone!,
        item.pipelineTimezone
      );
      if (!conversion.ok) {
        toaster.show(
          t(
            'pipeline_schedule_slot_invalid_target',
            'This displayed time does not exist in the selected timezone.'
          ),
          'warning'
        );
        return;
      }

      const target = {
        dayOfWeek: conversion.dayOfWeek,
        minuteOfDay: conversion.minuteOfDay,
      };
      if (pipelineScheduleSlotsEqual(item.source, target)) {
        return;
      }
      if (
        data?.some(
          (occurrence) =>
            occurrence.id !== item.occurrenceId &&
            occurrence.pipelineId === item.pipelineId &&
            pipelineScheduleSlotsEqual(occurrence, target)
        )
      ) {
        toaster.show(
          t(
            'pipeline_schedule_slot_occupied',
            'This Pipeline already has a recurring schedule slot at that time.'
          ),
          'warning'
        );
        return;
      }

      const sourceDay = PIPELINE_DAYS[item.source.dayOfWeek]?.label;
      const targetDay = PIPELINE_DAYS[target.dayOfWeek]?.label;
      const approved = await decision.open({
        title: t('move_pipeline_schedule_slot', 'Move Pipeline schedule slot?'),
        description: `Moving "${
          item.pipelineName
        }" from ${sourceDay} at ${minuteOfDayToTime(
          item.source.minuteOfDay
        )} to ${targetDay} at ${minuteOfDayToTime(target.minuteOfDay)} (${
          item.pipelineTimezone
        }) will update this recurring source slot for every future week.`,
        approveLabel: t('confirm', 'Confirm'),
        cancelLabel: t('cancel', 'Cancel'),
      });
      if (!approved) {
        return;
      }

      setScheduleError('');
      setPendingOccurrenceIds((current) =>
        new Set(current).add(item.occurrenceId!)
      );
      try {
        await moveScheduleSlot(item.pipelineId, {
          sourceDayOfWeek: item.source.dayOfWeek,
          sourceMinuteOfDay: item.source.minuteOfDay,
          targetDayOfWeek: target.dayOfWeek,
          targetMinuteOfDay: target.minuteOfDay,
          expectedScheduleRevision: item.expectedScheduleRevision,
        });
        toaster.show(
          t('pipeline_schedule_slot_moved', 'Pipeline schedule slot moved.'),
          'success'
        );
      } catch (err: any) {
        const message =
          err?.message ||
          t(
            'pipeline_schedule_slot_move_failed',
            'Failed to move the Pipeline schedule slot. The schedule has been refreshed.'
          );
        setScheduleError(message);
        toaster.show(message, 'warning');
        await mutate();
      } finally {
        setPendingOccurrenceIds((current) => {
          const next = new Set(current);
          next.delete(item.occurrenceId!);
          return next;
        });
      }
    },
    [
      data,
      decision,
      displayTimezone,
      moveScheduleSlot,
      mutate,
      pendingOccurrenceIds,
      t,
      toaster,
    ]
  );

  const today = displayTimezone
    ? dayjs().tz(displayTimezone).format('YYYY-MM-DD')
    : '';

  if (integrationsLoading || pipelinesLoading) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <>
      <ChannelsSidebar
        integrationCount={integrations.length}
        showAddProvider={false}
      >
        {(collapsed) => (
          <>
            <ChannelMenu
              collapsed={collapsed}
              integrations={integrations}
              selectedIds={selectedChannelId ? [selectedChannelId] : undefined}
              onSelect={handleChannelSelect}
            />
            <PipelineSidebarList
              collapsed={collapsed}
              pipelines={pipelines}
              selectedPipelineId={selectedPipelineId}
              isLoading={pipelinesLoading}
              error={pipelinesError}
              onSelectPipeline={handlePipelineSelect}
            />
          </>
        )}
      </ChannelsSidebar>
      <DNDProvider>
        <div className="bg-newBgColorInner flex flex-1 flex-col min-h-0 min-w-0 gap-[12px] p-[20px] overflow-hidden text-textColor">
          <Button
            secondary
            className="self-start"
            onClick={() => router.push('/pipelines')}
          >
            <span className="inline-flex items-center gap-[4px]">
              <ChevronLeftIcon size={16} />
              {t('pipelines', 'Pipelines')}
            </span>
          </Button>

          {scheduleError && (
            <div className="rounded-[12px] border border-red-500/30 bg-newBgColor px-[16px] py-[12px] text-[14px] text-red-500">
              {scheduleError}
            </div>
          )}

          {!displayTimezone || isLoading ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-[12px] border border-newBorder bg-newBgColor">
              <LoadingComponent />
            </div>
          ) : error ? (
            <div className="rounded-[12px] border border-red-500/30 bg-newBgColor px-[16px] py-[12px] text-[14px] text-red-500">
              {t(
                'pipeline_schedule_load_error',
                'Failed to load Pipeline schedules for this week. Please refresh and try again.'
              )}
            </div>
          ) : selectedChannelId && !matchingPipelines.length ? (
            <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[32px] flex flex-col items-center justify-center gap-[12px] text-center">
              <div className="text-[18px] font-[600]">
                {t('no_pipelines_for_channel', 'No Pipelines for this channel')}
              </div>
              <div className="text-[14px] opacity-70 max-w-[520px]">
                {t(
                  'no_pipelines_for_channel_description',
                  'None of your Pipelines include this channel. Select a different channel or click it again to show all Pipelines.'
                )}
              </div>
            </div>
          ) : !visibleOccurrences.length ? (
            <div className="rounded-[12px] border border-newBorder bg-newBgColor px-[16px] py-[32px] text-center text-[14px] opacity-70">
              {t(
                'pipeline_schedule_empty',
                'No configured Pipeline schedules this week.'
              )}
            </div>
          ) : (
            <div className="relative flex flex-1 flex-col min-h-0">
              <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-auto rounded-[10px] border border-newBorder bg-newBorder scrollbar scrollbar-thumb-newBorder scrollbar-track-newBgColor"
              >
                <div className="grid min-w-[1004px] grid-cols-[80px_repeat(7,_minmax(132px,_1fr))] gap-px">
                  <div className="sticky start-0 top-0 z-30 h-[62px] bg-newTableHeader" />
                  {week!.days.map((date) => {
                    const dateKey = date.format('YYYY-MM-DD');
                    return (
                      <div
                        key={dateKey}
                        className="sticky top-0 z-20 flex h-[62px] flex-col items-center justify-center bg-newTableHeader px-[8px] text-center text-[14px] font-[500] text-newTableText"
                      >
                        <span>{formatDateHeader(date, displayTimezone)}</span>
                        {dateKey === today && (
                          <span className="text-[12px] text-newTableTextFocused">
                            {t('today', 'Today')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {HOURS.map((hour) => (
                    <Fragment key={hour}>
                      <div
                        data-hour={hour}
                        className="sticky start-0 z-10 flex min-h-[76px] items-start justify-end bg-newBgColor px-[12px] pt-[10px] text-[13px] text-newTableText scroll-mt-[62px]"
                      >
                        {formatHour(hour)}
                      </div>
                      {week!.days.map((date) => {
                        const firstHalfOccurrences =
                          occurrencesByCell.get(
                            `${date.format('YYYY-MM-DD')}:${hour}:0`
                          ) || [];
                        const secondHalfOccurrences =
                          occurrencesByCell.get(
                            `${date.format('YYYY-MM-DD')}:${hour}:30`
                          ) || [];
                        return (
                          <div
                            key={`${date.format('YYYY-MM-DD')}-${hour}`}
                            className={clsx(
                              'flex min-h-[76px] flex-col gap-[4px] bg-newBgColor p-[6px]',
                              date.format('YYYY-MM-DD') === today &&
                                'bg-newBgColorInner'
                            )}
                          >
                            {[0, 30].map((minute) => {
                              const occurrences =
                                minute === 0
                                  ? firstHalfOccurrences
                                  : secondHalfOccurrences;
                              return (
                                <PipelineScheduleDropZone
                                  key={minute}
                                  date={date.format('YYYY-MM-DD')}
                                  minuteOfDay={hour * 60 + minute}
                                  onDrop={moveSlot}
                                >
                                  {occurrences.map((occurrence) => (
                                    <PipelineScheduleOccurrencePill
                                      key={occurrence.id}
                                      occurrence={occurrence}
                                      displayTimezone={displayTimezone}
                                      pending={pendingOccurrenceIds.has(
                                        occurrence.id
                                      )}
                                      onRemove={removeSlot}
                                      pausedLabel={t('paused', 'Paused')}
                                      removeLabel={t('remove', 'Remove')}
                                      slotLabel={t(
                                        'pipeline_schedule_slot',
                                        'Pipeline schedule slot'
                                      )}
                                    />
                                  ))}
                                </PipelineScheduleDropZone>
                              );
                            })}
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </DNDProvider>
    </>
  );
};

'use client';

import {
  FC,
  Fragment,
  MouseEvent,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import clsx from 'clsx';
import { useDrag, useDrop } from 'react-dnd';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  PipelineScheduleDragItem,
  PipelineScheduleSlot,
} from '@gitroom/frontend/components/pipelines/pipeline.types';
import { PipelineScheduleSlotTimeModal } from '@gitroom/frontend/components/pipelines/pipeline.schedule.slot.time.modal';
import {
  getReadableForegroundColor,
  minuteOfDayToTime,
  PIPELINE_DAYS,
  PIPELINE_SCHEDULE_DRAG_TYPE,
  pipelineScheduleSlotsEqual,
} from '@gitroom/frontend/components/pipelines/pipeline.utils';
import { useScrollToHour } from '@gitroom/frontend/components/launches/helpers/use.scroll.to.hour';

const SlotPill: FC<{
  dayLabel: string;
  slot: PipelineScheduleSlot;
  pipelineColor: string;
  onEdit: (slot: PipelineScheduleSlot, dayLabel: string) => void;
  onRemove: (slot: PipelineScheduleSlot) => void;
}> = ({ dayLabel, slot, pipelineColor, onEdit, onRemove }) => {
  const timeLabel = minuteOfDayToTime(slot.minuteOfDay);
  const foregroundColor = getReadableForegroundColor(pipelineColor);
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: PIPELINE_SCHEDULE_DRAG_TYPE,
      item: { source: slot } satisfies PipelineScheduleDragItem,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [slot.dayOfWeek, slot.minuteOfDay]
  );

  return (
    <div
      className={clsx(
        'flex items-center justify-between gap-[4px] rounded-[6px] px-[4px] py-[4px] text-[12px]',
        isDragging && 'opacity-40'
      )}
      style={{
        backgroundColor: pipelineColor,
        color: foregroundColor,
      }}
    >
      <button
        // @ts-ignore react-dnd connector type
        ref={drag}
        type="button"
        className="inline-flex h-[20px] w-[16px] shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: foregroundColor }}
        aria-label={`Drag ${dayLabel} ${timeLabel} slot`}
      >
        ⠿
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 cursor-pointer rounded text-start hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: foregroundColor }}
        aria-label={`Edit ${dayLabel} ${timeLabel} slot`}
        onClick={() => onEdit(slot, dayLabel)}
      >
        {timeLabel}
      </button>
      <button
        type="button"
        className="inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: foregroundColor }}
        aria-label={`Remove ${dayLabel} ${timeLabel} slot`}
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          onRemove(slot);
        }}
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

const AddZone: FC<{
  ariaLabel: string;
  onClick: () => void;
}> = ({ ariaLabel, onClick }) => (
  <div className="flex min-h-[28px] flex-1 items-center justify-center">
    <button
      type="button"
      className={clsx(
        'flex h-[28px] w-[28px] items-center justify-center rounded-[6px] border border-newBorder bg-newBgColorInner text-newTableText opacity-0 transition-opacity hover:bg-btnPrimary hover:text-btnText focus:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btnPrimary',
        'group-hover:opacity-100'
      )}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 12 12"
        className="h-[12px] w-[12px]"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M6 2v8M2 6h8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  </div>
);

const ScheduleDropZone: FC<{
  dayOfWeek: number;
  minuteOfDay: number;
  value: PipelineScheduleSlot[];
  onMoveSlot: (
    source: PipelineScheduleSlot,
    targetDayOfWeek: number,
    targetMinuteOfDay: number
  ) => void;
  children: ReactNode;
}> = ({ dayOfWeek, minuteOfDay, value, onMoveSlot, children }) => {
  const [{ isOver, draggedItem }, drop] = useDrop(
    () => ({
      accept: PIPELINE_SCHEDULE_DRAG_TYPE,
      drop: (item: PipelineScheduleDragItem) => {
        onMoveSlot(item.source, dayOfWeek, minuteOfDay);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
        draggedItem:
          monitor.getItemType() === PIPELINE_SCHEDULE_DRAG_TYPE
            ? monitor.getItem<PipelineScheduleDragItem>()
            : null,
      }),
    }),
    [dayOfWeek, minuteOfDay, onMoveSlot]
  );

  const target: PipelineScheduleSlot = { dayOfWeek, minuteOfDay };
  const isIdenticalTarget =
    !!draggedItem?.source &&
    pipelineScheduleSlotsEqual(draggedItem.source, target);
  const isOccupied = value.some(
    (slot) => slot.dayOfWeek === dayOfWeek && slot.minuteOfDay === minuteOfDay
  );
  const isValidVisualTarget = !isIdenticalTarget && !isOccupied;

  return (
    <div
      // @ts-ignore react-dnd connector type
      ref={drop}
      className={clsx(
        'flex min-h-[28px] flex-1 flex-col justify-center rounded-[6px] border border-transparent transition-colors',
        isOver &&
          isValidVisualTarget &&
          'border-btnPrimary bg-btnPrimary/10 cursor-copy',
        isOver &&
          !isValidVisualTarget &&
          !isIdenticalTarget &&
          'border-red-500/40 bg-red-500/5 cursor-not-allowed opacity-80'
      )}
    >
      {children}
    </div>
  );
};

const PipelineScheduleEditorContent: FC<{
  value: PipelineScheduleSlot[];
  pipelineColor: string;
  onChange: (value: PipelineScheduleSlot[]) => void;
}> = ({ value, pipelineColor, onChange }) => {
  const t = useT();
  const modal = useModals();
  const toaster = useToaster();
  const scrollRef = useRef<HTMLDivElement>(null);
  const earliestHour = useMemo(() => {
    if (!value.length) {
      return null;
    }
    return Math.min(...value.map((slot) => Math.floor(slot.minuteOfDay / 60)));
  }, [value]);
  useScrollToHour(scrollRef, earliestHour, 'schedule');

  const addSlot = (dayOfWeek: number, minuteOfDay: number) => {
    if (
      value.some(
        (slot) =>
          slot.dayOfWeek === dayOfWeek && slot.minuteOfDay === minuteOfDay
      )
    ) {
      return;
    }
    onChange([...value, { dayOfWeek, minuteOfDay }]);
  };

  const removeSlot = (slotToRemove: PipelineScheduleSlot) => {
    onChange(
      value.filter(
        (slot) =>
          slot.dayOfWeek !== slotToRemove.dayOfWeek ||
          slot.minuteOfDay !== slotToRemove.minuteOfDay
      )
    );
  };

  const moveSlot = useCallback(
    (
      source: PipelineScheduleSlot,
      targetDayOfWeek: number,
      targetMinuteOfDay: number
    ) => {
      const target: PipelineScheduleSlot = {
        dayOfWeek: targetDayOfWeek,
        minuteOfDay: targetMinuteOfDay,
      };
      if (pipelineScheduleSlotsEqual(source, target)) {
        return;
      }
      const isOccupied = value.some(
        (slot) =>
          slot.dayOfWeek === targetDayOfWeek &&
          slot.minuteOfDay === targetMinuteOfDay
      );
      if (isOccupied) {
        toaster.show(
          t(
            'pipeline_schedule_slot_duplicate',
            'A slot already exists at this time for this day.'
          ),
          'warning'
        );
        return;
      }
      onChange([
        ...value.filter((slot) => !pipelineScheduleSlotsEqual(slot, source)),
        target,
      ]);
    },
    [onChange, t, toaster, value]
  );

  const updateSlotTime = useCallback(
    (oldSlot: PipelineScheduleSlot, newMinuteOfDay: number) => {
      if (oldSlot.minuteOfDay === newMinuteOfDay) {
        return;
      }
      const hasDuplicate = value.some(
        (slot) =>
          slot.dayOfWeek === oldSlot.dayOfWeek &&
          slot.minuteOfDay === newMinuteOfDay
      );
      if (hasDuplicate) {
        return;
      }
      onChange([
        ...value.filter(
          (slot) =>
            slot.dayOfWeek !== oldSlot.dayOfWeek ||
            slot.minuteOfDay !== oldSlot.minuteOfDay
        ),
        { dayOfWeek: oldSlot.dayOfWeek, minuteOfDay: newMinuteOfDay },
      ]);
    },
    [onChange, value]
  );

  const openSlotTimeModal = useCallback(
    (slot: PipelineScheduleSlot, dayLabel: string) => {
      const occupiedMinuteOfDays = value
        .filter(
          (entry) =>
            entry.dayOfWeek === slot.dayOfWeek &&
            entry.minuteOfDay !== slot.minuteOfDay
        )
        .map((entry) => entry.minuteOfDay);

      modal.openModal({
        title: t('edit_slot_time', 'Edit slot time'),
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[360px] text-textColor',
        },
        children: (
          <PipelineScheduleSlotTimeModal
            slot={slot}
            dayLabel={dayLabel}
            occupiedMinuteOfDays={occupiedMinuteOfDays}
            onApply={(newMinuteOfDay) => updateSlotTime(slot, newMinuteOfDay)}
          />
        ),
      });
    },
    [modal, t, updateSlotTime, value]
  );

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="text-[13px] opacity-70">
        Add slots by hour, then click a slot to set a specific minute. After
        adding the top of an hour, you can add a second slot at the half hour.
        Existing off-hour slots are retained and can be removed. Drag a slot to
        move it to another day or half-hour. Times use the Pipeline timezone.
      </div>
      <div
        ref={scrollRef}
        className="max-h-[640px] overflow-auto rounded-[10px] border border-newBorder bg-newBorder scrollbar scrollbar-thumb-newBorder scrollbar-track-newBgColor"
      >
        <div className="grid min-w-[1004px] grid-cols-[80px_repeat(7,_minmax(132px,_1fr))] gap-px">
          <div className="sticky start-0 top-0 z-30 h-[62px] bg-newTableHeader" />
          {PIPELINE_DAYS.map((day) => (
            <div
              key={day.dayOfWeek}
              className="sticky top-0 z-20 flex h-[62px] items-center justify-center bg-newTableHeader px-[8px] text-center text-[14px] font-[500] text-newTableText"
            >
              {day.label}
            </div>
          ))}
          {Array.from({ length: 24 }, (_, hour) => (
            <Fragment key={hour}>
              <div
                data-hour={hour}
                className="sticky start-0 z-10 flex min-h-[64px] items-start justify-end bg-newBgColor px-[12px] pt-[10px] text-[13px] text-newTableText scroll-mt-[62px]"
              >
                {String(hour).padStart(2, '0')}:00
              </div>
              {PIPELINE_DAYS.map((day) => {
                const topMinute = hour * 60;
                const halfMinute = hour * 60 + 30;
                const slots = value
                  .filter(
                    (slot) =>
                      slot.dayOfWeek === day.dayOfWeek &&
                      Math.floor(slot.minuteOfDay / 60) === hour
                  )
                  .sort((left, right) => left.minuteOfDay - right.minuteOfDay);
                const topSlot = slots.find(
                  (slot) => slot.minuteOfDay === topMinute
                );
                const halfSlot = slots.find(
                  (slot) => slot.minuteOfDay === halfMinute
                );
                const offHourSlots = slots.filter(
                  (slot) =>
                    slot.minuteOfDay !== topMinute &&
                    slot.minuteOfDay !== halfMinute
                );
                const hourLabel = String(hour).padStart(2, '0');
                return (
                  <div
                    key={`${day.dayOfWeek}-${hour}`}
                    className="group relative flex min-h-[64px] flex-col gap-[4px] bg-newBgColor p-[6px]"
                  >
                    {offHourSlots.map((slot) => (
                      <SlotPill
                        key={`${slot.dayOfWeek}-${slot.minuteOfDay}`}
                        dayLabel={day.label}
                        slot={slot}
                        pipelineColor={pipelineColor}
                        onEdit={openSlotTimeModal}
                        onRemove={removeSlot}
                      />
                    ))}
                    <ScheduleDropZone
                      dayOfWeek={day.dayOfWeek}
                      minuteOfDay={topMinute}
                      value={value}
                      onMoveSlot={moveSlot}
                    >
                      {topSlot ? (
                        <SlotPill
                          dayLabel={day.label}
                          slot={topSlot}
                          pipelineColor={pipelineColor}
                          onEdit={openSlotTimeModal}
                          onRemove={removeSlot}
                        />
                      ) : (
                        <AddZone
                          ariaLabel={`Add ${day.label} ${hourLabel}:00 slot`}
                          onClick={() => addSlot(day.dayOfWeek, topMinute)}
                        />
                      )}
                    </ScheduleDropZone>
                    <ScheduleDropZone
                      dayOfWeek={day.dayOfWeek}
                      minuteOfDay={halfMinute}
                      value={value}
                      onMoveSlot={moveSlot}
                    >
                      {halfSlot ? (
                        <SlotPill
                          dayLabel={day.label}
                          slot={halfSlot}
                          pipelineColor={pipelineColor}
                          onEdit={openSlotTimeModal}
                          onRemove={removeSlot}
                        />
                      ) : (
                        topSlot && (
                          <AddZone
                            ariaLabel={`Add ${day.label} ${hourLabel}:30 slot`}
                            onClick={() => addSlot(day.dayOfWeek, halfMinute)}
                          />
                        )
                      )}
                    </ScheduleDropZone>
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export const PipelineScheduleEditor: FC<{
  value: PipelineScheduleSlot[];
  pipelineColor: string;
  onChange: (value: PipelineScheduleSlot[]) => void;
}> = (props) => (
  <DNDProvider>
    <PipelineScheduleEditorContent {...props} />
  </DNDProvider>
);

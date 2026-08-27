import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

export const PIPELINE_SCHEDULER_GRACE_WINDOW_MS = 2 * 60 * 1000;

const MINUTES_PER_DAY = 24 * 60;
const MAX_TIMEZONE_OFFSET_MINUTES = 16 * 60;
const MAX_UPCOMING_SLOTS = 366;

export interface PipelineScheduleSlotInput {
  dayOfWeek: number;
  minuteOfDay: number;
}

export interface PipelineScheduleOccurrence extends PipelineScheduleSlotInput {
  scheduledFor: Date;
}

interface NormalizedSlot extends PipelineScheduleSlotInput {
  order: number;
}

const isValidSlot = (
  slot: PipelineScheduleSlotInput
): slot is PipelineScheduleSlotInput =>
  Number.isInteger(slot.dayOfWeek) &&
  slot.dayOfWeek >= 0 &&
  slot.dayOfWeek <= 6 &&
  Number.isInteger(slot.minuteOfDay) &&
  slot.minuteOfDay >= 0 &&
  slot.minuteOfDay < MINUTES_PER_DAY;

const normalizeSlots = (
  slots: readonly PipelineScheduleSlotInput[]
): NormalizedSlot[] =>
  slots
    .filter(isValidSlot)
    .map((slot, order) => ({ ...slot, order }))
    .sort(
      (first, second) =>
        first.dayOfWeek - second.dayOfWeek ||
        first.minuteOfDay - second.minuteOfDay ||
        first.order - second.order
    );

const isIanaTimezone = (timezoneName: string): boolean => {
  if (typeof timezoneName !== 'string') {
    return false;
  }

  try {
    dayjs().tz(timezoneName);
    return true;
  } catch {
    return false;
  }
};

/**
 * Resolves a local minute to UTC without relying on Day.js's ambiguous-time
 * parsing policy. Candidates are derived from the UTC offsets in effect around
 * the target instant, which keeps the policy explicit: return the first UTC
 * occurrence during fall-back and no occurrence during spring-forward.
 */
const resolveLocalMinute = (
  localDate: string,
  minuteOfDay: number,
  timezoneName: string
): Date | undefined => {
  const localMinuteAsUtc = dayjs
    .utc(`${localDate}T00:00:00.000`)
    .add(minuteOfDay, 'minute')
    .valueOf();
  const expectedTime = `${String(Math.floor(minuteOfDay / 60)).padStart(
    2,
    '0'
  )}:${String(minuteOfDay % 60).padStart(2, '0')}`;

  // A transition between the probes yields two offsets, which surfaces both
  // sides of an ambiguous local time rather than only the one Day.js picks.
  const candidateOffsets = new Set(
    [
      localMinuteAsUtc - MAX_TIMEZONE_OFFSET_MINUTES * 60 * 1000,
      localMinuteAsUtc,
      localMinuteAsUtc + MAX_TIMEZONE_OFFSET_MINUTES * 60 * 1000,
    ].map((probe) => dayjs(probe).tz(timezoneName).utcOffset())
  );

  let firstOccurrence: number | undefined;
  for (const offset of candidateOffsets) {
    const candidate = localMinuteAsUtc - offset * 60 * 1000;
    const localized = dayjs(candidate).tz(timezoneName);
    if (
      localized.format('YYYY-MM-DD') === localDate &&
      localized.format('HH:mm') === expectedTime &&
      (firstOccurrence === undefined || candidate < firstOccurrence)
    ) {
      firstOccurrence = candidate;
    }
  }

  return firstOccurrence === undefined ? undefined : new Date(firstOccurrence);
};

const getOccurrences = (
  slots: readonly NormalizedSlot[],
  timezoneName: string,
  from: Date,
  maximum: number
): Date[] => {
  const occurrences: Date[] = [];
  const fromTimestamp = from.getTime();
  const localStartDate = dayjs(from).tz(timezoneName).format('YYYY-MM-DD');
  const weeklyCycles = Math.ceil(maximum / slots.length) + 1;
  const maximumDays = Math.max(8, weeklyCycles * 7);

  for (let dayOffset = 0; dayOffset < maximumDays; dayOffset++) {
    const localDate = dayjs
      .utc(`${localStartDate}T00:00:00.000`)
      .add(dayOffset, 'day')
      .format('YYYY-MM-DD');
    const dayOfWeek = dayjs.utc(`${localDate}T00:00:00.000`).day();

    for (const slot of slots) {
      if (slot.dayOfWeek !== dayOfWeek) {
        continue;
      }

      const occurrence = resolveLocalMinute(
        localDate,
        slot.minuteOfDay,
        timezoneName
      );
      if (occurrence && occurrence.getTime() > fromTimestamp) {
        occurrences.push(occurrence);
      }
    }

    if (occurrences.length >= maximum) {
      break;
    }
  }

  return occurrences
    .sort((first, second) => first.getTime() - second.getTime())
    .slice(0, maximum);
};

export const getUpcomingPipelineSlots = (
  slots: readonly PipelineScheduleSlotInput[],
  timezoneName: string,
  from: Date,
  count: number
): Date[] => {
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isInteger(count) ||
    count <= 0 ||
    !isIanaTimezone(timezoneName)
  ) {
    return [];
  }

  const normalizedSlots = normalizeSlots(slots);
  if (!normalizedSlots.length) {
    return [];
  }

  return getOccurrences(
    normalizedSlots,
    timezoneName,
    from,
    Math.min(count, MAX_UPCOMING_SLOTS)
  );
};

export const getPipelineScheduleOccurrencesInRange = (
  slots: readonly PipelineScheduleSlotInput[],
  timezoneName: string,
  startDate: Date,
  endDate: Date
): PipelineScheduleOccurrence[] => {
  const startTimestamp = startDate.getTime();
  const endTimestamp = endDate.getTime();
  if (
    !Number.isFinite(startTimestamp) ||
    !Number.isFinite(endTimestamp) ||
    endTimestamp <= startTimestamp ||
    !isIanaTimezone(timezoneName)
  ) {
    return [];
  }

  const normalizedSlots = normalizeSlots(slots);
  if (!normalizedSlots.length) {
    return [];
  }

  const localStartDate = dayjs(startDate).tz(timezoneName).format('YYYY-MM-DD');
  const localEndDate = dayjs(endTimestamp - 1)
    .tz(timezoneName)
    .format('YYYY-MM-DD');
  const localDayCount =
    dayjs
      .utc(`${localEndDate}T00:00:00.000`)
      .diff(dayjs.utc(`${localStartDate}T00:00:00.000`), 'day') + 1;
  const occurrences: Array<PipelineScheduleOccurrence & { order: number }> = [];

  for (let dayOffset = 0; dayOffset < localDayCount; dayOffset++) {
    const localDate = dayjs
      .utc(`${localStartDate}T00:00:00.000`)
      .add(dayOffset, 'day')
      .format('YYYY-MM-DD');
    const dayOfWeek = dayjs.utc(`${localDate}T00:00:00.000`).day();

    for (const slot of normalizedSlots) {
      if (slot.dayOfWeek !== dayOfWeek) {
        continue;
      }
      const scheduledFor = resolveLocalMinute(
        localDate,
        slot.minuteOfDay,
        timezoneName
      );
      if (
        scheduledFor &&
        scheduledFor.getTime() >= startTimestamp &&
        scheduledFor.getTime() < endTimestamp
      ) {
        occurrences.push({ ...slot, scheduledFor });
      }
    }
  }

  return occurrences
    .sort(
      (first, second) =>
        first.scheduledFor.getTime() - second.scheduledFor.getTime() ||
        first.dayOfWeek - second.dayOfWeek ||
        first.minuteOfDay - second.minuteOfDay ||
        first.order - second.order
    )
    .map(({ order: _order, ...occurrence }) => occurrence);
};

export const getNextPipelineSlot = (
  slots: readonly PipelineScheduleSlotInput[],
  timezoneName: string,
  from: Date
): Date | undefined =>
  getUpcomingPipelineSlots(slots, timezoneName, from, 1)[0];

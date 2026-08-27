import type { ScheduleSpec } from '@temporalio/client';
import { RELATIONSHIP_CADENCE_DAYS } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.scoring';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const RELATIONSHIP_GRADE_SCHEDULE_UNITS = [
  'hour',
  'day',
  'month',
] as const;

export type RelationshipGradeScheduleUnit =
  (typeof RELATIONSHIP_GRADE_SCHEDULE_UNITS)[number];

export type RelationshipGradeScheduleConfig = {
  unit: RelationshipGradeScheduleUnit;
  interval: number;
  timeOfDay?: string;
  dayOfMonth?: number;
};

export const RELATIONSHIP_GRADE_SCHEDULE_ID =
  'channel-relationship-grade-schedule-v1';
export const RELATIONSHIP_GRADE_WORKFLOW_TYPE =
  'channelRelationshipGradeWorkflowV2';
export const RELATIONSHIP_GRADE_WORKFLOW_ID =
  'channel-relationship-grade-workflow-v2';
export const RELATIONSHIP_GRADE_LEGACY_WORKFLOW_ID =
  'channel-relationship-grade-workflow-v1';

export const DEFAULT_RELATIONSHIP_GRADE_SCHEDULE: RelationshipGradeScheduleConfig =
  {
    unit: 'day',
    interval: RELATIONSHIP_CADENCE_DAYS,
    timeOfDay: '00:00',
  };

const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeOfDay(value = '00:00') {
  const match = TIME_OF_DAY.exec(value);
  if (!match) {
    throw new RangeError('timeOfDay must be HH:mm in 24-hour UTC');
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function normalizeRelationshipGradeSchedule(
  value: Partial<RelationshipGradeScheduleConfig> | null | undefined
): RelationshipGradeScheduleConfig {
  const unit = value?.unit ?? DEFAULT_RELATIONSHIP_GRADE_SCHEDULE.unit;
  const interval = Number(
    value?.interval ?? DEFAULT_RELATIONSHIP_GRADE_SCHEDULE.interval
  );
  if (
    !RELATIONSHIP_GRADE_SCHEDULE_UNITS.includes(
      unit as RelationshipGradeScheduleUnit
    )
  ) {
    throw new RangeError('unit must be hour, day, or month');
  }
  if (!Number.isInteger(interval) || interval < 1) {
    throw new RangeError('interval must be an integer of at least 1');
  }
  if (unit === 'hour') {
    if (interval > 168) {
      throw new RangeError('hourly interval cannot exceed 168');
    }
    return { unit, interval };
  }
  const timeOfDay = value?.timeOfDay ?? '00:00';
  parseTimeOfDay(timeOfDay);
  if (unit === 'day') {
    if (interval > 30) {
      throw new RangeError('daily interval cannot exceed 30');
    }
    return { unit, interval, timeOfDay };
  }
  if (interval > 12) {
    throw new RangeError('monthly interval cannot exceed 12');
  }
  const dayOfMonth = Number(
    value?.dayOfMonth ?? DEFAULT_RELATIONSHIP_GRADE_SCHEDULE.dayOfMonth ?? 1
  );
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new RangeError('dayOfMonth must be between 1 and 31');
  }
  return { unit, interval, timeOfDay, dayOfMonth };
}

export function relationshipGradeDueCutoff(
  snapshotAt: Date,
  cadence: RelationshipGradeScheduleConfig = DEFAULT_RELATIONSHIP_GRADE_SCHEDULE
) {
  const config = normalizeRelationshipGradeSchedule(cadence);
  if (config.unit === 'hour') {
    return new Date(snapshotAt.getTime() - config.interval * 60 * 60 * 1000);
  }
  if (config.unit === 'day') {
    return new Date(
      snapshotAt.getTime() - config.interval * 24 * 60 * 60 * 1000
    );
  }
  const cutoff = new Date(snapshotAt.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - config.interval);
  return cutoff;
}

export function toRelationshipGradeScheduleSpec(
  cadence: RelationshipGradeScheduleConfig
): ScheduleSpec {
  const config = normalizeRelationshipGradeSchedule(cadence);
  if (config.unit === 'hour') {
    return {
      intervals: [{ every: config.interval * HOUR_MS }],
    };
  }
  const { hour, minute } = parseTimeOfDay(config.timeOfDay);
  if (config.unit === 'day') {
    return {
      intervals: [
        {
          every: config.interval * DAY_MS,
          offset: hour * HOUR_MS + minute * MINUTE_MS,
        },
      ],
    };
  }
  return {
    calendars: [
      {
        hour,
        minute,
        dayOfMonth: config.dayOfMonth,
        ...(config.interval === 1
          ? {}
          : {
              month: {
                start: 'JANUARY' as const,
                end: 'DECEMBER' as const,
                step: config.interval,
              },
            }),
      },
    ],
  };
}

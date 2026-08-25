import type { ScheduleSpec } from '@temporalio/client';
import { growAudienceStrategy } from '../channel-strategies/strategies/grow-audience.strategy';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const fallbackCultivateMaterialization =
  growAudienceStrategy.getMaterializationProfile().cultivate;

export const CULTIVATE_LEGACY_WORKFLOW_ID = 'channel-cultivate-workflow-v1';
export const CULTIVATE_WORKFLOW_TYPE = 'channelCultivateWorkflowV1';
export const CULTIVATE_WORKFLOW_ID = 'channel-cultivate-workflow-v1';

export const CULTIVATE_MATERIALIZATION_SCHEDULE_ID =
  'channel-cultivate-materialization-schedule-v1';
export const CULTIVATE_MATERIALIZATION_WORKFLOW_TYPE =
  'channelCultivateWorkflowV2';
export const CULTIVATE_MATERIALIZATION_WORKFLOW_ID =
  'channel-cultivate-materialization-workflow-v1';

export const CULTIVATE_MATERIALIZATION_SCHEDULE_INTERVAL_HOURS = 1;
export const CULTIVATE_MATERIALIZATION_SCHEDULE_MIN_HOURS = 1;
export const CULTIVATE_MATERIALIZATION_SCHEDULE_MAX_HOURS = 168;

/** Max candidates scanned when listing due integrations for one sweep pass. */
export const CULTIVATE_MATERIALIZATION_LIST_SCAN = 8;

/** Max candidates considered when materializing a channel's hourly Cultivate list. */
export const CULTIVATE_CANDIDATE_POOL_SIZE =
  fallbackCultivateMaterialization.candidatePoolSize;
/** Max picks stored per integration per UTC hour. */
export const CULTIVATE_PICK_LIMIT = fallbackCultivateMaterialization.pickLimit;
/** @deprecated use CULTIVATE_PICK_LIMIT */
export const CULTIVATE_DAILY_PICK_LIMIT = CULTIVATE_PICK_LIMIT;
/** Relationship grade threshold for Cultivate eligibility (or mutual triage). */
export const CULTIVATE_WARM_GRADE_THRESHOLD =
  fallbackCultivateMaterialization.warmGradeThreshold;
/** Days without outbound attention before a warm follower is Cultivate-eligible. */
export const CULTIVATE_STALE_DAYS = fallbackCultivateMaterialization.staleDays;
export const CULTIVATE_STALE_MS = CULTIVATE_STALE_DAYS * DAY_MS;
/** @deprecated idle loop removed; schedule drives hourly sweeps */
export const CULTIVATE_IDLE_MS = HOUR_MS;

export const CULTIVATE_MATERIALIZATION_ACTIVITY_TIMEOUT = '2 minutes';
export const CULTIVATE_MATERIALIZATION_ACTIVITY_RETRY = {
  maximumAttempts: 3,
  initialInterval: '10 seconds',
  backoffCoefficient: 2,
} as const;

export type CultivateMaterializationScheduleConfig = {
  intervalHours: number;
};

export const DEFAULT_CULTIVATE_MATERIALIZATION_SCHEDULE: CultivateMaterializationScheduleConfig =
{
  intervalHours: CULTIVATE_MATERIALIZATION_SCHEDULE_INTERVAL_HOURS,
};

export function normalizeCultivateMaterializationSchedule(
  value: Partial<CultivateMaterializationScheduleConfig> | null | undefined
): CultivateMaterializationScheduleConfig {
  const intervalHours = Number(
    value?.intervalHours ??
    DEFAULT_CULTIVATE_MATERIALIZATION_SCHEDULE.intervalHours
  );
  if (
    !Number.isInteger(intervalHours) ||
    intervalHours < CULTIVATE_MATERIALIZATION_SCHEDULE_MIN_HOURS
  ) {
    throw new RangeError('intervalHours must be an integer of at least 1');
  }
  if (intervalHours > CULTIVATE_MATERIALIZATION_SCHEDULE_MAX_HOURS) {
    throw new RangeError(
      `intervalHours cannot exceed ${CULTIVATE_MATERIALIZATION_SCHEDULE_MAX_HOURS}`
    );
  }
  return { intervalHours };
}

export function toCultivateMaterializationScheduleSpec(
  cadence: CultivateMaterializationScheduleConfig = DEFAULT_CULTIVATE_MATERIALIZATION_SCHEDULE
): ScheduleSpec {
  const config = normalizeCultivateMaterializationSchedule(cadence);
  return {
    intervals: [
      {
        every: config.intervalHours * HOUR_MS,
      },
    ],
  };
}

export const utcDayKey = (now = new Date()) =>
  now.toISOString().slice(0, 10);

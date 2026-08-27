import type { ScheduleSpec } from '@temporalio/client';
import { growAudienceStrategy } from '../channel-strategies/strategies/grow-audience.strategy';

const HOUR_MS = 60 * 60 * 1000;

const fallbackHotMaterialization =
  growAudienceStrategy.getMaterializationProfile().hot;

export const HOT_MATERIALIZATION_SCHEDULE_ID =
  'channel-hot-materialization-schedule-v1';
export const HOT_MATERIALIZATION_WORKFLOW_TYPE =
  'channelHotMaterializationWorkflowV1';
export const HOT_MATERIALIZATION_WORKFLOW_ID =
  'channel-hot-materialization-workflow-v1';

export const HOT_MATERIALIZATION_SCHEDULE_INTERVAL_HOURS = 1;
export const HOT_MATERIALIZATION_SCHEDULE_MIN_HOURS = 1;
export const HOT_MATERIALIZATION_SCHEDULE_MAX_HOURS = 168;

/** Max candidates scanned when listing due integrations for one sweep pass. */
export const HOT_MATERIALIZATION_LIST_SCAN = 8;

/** Max picks stored per integration per UTC hour. */
export const HOT_PICK_LIMIT = fallbackHotMaterialization.pickLimit;
/** Max candidates considered when materializing a channel's hourly Hot list. */
export const HOT_CANDIDATE_POOL_SIZE =
  fallbackHotMaterialization.candidatePoolSize;

export const HOT_MATERIALIZATION_ACTIVITY_TIMEOUT = '2 minutes';
export const HOT_MATERIALIZATION_ACTIVITY_RETRY = {
  maximumAttempts: 3,
  initialInterval: '10 seconds',
  backoffCoefficient: 2,
} as const;

export type HotMaterializationScheduleConfig = {
  intervalHours: number;
};

export const DEFAULT_HOT_MATERIALIZATION_SCHEDULE: HotMaterializationScheduleConfig =
  {
    intervalHours: HOT_MATERIALIZATION_SCHEDULE_INTERVAL_HOURS,
  };

export function normalizeHotMaterializationSchedule(
  value: Partial<HotMaterializationScheduleConfig> | null | undefined
): HotMaterializationScheduleConfig {
  const intervalHours = Number(
    value?.intervalHours ?? DEFAULT_HOT_MATERIALIZATION_SCHEDULE.intervalHours
  );
  if (!Number.isInteger(intervalHours) || intervalHours < 1) {
    throw new RangeError('intervalHours must be an integer of at least 1');
  }
  if (intervalHours > HOT_MATERIALIZATION_SCHEDULE_MAX_HOURS) {
    throw new RangeError(
      `intervalHours cannot exceed ${HOT_MATERIALIZATION_SCHEDULE_MAX_HOURS}`
    );
  }
  return { intervalHours };
}

export function toHotMaterializationScheduleSpec(
  cadence: HotMaterializationScheduleConfig = DEFAULT_HOT_MATERIALIZATION_SCHEDULE
): ScheduleSpec {
  const config = normalizeHotMaterializationSchedule(cadence);
  return {
    intervals: [
      {
        every: config.intervalHours * HOUR_MS,
      },
    ],
  };
}

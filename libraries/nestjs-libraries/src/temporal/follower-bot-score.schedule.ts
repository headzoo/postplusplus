import type { ScheduleSpec } from '@temporalio/client';

const HOUR_MS = 60 * 60 * 1000;

export const FOLLOWER_BOT_SCORE_SCHEDULE_ID =
  'channel-follower-bot-score-schedule-v1';
export const FOLLOWER_BOT_SCORE_WORKFLOW_TYPE =
  'channelFollowerBotScoreWorkflowV1';
export const FOLLOWER_BOT_SCORE_WORKFLOW_ID =
  'channel-follower-bot-score-workflow-v1';

export const FOLLOWER_BOT_SCORE_SCHEDULE_INTERVAL_HOURS = 6;
export const FOLLOWER_BOT_SCORE_SCHEDULE_MIN_HOURS = 1;
export const FOLLOWER_BOT_SCORE_SCHEDULE_MAX_HOURS = 168;

export type FollowerBotScoreScheduleConfig = {
  intervalHours: number;
};

export const DEFAULT_FOLLOWER_BOT_SCORE_SCHEDULE: FollowerBotScoreScheduleConfig =
  {
    intervalHours: FOLLOWER_BOT_SCORE_SCHEDULE_INTERVAL_HOURS,
  };

export function normalizeFollowerBotScoreSchedule(
  value: Partial<FollowerBotScoreScheduleConfig> | null | undefined
): FollowerBotScoreScheduleConfig {
  const intervalHours = Number(
    value?.intervalHours ?? DEFAULT_FOLLOWER_BOT_SCORE_SCHEDULE.intervalHours
  );
  if (
    !Number.isInteger(intervalHours) ||
    intervalHours < FOLLOWER_BOT_SCORE_SCHEDULE_MIN_HOURS
  ) {
    throw new RangeError('intervalHours must be an integer of at least 1');
  }
  if (intervalHours > FOLLOWER_BOT_SCORE_SCHEDULE_MAX_HOURS) {
    throw new RangeError(
      `intervalHours cannot exceed ${FOLLOWER_BOT_SCORE_SCHEDULE_MAX_HOURS}`
    );
  }
  return { intervalHours };
}

export function toFollowerBotScoreScheduleSpec(
  cadence: FollowerBotScoreScheduleConfig = DEFAULT_FOLLOWER_BOT_SCORE_SCHEDULE
): ScheduleSpec {
  const config = normalizeFollowerBotScoreSchedule(cadence);
  return {
    intervals: [
      {
        every: config.intervalHours * HOUR_MS,
      },
    ],
  };
}

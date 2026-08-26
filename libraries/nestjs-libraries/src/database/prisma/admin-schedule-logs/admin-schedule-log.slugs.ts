export const ADMIN_SCHEDULE_LOG_SLUGS = [
  'relationship-grades',
  'follower-bot-scores',
  'hot-triage',
  'follower-cultivate',
  'lead-bridge',
  'missing-post-recovery',
  'post-workflows',
  'autopost-workflows',
] as const;

export type AdminScheduleLogSlug = (typeof ADMIN_SCHEDULE_LOG_SLUGS)[number];

export function isAdminScheduleLogSlug(
  value: string
): value is AdminScheduleLogSlug {
  return (ADMIN_SCHEDULE_LOG_SLUGS as readonly string[]).includes(value);
}

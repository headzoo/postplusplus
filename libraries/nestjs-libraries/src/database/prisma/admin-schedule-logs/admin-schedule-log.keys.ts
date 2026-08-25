import { AdminScheduleLogKey } from '@prisma/client';
import {
  AdminScheduleLogSlug,
  ADMIN_SCHEDULE_LOG_SLUGS,
  isAdminScheduleLogSlug,
} from './admin-schedule-log.slugs';

export {
  ADMIN_SCHEDULE_LOG_SLUGS,
  AdminScheduleLogSlug,
  isAdminScheduleLogSlug,
} from './admin-schedule-log.slugs';

const SLUG_TO_KEY: Record<AdminScheduleLogSlug, AdminScheduleLogKey> = {
  'relationship-grades': AdminScheduleLogKey.RELATIONSHIP_GRADES,
  'follower-bot-scores': AdminScheduleLogKey.FOLLOWER_BOT_SCORES,
  'hot-triage': AdminScheduleLogKey.HOT_TRIAGE,
  'follower-cultivate': AdminScheduleLogKey.FOLLOWER_CULTIVATE,
  'lead-bridge': AdminScheduleLogKey.LEAD_BRIDGE,
  'missing-post-recovery': AdminScheduleLogKey.MISSING_POST_RECOVERY,
  'post-workflows': AdminScheduleLogKey.POST_WORKFLOWS,
  'autopost-workflows': AdminScheduleLogKey.AUTOPOST_WORKFLOWS,
};

const KEY_TO_SLUG: Record<AdminScheduleLogKey, AdminScheduleLogSlug> = {
  [AdminScheduleLogKey.RELATIONSHIP_GRADES]: 'relationship-grades',
  [AdminScheduleLogKey.FOLLOWER_BOT_SCORES]: 'follower-bot-scores',
  [AdminScheduleLogKey.HOT_TRIAGE]: 'hot-triage',
  [AdminScheduleLogKey.FOLLOWER_CULTIVATE]: 'follower-cultivate',
  [AdminScheduleLogKey.LEAD_BRIDGE]: 'lead-bridge',
  [AdminScheduleLogKey.MISSING_POST_RECOVERY]: 'missing-post-recovery',
  [AdminScheduleLogKey.POST_WORKFLOWS]: 'post-workflows',
  [AdminScheduleLogKey.AUTOPOST_WORKFLOWS]: 'autopost-workflows',
};

export function adminScheduleLogKeyFromSlug(
  slug: AdminScheduleLogSlug
): AdminScheduleLogKey {
  return SLUG_TO_KEY[slug];
}

export function adminScheduleLogSlugFromKey(
  key: AdminScheduleLogKey
): AdminScheduleLogSlug {
  return KEY_TO_SLUG[key];
}

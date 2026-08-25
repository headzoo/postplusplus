import { AdminScheduleLogKey } from '@prisma/client';
import {
  ADMIN_SCHEDULE_LOG_SLUGS,
  adminScheduleLogKeyFromSlug,
  adminScheduleLogSlugFromKey,
  isAdminScheduleLogSlug,
} from './admin-schedule-log.keys';

describe('admin-schedule-log.keys', () => {
  it('maps all schedule slugs to enum keys and back', () => {
    expect(ADMIN_SCHEDULE_LOG_SLUGS).toHaveLength(8);
    for (const slug of ADMIN_SCHEDULE_LOG_SLUGS) {
      const key = adminScheduleLogKeyFromSlug(slug);
      expect(Object.values(AdminScheduleLogKey)).toContain(key);
      expect(adminScheduleLogSlugFromKey(key)).toBe(slug);
      expect(isAdminScheduleLogSlug(slug)).toBe(true);
    }
    expect(isAdminScheduleLogSlug('nope')).toBe(false);
  });
});

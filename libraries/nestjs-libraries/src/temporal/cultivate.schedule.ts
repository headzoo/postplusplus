import { growAudienceStrategy } from '../channel-strategies/strategies/grow-audience.strategy';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const fallbackCultivateMaterialization =
  growAudienceStrategy.getMaterializationProfile().cultivate;

export const CULTIVATE_WORKFLOW_TYPE = 'channelCultivateWorkflowV1';
export const CULTIVATE_WORKFLOW_ID = 'channel-cultivate-workflow-v1';

/** Max candidates considered when materializing a channel's daily Cultivate list. */
export const CULTIVATE_CANDIDATE_POOL_SIZE =
  fallbackCultivateMaterialization.candidatePoolSize;
/** Max picks stored per integration per UTC day. */
export const CULTIVATE_DAILY_PICK_LIMIT = fallbackCultivateMaterialization.pickLimit;
/** Relationship grade threshold for Cultivate eligibility (or mutual triage). */
export const CULTIVATE_WARM_GRADE_THRESHOLD =
  fallbackCultivateMaterialization.warmGradeThreshold;
/** Days without outbound attention before a warm follower is Cultivate-eligible. */
export const CULTIVATE_STALE_DAYS = fallbackCultivateMaterialization.staleDays;
export const CULTIVATE_STALE_MS = CULTIVATE_STALE_DAYS * DAY_MS;
/** Idle wait when every integration already has today's picks. */
export const CULTIVATE_IDLE_MS = 60 * 60 * 1000;

export const utcDayKey = (now = new Date()) =>
  now.toISOString().slice(0, 10);

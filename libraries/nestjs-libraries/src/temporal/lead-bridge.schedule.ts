import { growAudienceStrategy } from '../channel-strategies/strategies/grow-audience.strategy';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const fallbackLeadMaterialization =
  growAudienceStrategy.getMaterializationProfile().lead;

export const LEAD_BRIDGE_WORKFLOW_TYPE = 'channelLeadBridgeWorkflowV1';
export const LEAD_BRIDGE_WORKFLOW_ID = 'channel-lead-bridge-workflow-v1';

export const LEAD_BRIDGE_ADMIN_TRIGGER_WORKFLOW_TYPE =
  'channelLeadBridgeAdminTriggerWorkflowV1';
export const LEAD_BRIDGE_ADMIN_TRIGGER_WORKFLOW_ID_PREFIX =
  'channel-lead-bridge-admin-trigger-v1';
/** Minimum newly-applied leads an admin burst trigger should produce. */
export const LEAD_BRIDGE_ADMIN_BURST_MIN_APPLIED = 20;

/** Max warm followers whose follower lists we crawl per integration per UTC day. */
export const LEAD_BRIDGE_DAILY_LIMIT = 5;
export const LEAD_BRIDGE_PAGE_SIZE = 100;
/** Max newly-applied leads persisted from a single warm follower crawl. */
export const LEAD_BRIDGE_PER_SOURCE_CAP = 15;
/** Max unscored leads AI-scored per integration on each crawl pass. */
export const LEAD_FIT_BACKFILL_LIMIT = fallbackLeadMaterialization.fitBackfillLimit;
/**
 * Minimum AI fit score (0-100) for a scored lead to stay visible. Leads scored
 * below this are hidden as poor matches; unscored leads (null) remain visible
 * until they are scored so nothing silently disappears while scoring catches up.
 */
export const LEAD_FIT_MIN_SCORE = fallbackLeadMaterialization.fitMinScore;
/** Prompt / example-feedback version written to ChannelAudienceMember.leadFitVersion. */
export const LEAD_FIT_VERSION = 2;
/** Max accepted/rejected examples passed into each lead-fit scoring call. */
export const LEAD_FIT_FEEDBACK_EXAMPLE_LIMIT =
  fallbackLeadMaterialization.feedbackExampleLimit;
export const LEAD_BRIDGE_WARM_GRADE_THRESHOLD = 3.5;
/** Idle wait when no integrations have remaining daily crawl quota. */
export const LEAD_BRIDGE_IDLE_MS = 60 * 60 * 1000;

export const leadBridgeDailyCountKey = (integrationId: string, day: string) =>
  `lead-bridge-crawl:${integrationId}:${day}`;

export const leadBridgeCursorKey = (integrationId: string) =>
  `lead-bridge-cursor:${integrationId}`;

export const utcDayKey = (now = new Date()) =>
  now.toISOString().slice(0, 10);

export const leadBridgeDailyTtlSeconds = () => Math.ceil(DAY_MS / 1000);

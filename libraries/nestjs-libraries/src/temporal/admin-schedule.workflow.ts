export const MISSING_POST_WORKFLOW_ID = 'missing-post-workflow-v2';
export const MISSING_POST_WORKFLOW_TYPE = 'missingPostWorkflowV2';
export const LEGACY_MISSING_POST_WORKFLOW_ID = 'missing-post-workflow';

export const AUTOPOST_WORKFLOW_TYPE = 'autoPostWorkflowV3';
export const LEGACY_AUTOPOST_WORKFLOW_TYPES = [
  'autoPostWorkflow',
  'autoPostWorkflowV2',
];
export const MISSING_POST_RECOVERY_WORKFLOW_TYPE =
  'missingPostRecoveryWorkflowV1';
export const MISSING_POST_RECOVERY_WORKFLOW_ID_PREFIX =
  'missing-post-recovery-v1';

export const PIPELINE_SCHEDULER_WORKFLOW_ID = 'pipeline-scheduler-workflow-v4';
export const PIPELINE_SCHEDULER_WORKFLOW_TYPE = 'pipelineSchedulerWorkflowV4';
export const PIPELINE_SCHEDULER_TICK_WORKFLOW_TYPE =
  'pipelineSchedulerTickWorkflowV3';
export const PIPELINE_SCHEDULER_TICK_WORKFLOW_ID_PREFIX =
  'pipeline-scheduler-tick-v3';

export const AUTOPOST_ADMIN_TRIGGER_WORKFLOW_TYPE =
  'autopostAdminTriggerWorkflowV1';
export const AUTOPOST_ADMIN_TRIGGER_WORKFLOW_ID_PREFIX =
  'autopost-admin-trigger-v1';

export const AUTOPOST_ADMIN_TRIGGER_BATCH_SIZE = 50;

export {
  LEAD_BRIDGE_ADMIN_TRIGGER_WORKFLOW_TYPE,
  LEAD_BRIDGE_ADMIN_TRIGGER_WORKFLOW_ID_PREFIX,
  LEAD_BRIDGE_ADMIN_BURST_MIN_APPLIED,
} from './lead-bridge.schedule';

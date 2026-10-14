export const CONVERSION_EVALUATION_WORKFLOW_TYPE =
  'conversionEvaluationWorkflowV1';
export const CONVERSION_EVALUATION_WORKFLOW_ID =
  'conversion-evaluation-workflow-v1';
export const CONVERSION_EVALUATION_SIGNAL = 'conversionEvaluation';
// Matches the workflow's idle cadence, which still picks up the work a
// throttled signal would have announced.
export const CONVERSION_EVALUATION_SIGNAL_INTERVAL_MS = 30 * 1000;

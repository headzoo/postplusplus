import { defineSignal } from '@temporalio/workflow';
import { CONVERSION_EVALUATION_SIGNAL } from '@gitroom/nestjs-libraries/temporal/conversion-evaluation.workflow';

export const conversionEvaluationSignal = defineSignal(
  CONVERSION_EVALUATION_SIGNAL
);

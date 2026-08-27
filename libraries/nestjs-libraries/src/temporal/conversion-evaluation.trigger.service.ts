import { Injectable } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import {
  CONVERSION_EVALUATION_SIGNAL,
  CONVERSION_EVALUATION_WORKFLOW_ID,
} from './conversion-evaluation.workflow';

@Injectable()
export class ConversionEvaluationTriggerService {
  constructor(private _temporalService: TemporalService) {}

  async signal(): Promise<boolean> {
    try {
      const workflow = this._temporalService.client?.getRawClient()?.workflow;
      if (!workflow) return false;
      await workflow
        .getHandle(CONVERSION_EVALUATION_WORKFLOW_ID)
        .signal(CONVERSION_EVALUATION_SIGNAL);
      return true;
    } catch {
      // The workflow cadence recovers persisted jobs when Temporal is unavailable.
      return false;
    }
  }
}

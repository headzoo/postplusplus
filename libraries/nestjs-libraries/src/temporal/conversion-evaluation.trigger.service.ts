import { Injectable } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import {
  CONVERSION_EVALUATION_SIGNAL,
  CONVERSION_EVALUATION_SIGNAL_INTERVAL_MS,
  CONVERSION_EVALUATION_WORKFLOW_ID,
} from './conversion-evaluation.workflow';

@Injectable()
export class ConversionEvaluationTriggerService {
  private _lastSignalAt = 0;

  constructor(private _temporalService: TemporalService) {}

  async signal(): Promise<boolean> {
    // Temporal caps one run at 10,000 signals, and a workflow that keeps
    // receiving signals cannot continue as new.
    const now = Date.now();
    if (now - this._lastSignalAt < CONVERSION_EVALUATION_SIGNAL_INTERVAL_MS) {
      return false;
    }
    try {
      const workflow = this._temporalService.client?.getRawClient()?.workflow;
      if (!workflow) return false;
      await workflow
        .getHandle(CONVERSION_EVALUATION_WORKFLOW_ID)
        .signal(CONVERSION_EVALUATION_SIGNAL);
      this._lastSignalAt = now;
      return true;
    } catch {
      // The workflow cadence recovers persisted jobs when Temporal is unavailable.
      return false;
    }
  }
}

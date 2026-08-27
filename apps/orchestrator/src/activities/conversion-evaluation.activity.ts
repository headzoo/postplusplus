import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ConversionRepository } from '@gitroom/nestjs-libraries/database/prisma/conversions/conversion.repository';
import { ConversionService } from '@gitroom/nestjs-libraries/database/prisma/conversions/conversion.service';

const MAX_BATCH_SIZE = 25;
const CLAIM_LEASE_MS = 5 * 60 * 1000;
const COMPLETED_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type ConversionEvaluationClaim = {
  jobId: string;
  claimToken: string;
};

@Injectable()
@Activity()
export class ConversionEvaluationActivity {
  constructor(
    private _repository: ConversionRepository,
    private _conversionService: ConversionService
  ) {}

  @ActivityMethod()
  claimDueJobs(request: { limit: number }) {
    return this._repository.claimDueJobsBatch(
      Math.min(Math.max(request.limit, 1), MAX_BATCH_SIZE),
      new Date(),
      CLAIM_LEASE_MS
    );
  }

  @ActivityMethod()
  async evaluateClaimedJob(request: ConversionEvaluationClaim) {
    const job = await this._repository.getClaimedJob(
      request.jobId,
      request.claimToken
    );
    if (!job) {
      return { status: 'settled' as const };
    }
    return this._conversionService.evaluateJob(job);
  }

  @ActivityMethod()
  reclaimStaleJobs(_request: Record<string, never>) {
    return this._repository.reclaimStaleProcessingJobs(
      new Date(),
      CLAIM_LEASE_MS
    );
  }

  @ActivityMethod()
  async cleanup(_request: Record<string, never>) {
    const now = new Date();
    const completedBefore = new Date(
      now.getTime() - COMPLETED_JOB_RETENTION_MS
    );
    const [jobs, clickAttributions] = await Promise.all([
      this._repository.cleanupCompletedJobs(completedBefore),
      this._repository.cleanupExpiredClickAttributions(now),
    ]);
    return {
      completedJobs: jobs.count,
      clickAttributions: clickAttributions.count,
    };
  }
}

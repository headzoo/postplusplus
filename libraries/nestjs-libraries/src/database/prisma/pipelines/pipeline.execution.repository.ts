import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  PIPELINE_SCHEDULER_GRACE_WINDOW_MS,
  getUpcomingPipelineSlots,
} from './pipeline.schedule';
import {
  ClaimPipelineSlotRequest,
  ClaimPipelineSlotResponse,
  DiscoverDuePipelineSlotsRequest,
  DiscoverDuePipelineSlotsResponse,
  FinalizePipelineSlotResponse,
} from './pipeline.execution';

const TRANSACTION_ATTEMPTS = 3;
const MAX_DISCOVERY_CANDIDATES = 100;

@Injectable()
export class PipelineExecutionRepository {
  constructor(
    private _pipeline: PrismaRepository<'pipeline'>,
    private _transaction: PrismaTransaction,
    private _execution: PrismaRepository<'pipelineSlotExecution'>
  ) {}

  async discoverDueSlots(
    request: DiscoverDuePipelineSlotsRequest
  ): Promise<DiscoverDuePipelineSlotsResponse> {
    const now = new Date(request.nowUtc);
    if (!Number.isFinite(now.getTime())) {
      return { candidates: [] };
    }
    const maximumCandidates = Math.max(
      1,
      Math.min(request.maximumCandidates, MAX_DISCOVERY_CANDIDATES)
    );
    const pipelines = await this._pipeline.model.pipeline.findMany({
      where: { active: true, deletedAt: null },
      include: { scheduleSlots: true },
    });
    const graceStart = new Date(
      now.getTime() - PIPELINE_SCHEDULER_GRACE_WINDOW_MS - 1
    );
    const dispatched = new Set(
      (
        await this._execution.model.pipelineSlotExecution.findMany({
          where: {
            pipelineId: { in: pipelines.map((pipeline: any) => pipeline.id) },
            scheduledFor: { gt: graceStart, lte: now },
          },
          select: { pipelineId: true, scheduledFor: true },
        })
      ).map(
        (execution: any) =>
          `${execution.pipelineId}:${execution.scheduledFor.toISOString()}`
      )
    );

    const candidates = pipelines.flatMap((pipeline: any) =>
      getUpcomingPipelineSlots(
        pipeline.scheduleSlots,
        pipeline.timezone,
        graceStart,
        pipeline.scheduleSlots.length
      )
        .filter(
          (scheduledFor) =>
            scheduledFor.getTime() <= now.getTime() &&
            pipeline.updatedAt.getTime() <= scheduledFor.getTime() &&
            !dispatched.has(`${pipeline.id}:${scheduledFor.toISOString()}`)
        )
        .map((scheduledFor) => ({
          occurrenceId: [
            'pipeline',
            pipeline.id,
            pipeline.scheduleRevision,
            scheduledFor.toISOString(),
          ].join(':'),
          pipelineId: pipeline.id,
          scheduleRevision: pipeline.scheduleRevision,
          scheduledFor: scheduledFor.toISOString(),
        }))
    );

    const sorted = candidates
      .sort(
        (first, second) =>
          first.scheduledFor.localeCompare(second.scheduledFor) ||
          first.pipelineId.localeCompare(second.pipelineId)
      )
      .filter(
        (candidate) =>
          !request.after ||
          candidate.scheduledFor > request.after.scheduledFor ||
          (candidate.scheduledFor === request.after.scheduledFor &&
            candidate.pipelineId > request.after.pipelineId)
      );
    const page = sorted.slice(0, maximumCandidates);
    const last = page.at(-1);

    return {
      candidates: page,
      ...(last && sorted.length > page.length
        ? {
            next: {
              scheduledFor: last.scheduledFor,
              pipelineId: last.pipelineId,
            },
          }
        : {}),
    };
  }

  claimSlot(
    request: ClaimPipelineSlotRequest
  ): Promise<ClaimPipelineSlotResponse> {
    return this.withSerializableRetry(async (tx) => {
      const scheduledFor = new Date(request.scheduledFor);
      const now = new Date(request.nowUtc);
      const pipeline = await tx.pipeline.findUnique({
        where: { id: request.pipelineId },
        include: {
          scheduleSlots: true,
          integrations: { include: { integration: true } },
        },
      });

      if (!pipeline || pipeline.deletedAt || !pipeline.active) {
        return this.skipIfPossible(
          tx,
          request,
          pipeline,
          scheduledFor,
          'INACTIVE'
        );
      }
      if (
        pipeline.scheduleRevision !== request.scheduleRevision ||
        pipeline.updatedAt.getTime() > scheduledFor.getTime()
      ) {
        return { outcome: 'SKIPPED', roots: [], reason: 'STALE_REVISION' };
      }
      if (
        !Number.isFinite(scheduledFor.getTime()) ||
        !Number.isFinite(now.getTime()) ||
        scheduledFor.getTime() > now.getTime() ||
        now.getTime() - scheduledFor.getTime() >
          PIPELINE_SCHEDULER_GRACE_WINDOW_MS
      ) {
        return this.skipIfPossible(
          tx,
          request,
          pipeline,
          scheduledFor,
          'MISSED'
        );
      }
      if (!this.isCurrentSlot(pipeline, scheduledFor)) {
        return { outcome: 'SKIPPED', roots: [], reason: 'STALE_SLOT' };
      }

      const existing = await tx.pipelineSlotExecution.findUnique({
        where: {
          pipelineId_scheduledFor: {
            pipelineId: pipeline.id,
            scheduledFor,
          },
        },
        include: {
          pipelineQueueItem: {
            include: {
              posts: {
                where: { parentPostId: null, deletedAt: null },
                include: { integration: true },
              },
            },
          },
        },
      });
      if (existing) {
        if (existing.status === 'CLAIMED' && existing.pipelineQueueItem) {
          return {
            outcome: 'CLAIMED',
            executionId: existing.id,
            queueItemId: existing.pipelineQueueItem.id,
            roots: this.toRoots(existing.pipelineQueueItem.posts),
            replayed: true,
          };
        }
        return {
          outcome: 'SKIPPED',
          executionId: existing.id,
          roots: [],
          reason: 'DUPLICATE',
          replayed: true,
        };
      }

      const item = await tx.pipelineQueueItem.findFirst({
        where: {
          pipelineId: pipeline.id,
          status: 'QUEUED',
          deletedAt: null,
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        include: {
          posts: {
            where: { deletedAt: null },
            include: { integration: true },
          },
        },
      });
      if (!item) {
        return this.createSkipped(tx, request, scheduledFor, 'EMPTY');
      }

      const roots = item.posts.filter((post: any) => !post.parentPostId);
      const expectedIntegrationIds = pipeline.integrations
        .map((entry: any) => entry.integrationId)
        .sort();
      const rootIntegrationIds = roots
        .map((post: any) => post.integrationId)
        .sort();
      const invalidIntegration = pipeline.integrations.some(
        (entry: any) =>
          entry.integration.deletedAt || entry.integration.disabled
      );
      const invalidContent =
        !roots.length ||
        item.posts.some((post: any) => post.state !== 'DRAFT') ||
        expectedIntegrationIds.join(',') !== rootIntegrationIds.join(',');

      if (invalidIntegration || invalidContent) {
        const reason = invalidIntegration
          ? 'A Pipeline integration is deleted or disabled'
          : 'Pipeline queue content no longer matches its configured integrations';
        const execution = await tx.pipelineSlotExecution.create({
          data: {
            pipelineId: pipeline.id,
            pipelineQueueItemId: item.id,
            scheduledFor,
            scheduleRevision: request.scheduleRevision,
            status: 'FAILED',
            failedAt: now,
            error: reason,
          },
        });
        await tx.pipelineQueueItem.update({
          where: { id: item.id },
          data: { status: 'FAILED', failedAt: now, error: reason },
        });
        return {
          outcome: 'FAILED',
          executionId: execution.id,
          queueItemId: item.id,
          roots: [],
          reason,
        };
      }

      const execution = await tx.pipelineSlotExecution.create({
        data: {
          pipelineId: pipeline.id,
          pipelineQueueItemId: item.id,
          scheduledFor,
          scheduleRevision: request.scheduleRevision,
          status: 'CLAIMED',
          claimedAt: now,
        },
      });
      const claimed = await tx.pipelineQueueItem.updateMany({
        where: { id: item.id, status: 'QUEUED', deletedAt: null },
        data: { status: 'PUBLISHING', claimedAt: now, error: null },
      });
      const queued = await tx.post.updateMany({
        where: {
          pipelineQueueItemId: item.id,
          state: 'DRAFT',
          deletedAt: null,
        },
        data: { state: 'QUEUE', publishDate: scheduledFor, error: null },
      });
      if (claimed.count !== 1 || queued.count !== item.posts.length) {
        throw new Error(
          'Pipeline queue item changed while it was being claimed'
        );
      }

      return {
        outcome: 'CLAIMED',
        executionId: execution.id,
        queueItemId: item.id,
        roots: this.toRoots(roots),
      };
    });
  }

  finalizeSlot(executionId: string): Promise<FinalizePipelineSlotResponse> {
    return this.withSerializableRetry(async (tx) => {
      const execution = await tx.pipelineSlotExecution.findUnique({
        where: { id: executionId },
        include: {
          pipelineQueueItem: {
            include: {
              posts: {
                where: { parentPostId: null, deletedAt: null },
                select: { state: true, error: true },
              },
            },
          },
        },
      });
      if (!execution || execution.status !== 'CLAIMED') {
        return { outcome: 'NOOP' };
      }

      const roots = execution.pipelineQueueItem?.posts || [];
      const allPublished =
        roots.length > 0 &&
        roots.every((post: any) => post.state === 'PUBLISHED');
      const reason = allPublished
        ? undefined
        : roots.find((post: any) => post.state === 'ERROR')?.error ||
          'One or more Pipeline channel posts did not publish';
      const completedAt = new Date();

      await tx.pipelineSlotExecution.update({
        where: { id: execution.id },
        data: allPublished
          ? { status: 'COMPLETED', completedAt, error: null }
          : { status: 'FAILED', failedAt: completedAt, error: reason },
      });
      if (execution.pipelineQueueItemId) {
        await tx.pipelineQueueItem.updateMany({
          where: {
            id: execution.pipelineQueueItemId,
            status: 'PUBLISHING',
          },
          data: allPublished
            ? {
                status: 'PUBLISHED',
                publishedAt: completedAt,
                error: null,
              }
            : { status: 'FAILED', failedAt: completedAt, error: reason },
        });
      }
      return allPublished
        ? { outcome: 'PUBLISHED' }
        : { outcome: 'FAILED', reason };
    });
  }

  private isCurrentSlot(pipeline: any, scheduledFor: Date): boolean {
    const occurrence = getUpcomingPipelineSlots(
      pipeline.scheduleSlots,
      pipeline.timezone,
      new Date(scheduledFor.getTime() - 1),
      1
    )[0];
    return occurrence?.getTime() === scheduledFor.getTime();
  }

  private toRoots(posts: readonly any[]) {
    return posts.map((post) => ({
      postId: post.id,
      organizationId: post.organizationId,
      taskQueue: post.integration.providerIdentifier
        .split('-')[0]
        .toLowerCase(),
    }));
  }

  private async skipIfPossible(
    tx: any,
    request: ClaimPipelineSlotRequest,
    pipeline: any,
    scheduledFor: Date,
    reason: 'INACTIVE' | 'MISSED'
  ): Promise<ClaimPipelineSlotResponse> {
    if (
      !pipeline ||
      pipeline.scheduleRevision !== request.scheduleRevision ||
      !Number.isFinite(scheduledFor.getTime())
    ) {
      return { outcome: 'SKIPPED', roots: [], reason };
    }
    return this.createSkipped(tx, request, scheduledFor, reason);
  }

  private async createSkipped(
    tx: any,
    request: ClaimPipelineSlotRequest,
    scheduledFor: Date,
    reason: 'EMPTY' | 'INACTIVE' | 'MISSED'
  ): Promise<ClaimPipelineSlotResponse> {
    const execution = await tx.pipelineSlotExecution.upsert({
      where: {
        pipelineId_scheduledFor: {
          pipelineId: request.pipelineId,
          scheduledFor,
        },
      },
      create: {
        pipelineId: request.pipelineId,
        scheduledFor,
        scheduleRevision: request.scheduleRevision,
        status: 'SKIPPED',
        completedAt: new Date(),
        error: reason,
      },
      update: {},
    });
    return {
      outcome: 'SKIPPED',
      executionId: execution.id,
      roots: [],
      reason,
    };
  }

  private async withSerializableRetry<T>(
    callback: (tx: any) => Promise<T>
  ): Promise<T> {
    let error: unknown;
    for (let attempt = 0; attempt < TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await (this._transaction.model as any).$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (caught: any) {
        error = caught;
        if (caught?.code !== 'P2034' || attempt === TRANSACTION_ATTEMPTS - 1) {
          throw caught;
        }
      }
    }
    throw error;
  }
}

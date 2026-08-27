import { Injectable } from '@nestjs/common';
import { Integration, Post, PostRule, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  PostRuleEvaluationActionResult,
  PostRuleEvaluationStatus,
  PostRuleNormalizedMetrics,
  PostRuleRunStatus,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';

const TRANSACTION_ATTEMPTS = 3;

export type PostRuleAssignedRule = PostRule & {
  integrations: { integrationId: string }[];
  pipelines: { pipelineId: string }[];
};

export type PostRuleRootPost = Post & {
  integration: Integration;
  pipelineQueueItem: { pipelineId: string } | null;
};

export type PostRuleRunEvaluationRow = {
  id: string;
  evaluationIndex: number;
  scheduledAt: Date;
  status: PostRuleEvaluationStatus;
};

export type PostRuleEnsuredRun = {
  id: string;
  status: PostRuleRunStatus;
  lineageId: string;
  rescheduleAttempt: number;
  evaluations: PostRuleRunEvaluationRow[];
};

export type PostRuleClaim = {
  outcome: 'CLAIMED';
  evaluation: {
    id: string;
    evaluationIndex: number;
    actionResult: PostRuleEvaluationActionResult | null;
  };
  evaluationCount: number;
  run: {
    id: string;
    organizationId: string;
    lineageId: string;
    rescheduleAttempt: number;
  };
  rule: PostRuleAssignedRule | null;
  post: PostRuleRootPost;
};

export type PostRuleClaimResult =
  | PostRuleClaim
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'BUSY' }
  | {
      outcome: 'REPLAYED';
      status: PostRuleEvaluationStatus;
      terminalRun: boolean;
      actionResult: PostRuleEvaluationActionResult | null;
      errorSummary: string | null;
    };

export type FinalizePostRuleEvaluation = {
  evaluationId: string;
  runId: string;
  status: PostRuleEvaluationStatus;
  metrics?: PostRuleNormalizedMetrics;
  actionResult?: PostRuleEvaluationActionResult;
  errorSummary?: string;
  runStatus?: PostRuleRunStatus;
};

const assignmentsInclude = {
  integrations: { select: { integrationId: true } },
  pipelines: { select: { pipelineId: true } },
} satisfies Prisma.PostRuleInclude;

@Injectable()
export class PostRulesExecutionRepository {
  constructor(
    private _postRule: PrismaRepository<'postRule'>,
    private _postRuleRun: PrismaRepository<'postRuleRun'>,
    private _postRuleEvaluation: PrismaRepository<'postRuleEvaluation'>,
    private _post: PrismaRepository<'post'>,
    private _pipeline: PrismaRepository<'pipeline'>,
    private _transaction: PrismaTransaction
  ) {}

  getPublishedRoot(
    orgId: string,
    postId: string,
    integrationId: string
  ): Promise<PostRuleRootPost | null> {
    return this._post.model.post.findFirst({
      where: {
        id: postId,
        organizationId: orgId,
        integrationId,
        parentPostId: null,
        deletedAt: null,
        platformDeletedAt: null,
        state: 'PUBLISHED',
      },
      include: {
        integration: true,
        pipelineQueueItem: { select: { pipelineId: true } },
      },
    }) as Promise<PostRuleRootPost | null>;
  }

  getEnabledRulesForTarget(
    orgId: string,
    integrationId: string,
    pipelineId: string | null
  ): Promise<PostRuleAssignedRule[]> {
    return this._postRule.model.postRule.findMany({
      where: {
        organizationId: orgId,
        enabled: true,
        OR: [
          { integrations: { some: { integrationId } } },
          ...(pipelineId ? [{ pipelines: { some: { pipelineId } } }] : []),
        ],
      },
      include: assignmentsInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Idempotent per (rule, post): a resolver retry reuses the existing run and
   * only adds evaluation rows that are still missing, so lineage and attempt
   * counters survive workflow replays and pre-created successor runs.
   */
  ensureRun(
    orgId: string,
    ruleId: string,
    postId: string,
    schedule: readonly { evaluationIndex: number; scheduledAt: Date }[]
  ): Promise<PostRuleEnsuredRun> {
    return this.withSerializableRetry(async (tx) => {
      const existing = await tx.postRuleRun.findFirst({
        where: { ruleId, postId },
        select: {
          id: true,
          status: true,
          lineageId: true,
          rescheduleAttempt: true,
        },
      });

      const run =
        existing ||
        (await tx.postRuleRun.create({
          data: {
            organizationId: orgId,
            ruleId,
            postId,
            lineageId: uuidv4(),
            rescheduleAttempt: 0,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            status: true,
            lineageId: true,
            rescheduleAttempt: true,
          },
        }));

      const stored = await tx.postRuleEvaluation.findMany({
        where: { runId: run.id },
        select: {
          id: true,
          evaluationIndex: true,
          scheduledAt: true,
          status: true,
        },
      });
      const known = new Set(stored.map((row: any) => row.evaluationIndex));

      for (const entry of schedule) {
        if (known.has(entry.evaluationIndex)) {
          continue;
        }
        stored.push(
          await tx.postRuleEvaluation.create({
            data: {
              organizationId: orgId,
              runId: run.id,
              evaluationIndex: entry.evaluationIndex,
              scheduledAt: entry.scheduledAt,
              status: 'PENDING',
            },
            select: {
              id: true,
              evaluationIndex: true,
              scheduledAt: true,
              status: true,
            },
          })
        );
      }

      return {
        ...run,
        evaluations: stored.sort(
          (first: any, second: any) =>
            first.evaluationIndex - second.evaluationIndex
        ),
      } as PostRuleEnsuredRun;
    });
  }

  /**
   * Compare-and-set claim. Only one caller can move an evaluation into
   * `PROCESSING`; terminal evaluations replay their stored outcome and a live
   * claim reports `BUSY` so the caller retries later instead of duplicating the
   * remote side effects.
   */
  claimEvaluation(
    orgId: string,
    runId: string,
    evaluationIndex: number,
    now: Date,
    staleClaimMs: number
  ): Promise<PostRuleClaimResult> {
    return this.withSerializableRetry(async (tx) => {
      const evaluation = await tx.postRuleEvaluation.findFirst({
        where: { runId, evaluationIndex, organizationId: orgId },
        include: {
          run: {
            include: {
              rule: { include: assignmentsInclude },
              post: {
                include: {
                  integration: true,
                  pipelineQueueItem: { select: { pipelineId: true } },
                },
              },
              _count: { select: { evaluations: true } },
            },
          },
        },
      });

      if (!evaluation || !evaluation.run || !evaluation.run.post) {
        return { outcome: 'NOT_FOUND' as const };
      }

      if (
        evaluation.status === 'COMPLETED' ||
        evaluation.status === 'SKIPPED'
      ) {
        return {
          outcome: 'REPLAYED' as const,
          status: evaluation.status,
          terminalRun: evaluation.run.status !== 'ACTIVE',
          actionResult:
            (evaluation.actionResult as PostRuleEvaluationActionResult | null) ||
            null,
          errorSummary: evaluation.errorSummary || null,
        };
      }

      if (
        evaluation.status === 'PROCESSING' &&
        evaluation.claimedAt &&
        now.getTime() - evaluation.claimedAt.getTime() < staleClaimMs
      ) {
        return { outcome: 'BUSY' as const };
      }

      if (evaluation.run.status !== 'ACTIVE') {
        await tx.postRuleEvaluation.update({
          where: { id: evaluation.id },
          data: { status: 'SKIPPED', completedAt: now },
        });
        return {
          outcome: 'REPLAYED' as const,
          status: 'SKIPPED' as const,
          terminalRun: true,
          actionResult: { matched: false, skippedReason: 'RUN_NOT_ACTIVE' },
          errorSummary: null,
        };
      }

      const claimed = await tx.postRuleEvaluation.updateMany({
        where: {
          id: evaluation.id,
          status: evaluation.status,
          ...(evaluation.claimedAt
            ? { claimedAt: evaluation.claimedAt }
            : { claimedAt: null }),
        },
        data: { status: 'PROCESSING', claimedAt: now },
      });
      if (claimed.count !== 1) {
        return { outcome: 'BUSY' as const };
      }

      return {
        outcome: 'CLAIMED' as const,
        evaluation: {
          id: evaluation.id,
          evaluationIndex: evaluation.evaluationIndex,
          actionResult:
            (evaluation.actionResult as PostRuleEvaluationActionResult | null) ||
            null,
        },
        evaluationCount: evaluation.run._count.evaluations,
        run: {
          id: evaluation.run.id,
          organizationId: evaluation.run.organizationId,
          lineageId: evaluation.run.lineageId,
          rescheduleAttempt: evaluation.run.rescheduleAttempt,
        },
        rule: evaluation.run.rule,
        post: evaluation.run.post,
      };
    });
  }

  /**
   * Records a side effect that already happened while the evaluation stays
   * claimed, so a retry after a partial failure resumes instead of repeating it.
   */
  recordEvaluationProgress(
    evaluationId: string,
    actionResult: PostRuleEvaluationActionResult
  ) {
    return this._postRuleEvaluation.model.postRuleEvaluation.update({
      where: { id: evaluationId },
      data: { actionResult: actionResult as unknown as Prisma.InputJsonValue },
    });
  }

  finalizeEvaluation(request: FinalizePostRuleEvaluation) {
    return this.withSerializableRetry(async (tx) => {
      const completedAt = new Date();
      await tx.postRuleEvaluation.update({
        where: { id: request.evaluationId },
        data: {
          status: request.status,
          completedAt,
          ...(request.metrics
            ? { metrics: request.metrics as unknown as Prisma.InputJsonValue }
            : {}),
          ...(request.actionResult
            ? {
                actionResult:
                  request.actionResult as unknown as Prisma.InputJsonValue,
              }
            : {}),
          errorSummary: request.errorSummary || null,
        },
      });

      if (request.runStatus) {
        await tx.postRuleRun.updateMany({
          where: { id: request.runId, status: 'ACTIVE' },
          data: {
            status: request.runStatus,
            ...(request.runStatus === 'FAILED'
              ? { failedAt: completedAt }
              : { completedAt }),
          },
        });
      }

      return { finalized: true };
    });
  }

  findSuccessorRun(
    ruleId: string,
    lineageId: string,
    rescheduleAttempt: number
  ) {
    return this._postRuleRun.model.postRuleRun.findFirst({
      where: { ruleId, lineageId, rescheduleAttempt },
      select: { id: true, postId: true },
    });
  }

  createSuccessorRun(
    orgId: string,
    ruleId: string,
    postId: string,
    lineageId: string,
    rescheduleAttempt: number
  ) {
    return this.withSerializableRetry(async (tx) => {
      const existing = await tx.postRuleRun.findFirst({
        where: { ruleId, postId },
        select: { id: true, postId: true },
      });
      if (existing) {
        return existing;
      }
      return tx.postRuleRun.create({
        data: {
          organizationId: orgId,
          ruleId,
          postId,
          lineageId,
          rescheduleAttempt,
          status: 'ACTIVE',
        },
        select: { id: true, postId: true },
      });
    });
  }

  getRemovableGroupMembers(
    orgId: string,
    group: string,
    integrationId: string
  ) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        group,
        integrationId,
        deletedAt: null,
      },
      select: {
        id: true,
        parentPostId: true,
        releaseId: true,
        platformDeletedAt: true,
      },
    });
  }

  async markPostsPlatformDeleted(
    orgId: string,
    postIds: readonly string[],
    deletedAt: Date
  ) {
    if (!postIds.length) {
      return { updated: 0 };
    }
    const result = await this._post.model.post.updateMany({
      where: {
        organizationId: orgId,
        id: { in: [...postIds] },
        platformDeletedAt: null,
      },
      data: { platformDeletedAt: deletedAt },
    });
    return { updated: result.count };
  }

  getRootPostByGroup(orgId: string, group: string, integrationId: string) {
    return this._post.model.post.findFirst({
      where: {
        organizationId: orgId,
        group,
        integrationId,
        parentPostId: null,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  getReschedulePipeline(orgId: string, pipelineId: string) {
    return this._pipeline.model.pipeline.findFirst({
      where: {
        id: pipelineId,
        organizationId: orgId,
        deletedAt: null,
        active: true,
      },
      select: {
        id: true,
        integrations: {
          select: {
            integration: {
              select: {
                id: true,
                providerIdentifier: true,
                disabled: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });
  }

  private async withSerializableRetry<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this._transaction.model.$transaction(callback, {
          isolationLevel: 'Serializable',
        });
      } catch (error) {
        lastError = error;
        if (
          (error as { code?: string })?.code !== 'P2034' ||
          attempt === TRANSACTION_ATTEMPTS - 1
        ) {
          throw error;
        }
      }
    }
    throw lastError;
  }
}

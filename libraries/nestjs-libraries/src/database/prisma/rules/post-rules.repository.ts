import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostRule, Prisma } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  CreatePostRuleDto,
  UpdatePostRuleDto,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.dto';

const TRANSACTION_ATTEMPTS = 3;

const ruleWithAssignmentsInclude = {
  integrations: {
    select: { integrationId: true },
  },
  pipelines: {
    select: { pipelineId: true },
  },
} satisfies Prisma.PostRuleInclude;

const listInclude = {
  integrations: {
    select: { integrationId: true },
  },
  _count: {
    select: {
      integrations: true,
      pipelines: true,
    },
  },
} satisfies Prisma.PostRuleInclude;

export type PostRuleWithAssignments = PostRule & {
  integrations: { integrationId: string }[];
  pipelines: { pipelineId: string }[];
};

export type PostRuleListRow = PostRule & {
  integrations: { integrationId: string }[];
  _count: {
    integrations: number;
    pipelines: number;
  };
};

export type AssignmentIntegrationRow = {
  id: string;
  providerIdentifier: string;
  disabled: boolean;
  deletedAt: Date | null;
};

export type AssignmentPipelineRow = {
  id: string;
  active: boolean;
  deletedAt: Date | null;
  integrations: {
    integration: AssignmentIntegrationRow;
  }[];
};

@Injectable()
export class PostRulesRepository {
  constructor(
    private _postRule: PrismaRepository<'postRule'>,
    private _integration: PrismaRepository<'integration'>,
    private _pipeline: PrismaRepository<'pipeline'>,
    private _transaction: PrismaTransaction
  ) {}

  list(orgId: string): Promise<PostRuleListRow[]> {
    return this._postRule.model.postRule.findMany({
      where: { organizationId: orgId },
      include: listInclude,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  getById(
    orgId: string,
    ruleId: string
  ): Promise<PostRuleWithAssignments | null> {
    return this._postRule.model.postRule.findFirst({
      where: { id: ruleId, organizationId: orgId },
      include: ruleWithAssignmentsInclude,
    });
  }

  create(
    orgId: string,
    body: CreatePostRuleDto
  ): Promise<PostRuleWithAssignments> {
    return this._postRule.model.postRule.create({
      data: this.toCreateData(orgId, body),
      include: ruleWithAssignmentsInclude,
    });
  }

  async update(
    orgId: string,
    ruleId: string,
    body: UpdatePostRuleDto
  ): Promise<PostRuleWithAssignments | null> {
    const existing = await this.getById(orgId, ruleId);
    if (!existing) {
      return null;
    }

    return this._postRule.model.postRule.update({
      where: { id: ruleId },
      data: this.toUpdateData(body),
      include: ruleWithAssignmentsInclude,
    });
  }

  async delete(orgId: string, ruleId: string): Promise<boolean> {
    const result = await this._postRule.model.postRule.deleteMany({
      where: { id: ruleId, organizationId: orgId },
    });
    return result.count > 0;
  }

  async setEnabled(
    orgId: string,
    ruleId: string,
    enabled: boolean
  ): Promise<PostRuleWithAssignments | null> {
    const existing = await this.getById(orgId, ruleId);
    if (!existing) {
      return null;
    }

    return this._postRule.model.postRule.update({
      where: { id: ruleId },
      data: { enabled },
      include: ruleWithAssignmentsInclude,
    });
  }

  getIntegrationsForAssignment(
    orgId: string,
    integrationIds: string[]
  ): Promise<AssignmentIntegrationRow[]> {
    if (!integrationIds.length) {
      return Promise.resolve([]);
    }

    return this._integration.model.integration.findMany({
      where: {
        organizationId: orgId,
        id: { in: integrationIds },
      },
      select: {
        id: true,
        providerIdentifier: true,
        disabled: true,
        deletedAt: true,
      },
    });
  }

  getPipelinesForAssignment(
    orgId: string,
    pipelineIds: string[]
  ): Promise<AssignmentPipelineRow[]> {
    if (!pipelineIds.length) {
      return Promise.resolve([]);
    }

    return this._pipeline.model.pipeline.findMany({
      where: {
        organizationId: orgId,
        id: { in: pipelineIds },
      },
      select: {
        id: true,
        active: true,
        deletedAt: true,
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

  getPipelineRescheduleTarget(orgId: string, pipelineId: string) {
    return this._pipeline.model.pipeline.findFirst({
      where: {
        id: pipelineId,
        organizationId: orgId,
        deletedAt: null,
        active: true,
      },
      select: { id: true },
    });
  }

  assertUniqueIds(ids: string[], label: string) {
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(`Duplicate ${label} are not allowed`);
    }
  }

  async replaceAssignments(
    orgId: string,
    ruleId: string,
    integrationIds: string[],
    pipelineIds: string[]
  ): Promise<PostRuleWithAssignments | null> {
    this.assertUniqueIds(integrationIds, 'channel assignments');
    this.assertUniqueIds(pipelineIds, 'pipeline assignments');

    return this.withSerializableRetry(async (tx) => {
      const rule = await tx.postRule.findFirst({
        where: { id: ruleId, organizationId: orgId },
        select: { id: true },
      });
      if (!rule) {
        return null;
      }

      await tx.postRuleIntegration.deleteMany({
        where: { ruleId, organizationId: orgId },
      });
      await tx.postRulePipeline.deleteMany({
        where: { ruleId, organizationId: orgId },
      });

      if (integrationIds.length) {
        await tx.postRuleIntegration.createMany({
          data: integrationIds.map((integrationId) => ({
            organizationId: orgId,
            ruleId,
            integrationId,
          })),
        });
      }

      if (pipelineIds.length) {
        await tx.postRulePipeline.createMany({
          data: pipelineIds.map((pipelineId) => ({
            organizationId: orgId,
            ruleId,
            pipelineId,
          })),
        });
      }

      return tx.postRule.findFirst({
        where: { id: ruleId, organizationId: orgId },
        include: ruleWithAssignmentsInclude,
      });
    });
  }

  private toCreateData(
    orgId: string,
    body: CreatePostRuleDto
  ): Prisma.PostRuleCreateInput {
    return {
      organization: { connect: { id: orgId } },
      name: body.name,
      enabled: body.enabled ?? true,
      action: body.action,
      initialDelayHours: body.initialDelayHours,
      evaluationIntervalHours: body.evaluationIntervalHours ?? null,
      maxEvaluations: body.maxEvaluations ?? null,
      conditionMatch: body.conditionMatch,
      conditions: body.conditions as unknown as Prisma.InputJsonValue,
      actionConfig: (body.actionConfig ??
        {}) as unknown as Prisma.InputJsonValue,
      rescheduleConfig: (body.rescheduleConfig ??
        null) as unknown as Prisma.InputJsonValue,
      maxRescheduleAttempts: body.maxRescheduleAttempts ?? null,
    };
  }

  private toUpdateData(body: UpdatePostRuleDto): Prisma.PostRuleUpdateInput {
    return {
      name: body.name,
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      action: body.action,
      initialDelayHours: body.initialDelayHours,
      evaluationIntervalHours: body.evaluationIntervalHours ?? null,
      maxEvaluations: body.maxEvaluations ?? null,
      conditionMatch: body.conditionMatch,
      conditions: body.conditions as unknown as Prisma.InputJsonValue,
      actionConfig: (body.actionConfig ??
        {}) as unknown as Prisma.InputJsonValue,
      rescheduleConfig: (body.rescheduleConfig ??
        null) as unknown as Prisma.InputJsonValue,
      maxRescheduleAttempts: body.maxRescheduleAttempts ?? null,
    };
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
          !this.isSerializationFailure(error) ||
          attempt === TRANSACTION_ATTEMPTS - 1
        ) {
          throw error;
        }
      }
    }
    throw lastError ?? new NotFoundException('Assignment replacement failed');
  }

  private isSerializationFailure(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2034'
    );
  }
}

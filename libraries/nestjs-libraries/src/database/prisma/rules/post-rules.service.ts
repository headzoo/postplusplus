import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  CreatePostRuleDto,
  PostRuleActivationDto,
  ReplacePostRuleAssignmentsDto,
  UpdatePostRuleDto,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.dto';
import {
  POST_RULE_ACTIONS,
  POST_RULE_CONDITION_METRICS,
  PostRuleAction,
  PostRuleActionConfig,
  PostRuleCapabilitiesResponse,
  PostRuleCondition,
  PostRuleConditionMetric,
  PostRuleListItemResponse,
  PostRuleRescheduleConfig,
  PostRuleResponse,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';
import {
  AssignmentIntegrationRow,
  AssignmentPipelineRow,
  PostRuleListRow,
  PostRulesRepository,
  PostRuleWithAssignments,
} from '@gitroom/nestjs-libraries/database/prisma/rules/post-rules.repository';

const ACTION_LABELS: Record<PostRuleAction, string> = {
  REMOVE: 'Remove post',
  AUTO_REPOST: 'Auto repost',
  AUTO_PLUG: 'Auto plug',
  NOTIFY: 'Send notification',
};

const METRIC_LABELS: Record<PostRuleConditionMetric, string> = {
  LIKES: 'Likes',
  REPLIES: 'Replies',
};

type ProviderCapabilities = ReturnType<
  IntegrationManager['getPostRulesCapabilities']
>;

@Injectable()
export class PostRulesService {
  constructor(
    private _postRulesRepository: PostRulesRepository,
    private _integrationManager: IntegrationManager
  ) {}

  getCapabilities(): PostRuleCapabilitiesResponse {
    const providerMap = this._integrationManager.getPostRulesCapabilities();
    const metricsByAction = new Map<
      PostRuleAction,
      Set<PostRuleConditionMetric>
    >();

    for (const capabilities of Object.values(providerMap)) {
      for (const action of capabilities.actions as PostRuleAction[]) {
        if (!metricsByAction.has(action)) {
          metricsByAction.set(action, new Set());
        }
        for (const metric of capabilities.metrics as PostRuleConditionMetric[]) {
          metricsByAction.get(action)!.add(metric);
        }
      }
    }

    return {
      actions: POST_RULE_ACTIONS.filter((action) =>
        metricsByAction.has(action)
      ).map((action) => ({
        key: action,
        label: ACTION_LABELS[action],
        metrics: POST_RULE_CONDITION_METRICS.filter((metric) =>
          metricsByAction.get(action)?.has(metric)
        ).map((metric) => ({
          key: metric,
          label: METRIC_LABELS[metric],
        })),
      })),
      providers: Object.entries(providerMap).map(
        ([providerIdentifier, capabilities]) => ({
          providerIdentifier,
          actions: capabilities.actions as PostRuleAction[],
          metrics: capabilities.metrics as PostRuleConditionMetric[],
        })
      ),
    };
  }

  async list(orgId: string): Promise<PostRuleListItemResponse[]> {
    const rules = await this._postRulesRepository.list(orgId);
    return rules.map((rule) => this.toListItem(rule));
  }

  async getById(orgId: string, ruleId: string): Promise<PostRuleResponse> {
    const rule = await this.requireRule(orgId, ruleId);
    return this.toResponse(rule);
  }

  async create(
    orgId: string,
    body: CreatePostRuleDto
  ): Promise<PostRuleResponse> {
    await this.validateRescheduleTarget(orgId, body.rescheduleConfig ?? null);
    const rule = await this._postRulesRepository.create(orgId, body);
    return this.toResponse(rule);
  }

  async update(
    orgId: string,
    ruleId: string,
    body: UpdatePostRuleDto
  ): Promise<PostRuleResponse> {
    const existing = await this.requireRule(orgId, ruleId);
    await this.validateRescheduleTarget(orgId, body.rescheduleConfig ?? null);
    await this.assertAssignmentsSupportDefinition(
      orgId,
      existing,
      body.action,
      body.conditions
    );

    const updated = await this._postRulesRepository.update(orgId, ruleId, body);
    if (!updated) {
      throw new NotFoundException('Rule not found');
    }

    return this.toResponse(updated);
  }

  async delete(orgId: string, ruleId: string): Promise<{ id: string }> {
    const deleted = await this._postRulesRepository.delete(orgId, ruleId);
    if (!deleted) {
      throw new NotFoundException('Rule not found');
    }
    return { id: ruleId };
  }

  async setEnabled(
    orgId: string,
    ruleId: string,
    body: PostRuleActivationDto
  ): Promise<PostRuleResponse> {
    const updated = await this._postRulesRepository.setEnabled(
      orgId,
      ruleId,
      body.enabled
    );
    if (!updated) {
      throw new NotFoundException('Rule not found');
    }
    return this.toResponse(updated);
  }

  async replaceAssignments(
    orgId: string,
    ruleId: string,
    body: ReplacePostRuleAssignmentsDto
  ): Promise<PostRuleResponse> {
    const rule = await this.requireRule(orgId, ruleId);
    const capabilities = this._integrationManager.getPostRulesCapabilities();
    const conditions = rule.conditions as PostRuleCondition[];

    await this.validateAssignmentIds(
      orgId,
      body.integrationIds,
      body.pipelineIds,
      rule.action,
      conditions,
      capabilities
    );

    const updated = await this._postRulesRepository.replaceAssignments(
      orgId,
      ruleId,
      body.integrationIds,
      body.pipelineIds
    );
    if (!updated) {
      throw new NotFoundException('Rule not found');
    }

    return this.toResponse(updated);
  }

  private async requireRule(
    orgId: string,
    ruleId: string
  ): Promise<PostRuleWithAssignments> {
    const rule = await this._postRulesRepository.getById(orgId, ruleId);
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    return rule;
  }

  private async validateRescheduleTarget(
    orgId: string,
    rescheduleConfig: PostRuleRescheduleConfig | null
  ) {
    if (!rescheduleConfig || rescheduleConfig.mode !== 'PIPELINE') {
      return;
    }

    const pipeline =
      await this._postRulesRepository.getPipelineRescheduleTarget(
        orgId,
        rescheduleConfig.pipelineId
      );
    if (!pipeline) {
      throw new BadRequestException('Reschedule pipeline target is invalid');
    }
  }

  private async assertAssignmentsSupportDefinition(
    orgId: string,
    rule: PostRuleWithAssignments,
    action: PostRuleAction,
    conditions: PostRuleCondition[]
  ) {
    const integrationIds = rule.integrations.map(
      (entry) => entry.integrationId
    );
    const pipelineIds = rule.pipelines.map((entry) => entry.pipelineId);
    if (!integrationIds.length && !pipelineIds.length) {
      return;
    }

    const capabilities = this._integrationManager.getPostRulesCapabilities();
    await this.validateAssignmentIds(
      orgId,
      integrationIds,
      pipelineIds,
      action,
      conditions,
      capabilities
    );
  }

  private async validateAssignmentIds(
    orgId: string,
    integrationIds: string[],
    pipelineIds: string[],
    action: PostRuleAction,
    conditions: PostRuleCondition[],
    capabilities: ProviderCapabilities
  ) {
    this._postRulesRepository.assertUniqueIds(
      integrationIds,
      'channel assignments'
    );
    this._postRulesRepository.assertUniqueIds(
      pipelineIds,
      'pipeline assignments'
    );

    const integrations =
      await this._postRulesRepository.getIntegrationsForAssignment(
        orgId,
        integrationIds
      );
    this.assertOwnedIds(
      integrationIds,
      integrations.map((integration) => integration.id),
      'channel'
    );

    for (const integration of integrations) {
      this.assertActiveIntegration(integration);
      this.assertIntegrationSupportsRule(
        integration.providerIdentifier,
        action,
        conditions,
        capabilities
      );
    }

    const pipelines = await this._postRulesRepository.getPipelinesForAssignment(
      orgId,
      pipelineIds
    );
    this.assertOwnedIds(
      pipelineIds,
      pipelines.map((pipeline) => pipeline.id),
      'pipeline'
    );

    for (const pipeline of pipelines) {
      this.assertActivePipeline(pipeline);
      const eligibleIntegrations = pipeline.integrations
        .map((entry) => entry.integration)
        .filter((integration) => this.isActiveIntegration(integration));

      if (!eligibleIntegrations.length) {
        throw new BadRequestException(
          'Assigned pipeline must include at least one active channel'
        );
      }

      const supportsRule = eligibleIntegrations.some((integration) =>
        this.integrationSupportsRule(
          integration.providerIdentifier,
          action,
          conditions,
          capabilities
        )
      );
      if (!supportsRule) {
        throw new BadRequestException(
          'Assigned pipeline does not include a channel that supports this rule'
        );
      }
    }
  }

  private assertOwnedIds(
    requestedIds: string[],
    ownedIds: string[],
    label: string
  ) {
    const owned = new Set(ownedIds);
    const missing = requestedIds.filter((id) => !owned.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `Unknown ${label} assignment: ${missing.join(', ')}`
      );
    }
  }

  private assertActiveIntegration(integration: AssignmentIntegrationRow) {
    if (!this.isActiveIntegration(integration)) {
      throw new BadRequestException(
        'Assigned channel must be active and not deleted'
      );
    }
  }

  private isActiveIntegration(integration: AssignmentIntegrationRow) {
    return !integration.disabled && !integration.deletedAt;
  }

  private assertActivePipeline(pipeline: AssignmentPipelineRow) {
    if (pipeline.deletedAt || !pipeline.active) {
      throw new BadRequestException(
        'Assigned pipeline must be active and not deleted'
      );
    }
  }

  private assertIntegrationSupportsRule(
    providerIdentifier: string,
    action: PostRuleAction,
    conditions: PostRuleCondition[],
    capabilities: ProviderCapabilities
  ) {
    if (
      !this.integrationSupportsRule(
        providerIdentifier,
        action,
        conditions,
        capabilities
      )
    ) {
      throw new BadRequestException(
        `Channel provider ${providerIdentifier} does not support this rule`
      );
    }
  }

  private integrationSupportsRule(
    providerIdentifier: string,
    action: PostRuleAction,
    conditions: PostRuleCondition[],
    capabilities: ProviderCapabilities
  ) {
    const providerCapabilities = capabilities[providerIdentifier];
    if (!providerCapabilities) {
      return false;
    }
    if (!providerCapabilities.actions.includes(action)) {
      return false;
    }
    return conditions.every((condition) =>
      providerCapabilities.metrics.includes(condition.metric)
    );
  }

  private toListItem(rule: PostRuleListRow): PostRuleListItemResponse {
    return {
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      action: rule.action,
      initialDelayHours: rule.initialDelayHours,
      evaluationIntervalHours: rule.evaluationIntervalHours,
      maxEvaluations: rule.maxEvaluations,
      conditionMatch: rule.conditionMatch,
      conditions: rule.conditions as PostRuleCondition[],
      integrationIds: rule.integrations.map((entry) => entry.integrationId),
      integrationCount: rule._count.integrations,
      pipelineCount: rule._count.pipelines,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }

  private toResponse(rule: PostRuleWithAssignments): PostRuleResponse {
    return {
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      action: rule.action,
      initialDelayHours: rule.initialDelayHours,
      evaluationIntervalHours: rule.evaluationIntervalHours,
      maxEvaluations: rule.maxEvaluations,
      conditionMatch: rule.conditionMatch,
      conditions: rule.conditions as PostRuleCondition[],
      actionConfig: (rule.actionConfig ?? {}) as PostRuleActionConfig,
      rescheduleConfig:
        (rule.rescheduleConfig as PostRuleRescheduleConfig | null) ?? null,
      maxRescheduleAttempts: rule.maxRescheduleAttempts,
      integrationIds: rule.integrations.map((entry) => entry.integrationId),
      pipelineIds: rule.pipelines.map((entry) => entry.pipelineId),
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}

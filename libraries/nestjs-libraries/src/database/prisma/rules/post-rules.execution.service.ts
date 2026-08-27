import { Injectable } from '@nestjs/common';
import { Integration } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  PostRulesCapability,
  PostRulesCapabilityMetadata,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PipelineService } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.service';
import { timer } from '@gitroom/helpers/utils/timer';
import {
  PostRuleAction,
  PostRuleAutoPlugActionConfig,
  PostRuleCondition,
  PostRuleConditionMetric,
  PostRuleEvaluationActionResult,
  PostRuleEvaluationWorkResult,
  PostRuleNormalizedMetrics,
  PostRuleRescheduleConfig,
  PostRuleSnapshot,
  PostRuleWorkItem,
  ProcessPostRuleEvaluationRequest,
  ResolvePostRulesRequest,
  ResolvePostRulesResponse,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';
import {
  PostRuleAssignedRule,
  PostRuleClaim,
  PostRuleRootPost,
  PostRulesExecutionRepository,
} from '@gitroom/nestjs-libraries/database/prisma/rules/post-rules.execution.repository';
import {
  evaluatePostRuleConditions,
  buildPostRuleNotifyMessage,
  orderPostGroupForRemoval,
  POST_RULE_STALE_CLAIM_MS,
  postRuleEvaluationCount,
  postRuleEvaluationScheduledAt,
  postRuleSuccessorKey,
  PostRuleSkipReason,
  resolveManualRescheduleDate,
} from '@gitroom/nestjs-libraries/database/prisma/rules/post-rules.execution';
import { isPollingPostRuleAction } from '@gitroom/nestjs-libraries/database/prisma/rules/post-rules.domain';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';

dayjs.extend(utc);

const ACTION_METADATA_KEYS: Record<
  PostRuleAction,
  keyof PostRulesCapabilityMetadata['actions']
> = {
  REMOVE: 'remove',
  AUTO_REPOST: 'autoRepost',
  AUTO_PLUG: 'autoPlug',
  NOTIFY: 'notify',
};

const METRIC_METADATA_KEYS: Record<
  PostRuleConditionMetric,
  keyof PostRulesCapabilityMetadata['metrics']
> = {
  LIKES: 'likes',
  REPLIES: 'replies',
};

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

/**
 * Generic Rules engine. It owns condition evaluation, lineage, attempt limits
 * and scheduling; every provider interaction goes through the typed
 * `postRules` capability so no provider identifier is ever branched on here.
 */
@Injectable()
export class PostRulesExecutionService {
  constructor(
    private _executionRepository: PostRulesExecutionRepository,
    private _integrationManager: IntegrationManager,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _postsService: PostsService,
    private _pipelineService: PipelineService,
    private _notificationService: NotificationService
  ) {}

  /**
   * Turns a freshly published post into durable evaluation work. Called once per
   * published root; retries are idempotent because runs and evaluations are
   * keyed by (rule, post) and (run, evaluation index).
   */
  async resolveForPost(
    request: ResolvePostRulesRequest
  ): Promise<ResolvePostRulesResponse> {
    const root = await this._executionRepository.getPublishedRoot(
      request.organizationId,
      request.postId,
      request.integrationId
    );
    if (!root || !this.hasUsableRelease(root.releaseId)) {
      return { items: [] };
    }
    if (root.integration.disabled || root.integration.deletedAt) {
      return { items: [] };
    }

    const capabilities =
      this._integrationManager.getPostRulesCapabilities()[
        root.integration.providerIdentifier
      ];
    if (!capabilities) {
      return { items: [] };
    }

    const pipelineId = root.pipelineQueueItem?.pipelineId || null;
    const rules = await this._executionRepository.getEnabledRulesForTarget(
      request.organizationId,
      request.integrationId,
      pipelineId
    );

    const now = Date.now();
    const resolutionInstant = new Date(now);
    const evaluationAnchor = new Date(
      Math.max(root.publishDate.getTime(), resolutionInstant.getTime())
    );
    const items: PostRuleWorkItem[] = [];
    const seen = new Set<string>();

    for (const rule of rules) {
      // Channel and Pipeline assignments are additive, so the same rule can
      // arrive from both sides of the resolver query.
      if (seen.has(rule.id)) {
        continue;
      }
      seen.add(rule.id);

      const conditions = (rule.conditions || []) as PostRuleCondition[];
      if (
        !capabilities.actions.includes(rule.action) ||
        !conditions.every((condition) =>
          capabilities.metrics.includes(condition.metric)
        )
      ) {
        continue;
      }

      const total = postRuleEvaluationCount(rule);
      const schedule = Array.from({ length: total }, (_, evaluationIndex) => ({
        evaluationIndex,
        scheduledAt: postRuleEvaluationScheduledAt(
          evaluationAnchor,
          rule,
          evaluationIndex
        ),
      }));

      const run = await this._executionRepository.ensureRun(
        request.organizationId,
        rule.id,
        root.id,
        schedule
      );
      if (run.status !== 'ACTIVE') {
        continue;
      }

      for (const evaluation of run.evaluations) {
        if (evaluation.status !== 'PENDING' && evaluation.status !== 'FAILED') {
          continue;
        }
        items.push({
          runId: run.id,
          ruleId: rule.id,
          postId: root.id,
          evaluationIndex: evaluation.evaluationIndex,
          delayMs: Math.max(0, evaluation.scheduledAt.getTime() - now),
        });
      }
    }

    return {
      items: items.sort(
        (first, second) =>
          first.delayMs - second.delayMs ||
          first.runId.localeCompare(second.runId) ||
          first.evaluationIndex - second.evaluationIndex
      ),
    };
  }

  /**
   * Claims one evaluation, evaluates it against the rule as it exists now and
   * finalizes it. Safe to call repeatedly: terminal evaluations replay their
   * stored result and a live claim is reported back untouched.
   */
  async processEvaluation(
    request: ProcessPostRuleEvaluationRequest
  ): Promise<PostRuleEvaluationWorkResult> {
    const claim = await this._executionRepository.claimEvaluation(
      request.organizationId,
      request.runId,
      request.evaluationIndex,
      new Date(),
      POST_RULE_STALE_CLAIM_MS
    );

    if (claim.outcome === 'NOT_FOUND') {
      return {
        runId: request.runId,
        evaluationIndex: request.evaluationIndex,
        status: 'SKIPPED',
        terminalRun: true,
        actionResult: {
          matched: false,
          skippedReason: 'EVALUATION_UNAVAILABLE',
        },
      };
    }

    if (claim.outcome === 'BUSY') {
      return {
        runId: request.runId,
        evaluationIndex: request.evaluationIndex,
        status: 'PROCESSING',
        terminalRun: false,
        errorSummary: 'Evaluation is already being processed',
      };
    }

    if (claim.outcome === 'REPLAYED') {
      return {
        runId: request.runId,
        evaluationIndex: request.evaluationIndex,
        status: claim.status,
        terminalRun: claim.terminalRun,
        ...(claim.actionResult ? { actionResult: claim.actionResult } : {}),
        ...(claim.errorSummary ? { errorSummary: claim.errorSummary } : {}),
      };
    }

    return this.evaluateClaim(claim);
  }

  private async evaluateClaim(
    claim: PostRuleClaim
  ): Promise<PostRuleEvaluationWorkResult> {
    const { rule, post } = claim;
    const snapshot = this.toSnapshot(claim);

    if (!rule || !rule.enabled) {
      return this.skip(claim, 'RULE_UNAVAILABLE', snapshot);
    }
    if (!this.isStillAssigned(rule, post)) {
      return this.skip(claim, 'ASSIGNMENT_REMOVED', snapshot);
    }
    if (
      post.deletedAt ||
      post.state !== 'PUBLISHED' ||
      !this.hasUsableRelease(post.releaseId)
    ) {
      return this.skip(claim, 'POST_UNAVAILABLE', snapshot);
    }
    if (post.platformDeletedAt) {
      return this.skip(claim, 'POST_ALREADY_REMOVED', snapshot);
    }

    const provider = this.getProvider(post.integration.providerIdentifier);
    const capability = provider?.postRules;
    if (
      !provider ||
      !capability ||
      post.integration.disabled ||
      post.integration.deletedAt ||
      !this.capabilitySupports(capability.metadata(), rule)
    ) {
      return this.skip(claim, 'CAPABILITY_UNAVAILABLE', snapshot);
    }

    const session = await this.openSession(post.integration, provider);
    if (!session) {
      return this.fail(claim, 'Channel token could not be refreshed', snapshot);
    }

    const conditions = (rule.conditions || []) as PostRuleCondition[];
    let metrics: PostRuleNormalizedMetrics = {};
    let matched = true;

    if (conditions.length) {
      const loaded = await session.run((live) =>
        capability.loadMetrics(live, live.token, post.releaseId as string)
      );

      if (loaded.status === 'not_found') {
        await this._executionRepository.markPostsPlatformDeleted(
          claim.run.organizationId,
          [post.id],
          new Date()
        );
        return this.skip(claim, 'POST_ALREADY_REMOVED', snapshot);
      }
      if (loaded.status === 'unsupported') {
        return this.skip(claim, 'CAPABILITY_UNAVAILABLE', snapshot);
      }
      if (loaded.status !== 'success') {
        return this.fail(
          claim,
          `Metrics could not be loaded (${loaded.status})`,
          snapshot
        );
      }

      metrics = loaded.metrics;
      const outcome = evaluatePostRuleConditions(
        conditions,
        rule.conditionMatch,
        metrics
      );
      if (outcome.status === 'MISSING_METRICS') {
        return this.fail(
          claim,
          `Required metrics are unavailable: ${outcome.missing.join(', ')}`,
          snapshot,
          metrics
        );
      }
      matched = outcome.matched;
    }

    if (isPollingPostRuleAction(rule.action)) {
      return this.runPollingAction(
        claim,
        rule,
        capability,
        session,
        snapshot,
        metrics,
        matched
      );
    }

    return this.runRemoval(
      claim,
      rule,
      capability,
      session,
      snapshot,
      metrics,
      matched
    );
  }

  private async runPollingAction(
    claim: PostRuleClaim,
    rule: PostRuleAssignedRule,
    capability: PostRulesCapability,
    session: {
      run: <T>(call: (live: Integration) => Promise<T>) => Promise<T>;
    },
    snapshot: PostRuleSnapshot,
    metrics: PostRuleNormalizedMetrics,
    matched: boolean
  ): Promise<PostRuleEvaluationWorkResult> {
    const isFinalEvaluation =
      claim.evaluation.evaluationIndex >= claim.evaluationCount - 1;

    if (!matched) {
      return this.complete(
        claim,
        {
          matched: false,
          action: rule.action,
          rule: snapshot,
          ...(isFinalEvaluation
            ? { message: 'Conditions never matched before the last evaluation' }
            : {}),
        },
        metrics,
        isFinalEvaluation ? 'COMPLETED' : undefined,
        isFinalEvaluation
      );
    }

    const releaseId = claim.post.releaseId as string;
    if (rule.action === 'AUTO_REPOST') {
      const result = await session.run((live) =>
        capability.repost(live, live.token, releaseId)
      );
      if (result.status === 'unsupported') {
        return this.skip(claim, 'CAPABILITY_UNAVAILABLE', snapshot, metrics);
      }
      if (
        result.status !== 'reposted' &&
        result.status !== 'already_reposted'
      ) {
        return this.fail(
          claim,
          `Auto repost failed (${result.status})`,
          snapshot,
          metrics
        );
      }
      return this.complete(
        claim,
        {
          matched: true,
          action: rule.action,
          rule: snapshot,
          ...(result.status === 'reposted'
            ? { remoteReleaseIds: [result.remoteReleaseId] }
            : {}),
        },
        metrics,
        'COMPLETED',
        true
      );
    }

    if (rule.action === 'NOTIFY') {
      const { subject, message } = buildPostRuleNotifyMessage({
        ruleName: rule.name,
        providerIdentifier: claim.post.integration.providerIdentifier,
        metrics,
        releaseURL: claim.post.releaseURL,
      });
      await this._notificationService.inAppNotification(
        claim.run.organizationId,
        subject,
        message,
        false
      );
      return this.complete(
        claim,
        {
          matched: true,
          action: rule.action,
          rule: snapshot,
          message: subject,
        },
        metrics,
        'COMPLETED',
        true
      );
    }

    const content = ((rule.actionConfig || {}) as PostRuleAutoPlugActionConfig)
      .content;
    if (!content || !content.trim()) {
      return this.skip(claim, 'ACTION_CONFIG_UNAVAILABLE', snapshot, metrics);
    }

    const result = await session.run((live) =>
      capability.addPlugReply(live, live.token, releaseId, content)
    );
    if (result.status === 'unsupported') {
      return this.skip(claim, 'CAPABILITY_UNAVAILABLE', snapshot, metrics);
    }
    if (result.status !== 'added') {
      return this.fail(
        claim,
        `Auto plug failed (${result.status})`,
        snapshot,
        metrics
      );
    }

    return this.complete(
      claim,
      {
        matched: true,
        action: rule.action,
        rule: snapshot,
        remoteReleaseIds: [result.remoteReleaseId],
      },
      metrics,
      'COMPLETED',
      true
    );
  }

  private async runRemoval(
    claim: PostRuleClaim,
    rule: PostRuleAssignedRule,
    capability: PostRulesCapability,
    session: {
      run: <T>(call: (live: Integration) => Promise<T>) => Promise<T>;
    },
    snapshot: PostRuleSnapshot,
    metrics: PostRuleNormalizedMetrics,
    matched: boolean
  ): Promise<PostRuleEvaluationWorkResult> {
    if (!matched) {
      return this.complete(
        claim,
        { matched: false, action: rule.action, rule: snapshot },
        metrics,
        'COMPLETED',
        true
      );
    }

    const rescheduleConfig =
      (rule.rescheduleConfig as PostRuleRescheduleConfig | null) || null;
    const maxRescheduleAttempts = rule.maxRescheduleAttempts;
    let successorPostId = claim.evaluation.actionResult?.successorPostId;
    let attemptLimitReached = false;

    if (rescheduleConfig && maxRescheduleAttempts != null) {
      const nextAttempt = claim.run.rescheduleAttempt + 1;
      if (claim.run.rescheduleAttempt < maxRescheduleAttempts) {
        if (!successorPostId) {
          // A previous attempt may have created the successor and died before
          // it could remove the original; lineage makes that discoverable.
          const linked = await this._executionRepository.findSuccessorRun(
            rule.id,
            claim.run.lineageId,
            nextAttempt
          );
          successorPostId = linked?.postId;
        }

        if (!successorPostId) {
          try {
            successorPostId = await this.createSuccessor(
              claim,
              rescheduleConfig
            );
          } catch (error) {
            return this.fail(
              claim,
              `Reschedule failed: ${this.describeError(error)}`,
              snapshot,
              metrics
            );
          }

          await this._executionRepository.createSuccessorRun(
            claim.run.organizationId,
            rule.id,
            successorPostId,
            claim.run.lineageId,
            nextAttempt
          );
        }

        await this._executionRepository.recordEvaluationProgress(
          claim.evaluation.id,
          {
            matched: true,
            action: rule.action,
            rule: snapshot,
            successorPostId,
          }
        );
      } else {
        attemptLimitReached = true;
      }
    }

    const members = orderPostGroupForRemoval(
      await this._executionRepository.getRemovableGroupMembers(
        claim.run.organizationId,
        claim.post.group,
        claim.post.integrationId
      )
    );

    const removedPostIds: string[] = [];
    const removedReleaseIds: string[] = [];
    const failedReleaseIds: string[] = [];

    for (const member of members) {
      if (!this.hasUsableRelease(member.releaseId)) {
        continue;
      }
      if (member.platformDeletedAt) {
        removedReleaseIds.push(member.releaseId as string);
        continue;
      }

      const result = await session.run((live) =>
        capability.removePost(live, live.token, member.releaseId as string)
      );
      if (result.status === 'removed' || result.status === 'already_absent') {
        removedPostIds.push(member.id);
        removedReleaseIds.push(member.releaseId as string);
        continue;
      }
      failedReleaseIds.push(member.releaseId as string);
    }

    if (removedPostIds.length) {
      await this._executionRepository.markPostsPlatformDeleted(
        claim.run.organizationId,
        removedPostIds,
        new Date()
      );
    }

    const partialResult: PostRuleEvaluationActionResult = {
      matched: true,
      action: rule.action,
      rule: snapshot,
      ...(successorPostId ? { successorPostId } : {}),
      ...(removedReleaseIds.length
        ? { remoteReleaseIds: removedReleaseIds }
        : {}),
      ...(attemptLimitReached ? { attemptLimitReached: true } : {}),
    };

    if (failedReleaseIds.length) {
      return this.fail(
        claim,
        `Removal incomplete for ${failedReleaseIds.length} post(s) in the group`,
        snapshot,
        metrics,
        { ...partialResult, failedReleaseIds }
      );
    }

    return this.complete(
      claim,
      {
        ...partialResult,
        message: attemptLimitReached
          ? `Reschedule attempt limit of ${maxRescheduleAttempts} was reached, the post was removed without another reschedule`
          : successorPostId
          ? 'The post was rescheduled and the published copy was removed'
          : 'The post was removed',
      },
      metrics,
      'COMPLETED',
      true
    );
  }

  private createSuccessor(
    claim: PostRuleClaim,
    config: PostRuleRescheduleConfig
  ): Promise<string> {
    return config.mode === 'PIPELINE'
      ? this.createPipelineSuccessor(claim, config.pipelineId)
      : this.createManualSuccessor(claim, config);
  }

  private async createManualSuccessor(
    claim: PostRuleClaim,
    config: Extract<PostRuleRescheduleConfig, { mode: 'MANUAL' }>
  ): Promise<string> {
    const orgId = claim.run.organizationId;
    const group = postRuleSuccessorKey(
      claim.run.id,
      claim.evaluation.evaluationIndex
    );

    const existing = await this._executionRepository.getRootPostByGroup(
      orgId,
      group,
      claim.post.integrationId
    );
    if (existing) {
      return existing.id;
    }

    const source = await this.loadSourceContent(claim.post, orgId);
    const publishDate = resolveManualRescheduleDate(config, new Date());
    const payload = await this._postsService.mapTypeToPost(
      {
        type: 'schedule',
        date: dayjs.utc(publishDate).format('YYYY-MM-DDTHH:mm:00'),
        order: '',
        shortLink: false,
        tags: source.tags,
        posts: [
          {
            integration: { id: claim.post.integrationId },
            group,
            settings: source.settings,
            value: source.value,
          },
        ],
      } as never,
      orgId
    );

    await this.assertPostsAreValid(orgId, payload.posts as never[]);

    const [created] = await this._postsService.createPost(
      orgId,
      payload,
      'API',
      true
    );
    if (!created?.postId) {
      throw new Error('The rescheduled post could not be created');
    }
    return created.postId;
  }

  private async createPipelineSuccessor(
    claim: PostRuleClaim,
    pipelineId: string
  ): Promise<string> {
    const orgId = claim.run.organizationId;
    const pipeline = await this._executionRepository.getReschedulePipeline(
      orgId,
      pipelineId
    );
    if (!pipeline) {
      throw new Error('The reschedule Pipeline is unavailable');
    }

    const channels = pipeline.integrations
      .map((entry) => entry.integration)
      .filter((integration) => !integration.disabled && !integration.deletedAt);
    if (!channels.some((channel) => channel.id === claim.post.integrationId)) {
      throw new Error(
        'The reschedule Pipeline no longer contains the published channel'
      );
    }

    const source = await this.loadSourceContent(claim.post, orgId);
    const enqueued = await this._pipelineService.enqueue(
      orgId,
      {
        pipelineId: pipeline.id,
        post: {
          type: 'draft',
          order: '',
          shortLink: false,
          tags: source.tags,
          // A Pipeline queue item must carry exactly the Pipeline channels, so
          // the rescheduled content is cloned onto every active channel.
          posts: channels.map((channel) => ({
            integration: { id: channel.id },
            settings: {
              ...(channel.id === claim.post.integrationId
                ? source.settings
                : {}),
              __type: channel.providerIdentifier,
            },
            value: source.value,
          })),
        },
      } as never,
      'API',
      postRuleSuccessorKey(claim.run.id, claim.evaluation.evaluationIndex)
    );

    const successor = await this._executionRepository.getRootPostByGroup(
      orgId,
      enqueued.group,
      claim.post.integrationId
    );
    if (!successor) {
      throw new Error(
        'The rescheduled Pipeline content is missing its channel'
      );
    }
    return successor.id;
  }

  private async loadSourceContent(post: PostRuleRootPost, orgId: string) {
    const ordered = await this._postsService.getPostsRecursively(
      post.id,
      true,
      orgId,
      true
    );
    if (!ordered.length) {
      throw new Error('The published post content could not be loaded');
    }

    const [root] = ordered;
    return {
      settings: parseJson<Record<string, unknown>>(root.settings, {}),
      tags: (
        ((root as unknown as { tags?: { tag: { name: string } }[] }).tags ||
          []) as { tag: { name: string } }[]
      ).map((entry) => ({
        value: entry.tag.name,
        label: entry.tag.name,
      })),
      value: ordered.map((entry) => ({
        content: entry.content,
        image: parseJson<unknown[]>(entry.image, []),
        delay: entry.delay || 0,
      })),
    };
  }

  private async assertPostsAreValid(orgId: string, posts: never[]) {
    const validations = await this._postsService.validatePosts(orgId, posts);
    const invalid = validations.find(
      (validation) =>
        !validation.valid ||
        validation.errors !== true ||
        validation.emptyContent ||
        validation.tooLong
    );
    if (invalid) {
      throw new Error(
        `${invalid.name}: ${
          invalid.settingsError || invalid.errors || 'the content is invalid'
        }`
      );
    }
  }

  private toSnapshot(claim: PostRuleClaim): PostRuleSnapshot {
    const rule = claim.rule;
    const rescheduleConfig =
      (rule?.rescheduleConfig as PostRuleRescheduleConfig | null) || null;
    return {
      ruleId: rule?.id || '',
      name: rule?.name || 'Deleted rule',
      action: (rule?.action || 'REMOVE') as PostRuleAction,
      conditionMatch: rule?.conditionMatch || 'ANY',
      conditions: ((rule?.conditions || []) as PostRuleCondition[]) || [],
      rescheduleMode: rescheduleConfig?.mode || null,
      maxRescheduleAttempts: rule?.maxRescheduleAttempts ?? null,
      rescheduleAttempt: claim.run.rescheduleAttempt,
      lineageId: claim.run.lineageId,
    };
  }

  private isStillAssigned(
    rule: PostRuleAssignedRule,
    post: PostRuleRootPost
  ): boolean {
    if (
      rule.integrations.some(
        (entry) => entry.integrationId === post.integrationId
      )
    ) {
      return true;
    }
    const pipelineId = post.pipelineQueueItem?.pipelineId;
    return (
      !!pipelineId &&
      rule.pipelines.some((entry) => entry.pipelineId === pipelineId)
    );
  }

  private capabilitySupports(
    metadata: PostRulesCapabilityMetadata,
    rule: PostRuleAssignedRule
  ): boolean {
    if (!metadata.actions[ACTION_METADATA_KEYS[rule.action]]) {
      return false;
    }
    return ((rule.conditions || []) as PostRuleCondition[]).every(
      (condition) => !!metadata.metrics[METRIC_METADATA_KEYS[condition.metric]]
    );
  }

  private getProvider(providerIdentifier: string): SocialProvider | null {
    try {
      return this._integrationManager.getSocialIntegration(providerIdentifier);
    } catch {
      return null;
    }
  }

  private hasUsableRelease(releaseId: string | null): boolean {
    return !!releaseId && releaseId !== 'missing';
  }

  private async openSession(
    integration: Integration,
    provider: SocialProvider
  ) {
    let live = await this.withRefreshedToken(integration, provider);
    if (!live) {
      return null;
    }

    const run = async <T>(
      call: (current: Integration) => Promise<T>
    ): Promise<T> => {
      try {
        return await call(live as Integration);
      } catch (error) {
        if (!(error instanceof RefreshToken)) {
          throw error;
        }
        const refreshed = await this.withRefreshedToken(
          integration,
          provider,
          true
        );
        if (!refreshed) {
          throw error;
        }
        live = refreshed;
        return call(refreshed);
      }
    };

    return { run };
  }

  private async withRefreshedToken(
    integration: Integration,
    provider: SocialProvider,
    forceRefresh = false
  ): Promise<Integration | null> {
    const live = { ...integration };
    if (
      forceRefresh ||
      (!!live.tokenExpiration && dayjs(live.tokenExpiration).isBefore(dayjs()))
    ) {
      const refreshed = await this._refreshIntegrationService.refresh(live);
      if (!refreshed || !refreshed.accessToken) {
        return null;
      }
      live.token = refreshed.accessToken;
      if (provider.refreshWait) {
        await timer(10000);
      }
    }
    return live;
  }

  private describeError(error: unknown): string {
    return error instanceof Error && error.message
      ? error.message
      : 'unknown error';
  }

  private async skip(
    claim: PostRuleClaim,
    skippedReason: PostRuleSkipReason,
    rule: PostRuleSnapshot,
    metrics?: PostRuleNormalizedMetrics
  ): Promise<PostRuleEvaluationWorkResult> {
    const actionResult: PostRuleEvaluationActionResult = {
      matched: false,
      skippedReason,
      rule,
    };
    await this._executionRepository.finalizeEvaluation({
      evaluationId: claim.evaluation.id,
      runId: claim.run.id,
      status: 'SKIPPED',
      runStatus: 'CANCELLED',
      actionResult,
      ...(metrics ? { metrics } : {}),
    });
    return {
      runId: claim.run.id,
      evaluationIndex: claim.evaluation.evaluationIndex,
      status: 'SKIPPED',
      terminalRun: true,
      actionResult,
    };
  }

  private async fail(
    claim: PostRuleClaim,
    errorSummary: string,
    rule: PostRuleSnapshot,
    metrics?: PostRuleNormalizedMetrics,
    actionResult?: PostRuleEvaluationActionResult
  ): Promise<PostRuleEvaluationWorkResult> {
    const stored = actionResult || { matched: false, rule };
    await this._executionRepository.finalizeEvaluation({
      evaluationId: claim.evaluation.id,
      runId: claim.run.id,
      status: 'FAILED',
      errorSummary,
      actionResult: stored,
      ...(metrics ? { metrics } : {}),
    });
    return {
      runId: claim.run.id,
      evaluationIndex: claim.evaluation.evaluationIndex,
      status: 'FAILED',
      terminalRun: false,
      actionResult: stored,
      errorSummary,
    };
  }

  private async complete(
    claim: PostRuleClaim,
    actionResult: PostRuleEvaluationActionResult,
    metrics: PostRuleNormalizedMetrics,
    runStatus: 'COMPLETED' | undefined,
    terminalRun: boolean
  ): Promise<PostRuleEvaluationWorkResult> {
    await this._executionRepository.finalizeEvaluation({
      evaluationId: claim.evaluation.id,
      runId: claim.run.id,
      status: 'COMPLETED',
      actionResult,
      metrics,
      ...(runStatus ? { runStatus } : {}),
    });
    return {
      runId: claim.run.id,
      evaluationIndex: claim.evaluation.evaluationIndex,
      status: 'COMPLETED',
      terminalRun,
      actionResult,
    };
  }
}

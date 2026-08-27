jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.service',
  () => ({ PipelineService: class PipelineService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class NotificationService {} })
);

import { PostRulesExecutionRepository } from './post-rules.execution.repository';
import { PostRulesExecutionService } from './post-rules.execution.service';
import {
  evaluatePostRuleConditions,
  buildPostRuleNotifyMessage,
  orderPostGroupForRemoval,
  POST_RULE_STALE_CLAIM_MS,
  postRuleEvaluationCount,
  postRuleEvaluationScheduledAt,
} from './post-rules.execution';

const PUBLISHED_AT = new Date('2026-08-20T10:00:00.000Z');

const capabilityMetadata = {
  actions: { remove: true, autoRepost: true, autoPlug: true, notify: true },
  metrics: { likes: true, replies: true },
};

const integration = {
  id: 'channel-1',
  organizationId: 'org-1',
  providerIdentifier: 'x',
  disabled: false,
  deletedAt: null,
  token: 'token-1',
  tokenExpiration: new Date('2999-01-01T00:00:00.000Z'),
  refreshNeeded: false,
} as any;

const rootPost = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'post-1',
    organizationId: 'org-1',
    integrationId: 'channel-1',
    group: 'group-1',
    state: 'PUBLISHED',
    publishDate: PUBLISHED_AT,
    releaseId: 'tweet-1',
    releaseURL: 'https://x.com/user/status/tweet-1',
    settings: JSON.stringify({ __type: 'x' }),
    image: '[]',
    content: 'hello',
    delay: 0,
    deletedAt: null,
    platformDeletedAt: null,
    parentPostId: null,
    integration,
    pipelineQueueItem: null,
    ...overrides,
  } as any);

const rule = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'rule-1',
    organizationId: 'org-1',
    name: 'Remove flops',
    enabled: true,
    action: 'REMOVE',
    initialDelayHours: 24,
    evaluationIntervalHours: null,
    maxEvaluations: null,
    conditionMatch: 'ANY',
    conditions: [],
    actionConfig: {},
    rescheduleConfig: null,
    maxRescheduleAttempts: null,
    integrations: [{ integrationId: 'channel-1' }],
    pipelines: [],
    ...overrides,
  } as any);

const createService = () => {
  const executionRepository = {
    getPublishedRoot: jest.fn(),
    getEnabledRulesForTarget: jest.fn().mockResolvedValue([]),
    ensureRun: jest.fn(),
    claimEvaluation: jest.fn(),
    recordEvaluationProgress: jest.fn().mockResolvedValue({}),
    finalizeEvaluation: jest.fn().mockResolvedValue({ finalized: true }),
    findSuccessorRun: jest.fn().mockResolvedValue(null),
    createSuccessorRun: jest.fn(),
    getRemovableGroupMembers: jest.fn().mockResolvedValue([]),
    markPostsPlatformDeleted: jest.fn().mockResolvedValue({ updated: 0 }),
    getRootPostByGroup: jest.fn().mockResolvedValue(null),
    getReschedulePipeline: jest.fn(),
  };
  const capability = {
    metadata: jest.fn().mockReturnValue(capabilityMetadata),
    loadMetrics: jest.fn(),
    removePost: jest.fn(),
    repost: jest.fn(),
    addPlugReply: jest.fn(),
  };
  const integrationManager = {
    getPostRulesCapabilities: jest.fn().mockReturnValue({
      x: {
        actions: ['REMOVE', 'AUTO_REPOST', 'AUTO_PLUG', 'NOTIFY'],
        metrics: ['LIKES', 'REPLIES'],
      },
    }),
    getSocialIntegration: jest.fn().mockReturnValue({ postRules: capability }),
  };
  const refreshIntegrationService = { refresh: jest.fn() };
  const postsService = {
    getPostsRecursively: jest.fn(),
    mapTypeToPost: jest.fn(),
    createPost: jest.fn(),
    validatePosts: jest.fn(),
  };
  const pipelineService = { enqueue: jest.fn() };
  const notificationService = { inAppNotification: jest.fn() };

  const service = Object.create(
    PostRulesExecutionService.prototype
  ) as PostRulesExecutionService;
  (service as any)._executionRepository = executionRepository;
  (service as any)._integrationManager = integrationManager;
  (service as any)._refreshIntegrationService = refreshIntegrationService;
  (service as any)._postsService = postsService;
  (service as any)._pipelineService = pipelineService;
  (service as any)._notificationService = notificationService;

  return {
    service,
    executionRepository,
    capability,
    integrationManager,
    postsService,
    pipelineService,
    notificationService,
  };
};

const claimed = (overrides: Record<string, any> = {}) => ({
  outcome: 'CLAIMED' as const,
  evaluation: { id: 'evaluation-1', evaluationIndex: 0, actionResult: null },
  evaluationCount: 1,
  run: {
    id: 'run-1',
    organizationId: 'org-1',
    lineageId: 'lineage-1',
    rescheduleAttempt: 0,
  },
  rule: rule(),
  post: rootPost(),
  ...overrides,
});

describe('post rule condition evaluation', () => {
  it('matches unconditional rules', () => {
    expect(evaluatePostRuleConditions([], 'ANY', {})).toEqual({
      status: 'EVALUATED',
      matched: true,
    });
  });

  it('matches ANY when a single low-performance threshold is crossed', () => {
    expect(
      evaluatePostRuleConditions(
        [
          { metric: 'LIKES', operator: 'LT', threshold: 10 },
          { metric: 'REPLIES', operator: 'LT', threshold: 2 },
        ],
        'ANY',
        { likes: 3, replies: 5 }
      )
    ).toEqual({ status: 'EVALUATED', matched: true });
  });

  it('requires every threshold for ALL', () => {
    expect(
      evaluatePostRuleConditions(
        [
          { metric: 'LIKES', operator: 'LT', threshold: 10 },
          { metric: 'REPLIES', operator: 'LT', threshold: 2 },
        ],
        'ALL',
        { likes: 3, replies: 5 }
      )
    ).toEqual({ status: 'EVALUATED', matched: false });
  });

  it('reports missing metrics instead of assuming zero engagement', () => {
    expect(
      evaluatePostRuleConditions(
        [{ metric: 'REPLIES', operator: 'LT', threshold: 2 }],
        'ANY',
        { likes: 0 }
      )
    ).toEqual({ status: 'MISSING_METRICS', missing: ['REPLIES'] });
  });

  it('derives deterministic evaluation counts and delays', () => {
    const polling = {
      action: 'AUTO_REPOST' as const,
      initialDelayHours: 2,
      evaluationIntervalHours: 6,
      maxEvaluations: 3,
    };
    expect(postRuleEvaluationCount(polling)).toBe(3);
    expect(
      postRuleEvaluationScheduledAt(PUBLISHED_AT, polling, 2).toISOString()
    ).toBe('2026-08-21T00:00:00.000Z');
    expect(
      postRuleEvaluationCount({ action: 'REMOVE', maxEvaluations: 9 })
    ).toBe(1);
  });

  it('orders a thread from the deepest reply upwards', () => {
    const members = [
      {
        id: 'root',
        parentPostId: null,
        releaseId: 'a',
        platformDeletedAt: null,
      },
      {
        id: 'child',
        parentPostId: 'root',
        releaseId: 'b',
        platformDeletedAt: null,
      },
      {
        id: 'grand',
        parentPostId: 'child',
        releaseId: 'c',
        platformDeletedAt: null,
      },
    ];
    expect(orderPostGroupForRemoval(members).map((m) => m.id)).toEqual([
      'grand',
      'child',
      'root',
    ]);
  });
});

describe('PostRulesExecutionService.resolveForPost', () => {
  const request = {
    organizationId: 'org-1',
    postId: 'post-1',
    integrationId: 'channel-1',
  };

  it('produces no work when the published post has no usable release id', async () => {
    const { service, executionRepository } = createService();
    executionRepository.getPublishedRoot.mockResolvedValue(
      rootPost({ releaseId: 'missing' })
    );

    await expect(service.resolveForPost(request)).resolves.toEqual({
      items: [],
    });
    expect(executionRepository.getEnabledRulesForTarget).not.toHaveBeenCalled();
  });

  it('deduplicates a rule assigned to both the channel and the source Pipeline', async () => {
    const { service, executionRepository } = createService();
    executionRepository.getPublishedRoot.mockResolvedValue(
      rootPost({ pipelineQueueItem: { pipelineId: 'pipeline-1' } })
    );
    executionRepository.getEnabledRulesForTarget.mockResolvedValue([
      rule({ pipelines: [{ pipelineId: 'pipeline-1' }] }),
      rule({ pipelines: [{ pipelineId: 'pipeline-1' }] }),
    ]);
    executionRepository.ensureRun.mockResolvedValue({
      id: 'run-1',
      status: 'ACTIVE',
      lineageId: 'lineage-1',
      rescheduleAttempt: 0,
      evaluations: [
        {
          id: 'evaluation-1',
          evaluationIndex: 0,
          scheduledAt: new Date(PUBLISHED_AT.getTime() + 24 * 3600_000),
          status: 'PENDING',
        },
      ],
    });

    const { items } = await service.resolveForPost(request);

    expect(executionRepository.getEnabledRulesForTarget).toHaveBeenCalledWith(
      'org-1',
      'channel-1',
      'pipeline-1'
    );
    expect(executionRepository.ensureRun).toHaveBeenCalledTimes(1);
    expect(items).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        ruleId: 'rule-1',
        postId: 'post-1',
        evaluationIndex: 0,
      }),
    ]);
  });

  it('resolves two same-action rules from direct channel and Pipeline assignments once each', async () => {
    const { service, executionRepository } = createService();
    executionRepository.getPublishedRoot.mockResolvedValue(
      rootPost({ pipelineQueueItem: { pipelineId: 'pipeline-1' } })
    );
    executionRepository.getEnabledRulesForTarget.mockResolvedValue([
      rule({
        id: 'rule-direct',
        name: 'Direct remove',
        integrations: [{ integrationId: 'channel-1' }],
        pipelines: [],
      }),
      rule({
        id: 'rule-pipeline',
        name: 'Pipeline remove',
        action: 'REMOVE',
        integrations: [],
        pipelines: [{ pipelineId: 'pipeline-1' }],
      }),
    ]);
    executionRepository.ensureRun.mockImplementation(
      async (_orgId, ruleId) => ({
        id: `run-${ruleId}`,
        status: 'ACTIVE',
        lineageId: `lineage-${ruleId}`,
        rescheduleAttempt: 0,
        evaluations: [
          {
            id: `evaluation-${ruleId}`,
            evaluationIndex: 0,
            scheduledAt: new Date(PUBLISHED_AT.getTime() + 24 * 3600_000),
            status: 'PENDING',
          },
        ],
      })
    );

    const { items } = await service.resolveForPost(request);

    expect(executionRepository.getEnabledRulesForTarget).toHaveBeenCalledWith(
      'org-1',
      'channel-1',
      'pipeline-1'
    );
    expect(executionRepository.ensureRun).toHaveBeenCalledTimes(2);
    expect(executionRepository.ensureRun).toHaveBeenCalledWith(
      'org-1',
      'rule-direct',
      'post-1',
      expect.any(Array)
    );
    expect(executionRepository.ensureRun).toHaveBeenCalledWith(
      'org-1',
      'rule-pipeline',
      'post-1',
      expect.any(Array)
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: 'run-rule-direct',
          ruleId: 'rule-direct',
          postId: 'post-1',
          evaluationIndex: 0,
        }),
        expect.objectContaining({
          runId: 'run-rule-pipeline',
          ruleId: 'rule-pipeline',
          postId: 'post-1',
          evaluationIndex: 0,
        }),
      ])
    );
    expect(items).toHaveLength(2);
  });

  it('scopes resolver lookups to the published post organization', async () => {
    const { service, executionRepository } = createService();
    executionRepository.getPublishedRoot.mockResolvedValue(
      rootPost({ organizationId: 'org-2' })
    );
    executionRepository.getEnabledRulesForTarget.mockResolvedValue([]);

    await service.resolveForPost({
      organizationId: 'org-2',
      postId: 'post-1',
      integrationId: 'channel-1',
    });

    expect(executionRepository.getEnabledRulesForTarget).toHaveBeenCalledWith(
      'org-2',
      'channel-1',
      null
    );
    expect(
      executionRepository.getEnabledRulesForTarget
    ).not.toHaveBeenCalledWith('org-1', expect.anything(), expect.anything());
  });

  it('drops rules whose provider no longer supports the action or metric', async () => {
    const { service, executionRepository, integrationManager } =
      createService();
    executionRepository.getPublishedRoot.mockResolvedValue(rootPost());
    integrationManager.getPostRulesCapabilities.mockReturnValue({
      x: { actions: ['AUTO_PLUG'], metrics: [] },
    });
    executionRepository.getEnabledRulesForTarget.mockResolvedValue([
      rule(),
      rule({
        id: 'rule-2',
        action: 'AUTO_PLUG',
        conditions: [{ metric: 'LIKES', operator: 'LT', threshold: 5 }],
      }),
    ]);

    await expect(service.resolveForPost(request)).resolves.toEqual({
      items: [],
    });
    expect(executionRepository.ensureRun).not.toHaveBeenCalled();
  });

  it('creates one pending evaluation per configured index and orders work by delay', async () => {
    const { service, executionRepository } = createService();
    executionRepository.getPublishedRoot.mockResolvedValue(rootPost());
    executionRepository.getEnabledRulesForTarget.mockResolvedValue([
      rule({
        action: 'AUTO_REPOST',
        initialDelayHours: 1,
        evaluationIntervalHours: 2,
        maxEvaluations: 2,
      }),
    ]);
    executionRepository.ensureRun.mockImplementation(
      async (_orgId, _ruleId, _postId, schedule: any[]) => ({
        id: 'run-1',
        status: 'ACTIVE',
        lineageId: 'lineage-1',
        rescheduleAttempt: 0,
        evaluations: schedule.map((entry) => ({
          id: `evaluation-${entry.evaluationIndex}`,
          evaluationIndex: entry.evaluationIndex,
          scheduledAt: entry.scheduledAt,
          status: 'PENDING',
        })),
      })
    );

    const now = Date.now();
    const { items } = await service.resolveForPost(request);

    const providedSchedule = executionRepository.ensureRun.mock
      .calls[0][3] as any[];
    const firstScheduledAt = providedSchedule[0].scheduledAt.getTime();
    const secondScheduledAt = providedSchedule[1].scheduledAt.getTime();

    expect(firstScheduledAt).toBeGreaterThanOrEqual(now + 3600_000 - 1000);
    expect(secondScheduledAt).toBeGreaterThanOrEqual(now + 3 * 3600_000 - 1000);
    expect(secondScheduledAt - firstScheduledAt).toBeCloseTo(2 * 3600_000, -3);
    expect(items.map((item) => item.evaluationIndex)).toEqual([0, 1]);
    expect(items[0].delayMs).toBeLessThanOrEqual(items[1].delayMs);
  });

  it('does not schedule work for a run that already reached a terminal state', async () => {
    const { service, executionRepository } = createService();
    executionRepository.getPublishedRoot.mockResolvedValue(rootPost());
    executionRepository.getEnabledRulesForTarget.mockResolvedValue([rule()]);
    executionRepository.ensureRun.mockResolvedValue({
      id: 'run-1',
      status: 'COMPLETED',
      lineageId: 'lineage-1',
      rescheduleAttempt: 0,
      evaluations: [
        {
          id: 'evaluation-1',
          evaluationIndex: 0,
          scheduledAt: PUBLISHED_AT,
          status: 'PENDING',
        },
      ],
    });

    await expect(service.resolveForPost(request)).resolves.toEqual({
      items: [],
    });
  });

  it('anchors new evaluation schedules on resolution instant for late-published posts', async () => {
    const { service, executionRepository } = createService();
    const latePublishDate = new Date('2026-08-18T10:00:00.000Z');
    executionRepository.getPublishedRoot.mockResolvedValue(
      rootPost({ publishDate: latePublishDate })
    );
    executionRepository.getEnabledRulesForTarget.mockResolvedValue([
      rule({ initialDelayHours: 24 }),
    ]);
    executionRepository.ensureRun.mockImplementation(
      async (_orgId, _ruleId, _postId, schedule: any[]) => ({
        id: 'run-1',
        status: 'ACTIVE',
        lineageId: 'lineage-1',
        rescheduleAttempt: 0,
        evaluations: schedule.map((entry) => ({
          id: `evaluation-${entry.evaluationIndex}`,
          evaluationIndex: entry.evaluationIndex,
          scheduledAt: entry.scheduledAt,
          status: 'PENDING',
        })),
      })
    );

    const { items } = await service.resolveForPost(request);

    const providedSchedule = executionRepository.ensureRun.mock
      .calls[0][3] as any[];
    const providedScheduledAt = providedSchedule[0].scheduledAt.getTime();
    const now = Date.now();
    const expectedMinDelay = 24 * 3600_000 - 5000;

    expect(providedScheduledAt).toBeGreaterThanOrEqual(now + expectedMinDelay);
    expect(items[0].delayMs).toBeGreaterThanOrEqual(expectedMinDelay);
  });

  it('preserves on-time behavior when resolution happens before or at publishDate', async () => {
    const { service, executionRepository } = createService();
    const futurePublishDate = new Date(Date.now() + 3600_000);
    executionRepository.getPublishedRoot.mockResolvedValue(
      rootPost({ publishDate: futurePublishDate })
    );
    executionRepository.getEnabledRulesForTarget.mockResolvedValue([
      rule({ initialDelayHours: 24 }),
    ]);
    executionRepository.ensureRun.mockImplementation(
      async (_orgId, _ruleId, _postId, schedule: any[]) => ({
        id: 'run-1',
        status: 'ACTIVE',
        lineageId: 'lineage-1',
        rescheduleAttempt: 0,
        evaluations: schedule.map((entry) => ({
          id: `evaluation-${entry.evaluationIndex}`,
          evaluationIndex: entry.evaluationIndex,
          scheduledAt: entry.scheduledAt,
          status: 'PENDING',
        })),
      })
    );

    await service.resolveForPost(request);

    const providedSchedule = executionRepository.ensureRun.mock
      .calls[0][3] as any[];
    expect(providedSchedule[0].scheduledAt.toISOString()).toBe(
      new Date(futurePublishDate.getTime() + 24 * 3600_000).toISOString()
    );
  });

  it('does not re-anchor existing evaluations on resolver retry', async () => {
    const { service, executionRepository } = createService();
    const latePublishDate = new Date('2026-08-18T10:00:00.000Z');
    const originalScheduledAt = new Date('2026-08-19T10:00:00.000Z');
    executionRepository.getPublishedRoot.mockResolvedValue(
      rootPost({ publishDate: latePublishDate })
    );
    executionRepository.getEnabledRulesForTarget.mockResolvedValue([rule()]);
    executionRepository.ensureRun.mockResolvedValue({
      id: 'run-1',
      status: 'ACTIVE',
      lineageId: 'lineage-1',
      rescheduleAttempt: 0,
      evaluations: [
        {
          id: 'evaluation-1',
          evaluationIndex: 0,
          scheduledAt: originalScheduledAt,
          status: 'FAILED',
        },
      ],
    });

    const { items } = await service.resolveForPost(request);

    expect(items[0].delayMs).toBe(
      Math.max(0, originalScheduledAt.getTime() - Date.now())
    );
  });
});

describe('PostRulesExecutionService.processEvaluation', () => {
  const request = {
    organizationId: 'org-1',
    runId: 'run-1',
    evaluationIndex: 0,
  };

  it('reports a concurrent claim without performing the action twice', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue({ outcome: 'BUSY' });

    await expect(service.processEvaluation(request)).resolves.toEqual({
      runId: 'run-1',
      evaluationIndex: 0,
      status: 'PROCESSING',
      terminalRun: false,
      errorSummary: 'Evaluation is already being processed',
    });
    expect(capability.removePost).not.toHaveBeenCalled();
  });

  it('replays the stored terminal result of a completed evaluation', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue({
      outcome: 'REPLAYED',
      status: 'COMPLETED',
      terminalRun: true,
      actionResult: { matched: true, action: 'REMOVE' },
      errorSummary: null,
    });

    await expect(service.processEvaluation(request)).resolves.toEqual({
      runId: 'run-1',
      evaluationIndex: 0,
      status: 'COMPLETED',
      terminalRun: true,
      actionResult: { matched: true, action: 'REMOVE' },
    });
    expect(capability.removePost).not.toHaveBeenCalled();
  });

  it('skips terminally when the rule was disabled after the work was scheduled', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({ rule: rule({ enabled: false }) })
    );

    const result = await service.processEvaluation(request);

    expect(result.status).toBe('SKIPPED');
    expect(result.terminalRun).toBe(true);
    expect(result.actionResult?.skippedReason).toBe('RULE_UNAVAILABLE');
    expect(executionRepository.finalizeEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SKIPPED', runStatus: 'CANCELLED' })
    );
    expect(capability.removePost).not.toHaveBeenCalled();
  });

  it('skips terminally when the rule assignment was removed', async () => {
    const { service, executionRepository } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({ rule: rule({ integrations: [], pipelines: [] }) })
    );

    const result = await service.processEvaluation(request);

    expect(result.actionResult?.skippedReason).toBe('ASSIGNMENT_REMOVED');
  });

  it('skips terminally when the post is already platform deleted', async () => {
    const { service, executionRepository } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({ post: rootPost({ platformDeletedAt: new Date() }) })
    );

    const result = await service.processEvaluation(request);

    expect(result.actionResult?.skippedReason).toBe('POST_ALREADY_REMOVED');
  });

  it('skips terminally when the provider lost the capability', async () => {
    const { service, executionRepository, integrationManager } =
      createService();
    executionRepository.claimEvaluation.mockResolvedValue(claimed());
    integrationManager.getSocialIntegration.mockReturnValue({});

    const result = await service.processEvaluation(request);

    expect(result.actionResult?.skippedReason).toBe('CAPABILITY_UNAVAILABLE');
  });

  it('fails closed when a required metric is unavailable', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({
        rule: rule({
          conditions: [{ metric: 'REPLIES', operator: 'LT', threshold: 2 }],
        }),
      })
    );
    capability.loadMetrics.mockResolvedValue({
      status: 'success',
      metrics: { likes: 0 },
    });

    const result = await service.processEvaluation(request);

    expect(result.status).toBe('FAILED');
    expect(result.terminalRun).toBe(false);
    expect(result.errorSummary).toContain('REPLIES');
    expect(capability.removePost).not.toHaveBeenCalled();
  });

  it('treats a remotely absent post as already removed and reconciles locally', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({
        rule: rule({
          conditions: [{ metric: 'LIKES', operator: 'LT', threshold: 5 }],
        }),
      })
    );
    capability.loadMetrics.mockResolvedValue({ status: 'not_found' });

    const result = await service.processEvaluation(request);

    expect(executionRepository.markPostsPlatformDeleted).toHaveBeenCalledWith(
      'org-1',
      ['post-1'],
      expect.any(Date)
    );
    expect(result.actionResult?.skippedReason).toBe('POST_ALREADY_REMOVED');
    expect(capability.removePost).not.toHaveBeenCalled();
  });

  it('keeps polling after a non-matching auto repost evaluation', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({
        evaluationCount: 3,
        rule: rule({
          action: 'AUTO_REPOST',
          evaluationIntervalHours: 6,
          maxEvaluations: 3,
          conditions: [{ metric: 'LIKES', operator: 'GTE', threshold: 100 }],
        }),
      })
    );
    capability.loadMetrics.mockResolvedValue({
      status: 'success',
      metrics: { likes: 4, replies: 1 },
    });

    const result = await service.processEvaluation(request);

    expect(result.status).toBe('COMPLETED');
    expect(result.terminalRun).toBe(false);
    expect(capability.repost).not.toHaveBeenCalled();
    expect(executionRepository.finalizeEvaluation).toHaveBeenCalledWith(
      expect.not.objectContaining({ runStatus: expect.anything() })
    );
  });

  it('closes the run on the final non-matching evaluation', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({
        evaluation: {
          id: 'evaluation-3',
          evaluationIndex: 2,
          actionResult: null,
        },
        evaluationCount: 3,
        rule: rule({
          action: 'AUTO_REPOST',
          evaluationIntervalHours: 6,
          maxEvaluations: 3,
          conditions: [{ metric: 'LIKES', operator: 'GTE', threshold: 100 }],
        }),
      })
    );
    capability.loadMetrics.mockResolvedValue({
      status: 'success',
      metrics: { likes: 4 },
    });

    const result = await service.processEvaluation(request);

    expect(result.terminalRun).toBe(true);
    expect(executionRepository.finalizeEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ runStatus: 'COMPLETED' })
    );
  });

  it('ends later evaluations once auto repost succeeds', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({
        evaluationCount: 3,
        rule: rule({
          action: 'AUTO_REPOST',
          evaluationIntervalHours: 6,
          maxEvaluations: 3,
          conditions: [{ metric: 'LIKES', operator: 'GTE', threshold: 100 }],
        }),
      })
    );
    capability.loadMetrics.mockResolvedValue({
      status: 'success',
      metrics: { likes: 400 },
    });
    capability.repost.mockResolvedValue({
      status: 'reposted',
      remoteReleaseId: 'retweet-1',
    });

    const result = await service.processEvaluation(request);

    expect(capability.repost).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'channel-1' }),
      'token-1',
      'tweet-1'
    );
    expect(result.terminalRun).toBe(true);
    expect(result.actionResult?.remoteReleaseIds).toEqual(['retweet-1']);
  });

  it('sends the configured auto plug content and skips when it is missing', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({
        rule: rule({
          action: 'AUTO_PLUG',
          evaluationIntervalHours: 6,
          maxEvaluations: 1,
          actionConfig: { content: 'Read more here' },
        }),
      })
    );
    capability.addPlugReply.mockResolvedValue({
      status: 'added',
      remoteReleaseId: 'reply-1',
    });

    const added = await service.processEvaluation(request);
    expect(capability.addPlugReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'channel-1' }),
      'token-1',
      'tweet-1',
      'Read more here'
    );
    expect(added.terminalRun).toBe(true);

    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({
        rule: rule({
          action: 'AUTO_PLUG',
          evaluationIntervalHours: 6,
          maxEvaluations: 1,
          actionConfig: {},
        }),
      })
    );
    const skipped = await service.processEvaluation(request);
    expect(skipped.actionResult?.skippedReason).toBe(
      'ACTION_CONFIG_UNAVAILABLE'
    );
  });

  it('keeps polling after a non-matching notify evaluation', async () => {
    const { service, executionRepository, capability, notificationService } =
      createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({
        evaluationCount: 3,
        rule: rule({
          action: 'NOTIFY',
          evaluationIntervalHours: 6,
          maxEvaluations: 3,
          conditions: [{ metric: 'REPLIES', operator: 'GTE', threshold: 1 }],
        }),
      })
    );
    capability.loadMetrics.mockResolvedValue({
      status: 'success',
      metrics: { likes: 4, replies: 0 },
    });

    const result = await service.processEvaluation(request);

    expect(result.status).toBe('COMPLETED');
    expect(result.terminalRun).toBe(false);
    expect(notificationService.inAppNotification).not.toHaveBeenCalled();
    expect(capability.repost).not.toHaveBeenCalled();
    expect(capability.addPlugReply).not.toHaveBeenCalled();
  });

  it('sends one in-app notification when notify conditions match', async () => {
    const { service, executionRepository, capability, notificationService } =
      createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claimed({
        evaluationCount: 3,
        rule: rule({
          name: 'Reply alert',
          action: 'NOTIFY',
          evaluationIntervalHours: 6,
          maxEvaluations: 3,
          conditions: [{ metric: 'REPLIES', operator: 'GTE', threshold: 1 }],
        }),
      })
    );
    capability.loadMetrics.mockResolvedValue({
      status: 'success',
      metrics: { likes: 10, replies: 12 },
    });

    const result = await service.processEvaluation(request);

    expect(notificationService.inAppNotification).toHaveBeenCalledWith(
      'org-1',
      'Rule "Reply alert" matched',
      expect.stringContaining('12 replies'),
      false
    );
    expect(capability.repost).not.toHaveBeenCalled();
    expect(capability.addPlugReply).not.toHaveBeenCalled();
    expect(result.terminalRun).toBe(true);
    expect(result.actionResult?.matched).toBe(true);
    expect(result.actionResult?.action).toBe('NOTIFY');
  });
});

describe('buildPostRuleNotifyMessage', () => {
  it('includes metrics and release URL', () => {
    expect(
      buildPostRuleNotifyMessage({
        ruleName: 'Reply alert',
        providerIdentifier: 'threads',
        metrics: { likes: 3, replies: 12 },
        releaseURL: 'https://www.threads.com/@u/post/abc',
      })
    ).toEqual({
      subject: 'Rule "Reply alert" matched',
      message:
        'Your threads post matched rule "Reply alert" (3 likes, 12 replies). https://www.threads.com/@u/post/abc',
    });
  });

  it('falls back to the calendar when release URL is missing', () => {
    const previous = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example.com';
    try {
      expect(
        buildPostRuleNotifyMessage({
          ruleName: 'Likes alert',
          providerIdentifier: 'x',
          metrics: { likes: 100 },
          releaseURL: null,
        }).message
      ).toContain('https://app.example.com/calendar');
    } finally {
      if (previous === undefined) {
        delete process.env.FRONTEND_URL;
      } else {
        process.env.FRONTEND_URL = previous;
      }
    }
  });
});

describe('PostRulesExecutionRepository claim state machine', () => {
  const createRepository = (evaluation: any) => {
    const findFirstEvaluation = jest.fn().mockResolvedValue(evaluation);
    const updateManyEvaluation = jest.fn().mockResolvedValue({ count: 1 });
    const updateEvaluation = jest.fn().mockResolvedValue({});
    const transaction = jest.fn(
      async (callback: (tx: any) => Promise<unknown>) =>
        callback({
          postRuleEvaluation: {
            findFirst: findFirstEvaluation,
            updateMany: updateManyEvaluation,
            update: updateEvaluation,
          },
        })
    );

    const repository = Object.create(
      PostRulesExecutionRepository.prototype
    ) as PostRulesExecutionRepository;
    (repository as any)._transaction = { model: { $transaction: transaction } };

    return { repository, updateManyEvaluation, updateEvaluation };
  };

  const storedEvaluation = (overrides: Record<string, unknown> = {}) => ({
    id: 'evaluation-1',
    evaluationIndex: 0,
    status: 'PENDING',
    claimedAt: null,
    actionResult: null,
    errorSummary: null,
    run: {
      id: 'run-1',
      organizationId: 'org-1',
      lineageId: 'lineage-1',
      rescheduleAttempt: 0,
      status: 'ACTIVE',
      rule: rule(),
      post: rootPost(),
      _count: { evaluations: 1 },
    },
    ...overrides,
  });

  const now = new Date('2026-08-21T12:00:00.000Z');

  it('claims a pending evaluation exactly once', async () => {
    const { repository, updateManyEvaluation } = createRepository(
      storedEvaluation()
    );

    const result = await repository.claimEvaluation(
      'org-1',
      'run-1',
      0,
      now,
      POST_RULE_STALE_CLAIM_MS
    );

    expect(result.outcome).toBe('CLAIMED');
    expect(updateManyEvaluation).toHaveBeenCalledWith({
      where: { id: 'evaluation-1', status: 'PENDING', claimedAt: null },
      data: { status: 'PROCESSING', claimedAt: now },
    });
  });

  it('refuses a claim that another worker still holds', async () => {
    const { repository } = createRepository(
      storedEvaluation({
        status: 'PROCESSING',
        claimedAt: new Date(now.getTime() - 60_000),
      })
    );

    await expect(
      repository.claimEvaluation(
        'org-1',
        'run-1',
        0,
        now,
        POST_RULE_STALE_CLAIM_MS
      )
    ).resolves.toEqual({ outcome: 'BUSY' });
  });

  it('recovers a stale claim after the timeout', async () => {
    const { repository } = createRepository(
      storedEvaluation({
        status: 'PROCESSING',
        claimedAt: new Date(now.getTime() - POST_RULE_STALE_CLAIM_MS - 1),
      })
    );

    const result = await repository.claimEvaluation(
      'org-1',
      'run-1',
      0,
      now,
      POST_RULE_STALE_CLAIM_MS
    );

    expect(result.outcome).toBe('CLAIMED');
  });

  it('loses the compare-and-set race instead of proceeding', async () => {
    const { repository, updateManyEvaluation } = createRepository(
      storedEvaluation()
    );
    updateManyEvaluation.mockResolvedValue({ count: 0 });

    await expect(
      repository.claimEvaluation(
        'org-1',
        'run-1',
        0,
        now,
        POST_RULE_STALE_CLAIM_MS
      )
    ).resolves.toEqual({ outcome: 'BUSY' });
  });

  it('replays a completed evaluation with its stored outcome', async () => {
    const { repository } = createRepository(
      storedEvaluation({
        status: 'COMPLETED',
        actionResult: { matched: true, action: 'REMOVE' },
        run: {
          ...storedEvaluation().run,
          status: 'COMPLETED',
        },
      })
    );

    await expect(
      repository.claimEvaluation(
        'org-1',
        'run-1',
        0,
        now,
        POST_RULE_STALE_CLAIM_MS
      )
    ).resolves.toEqual({
      outcome: 'REPLAYED',
      status: 'COMPLETED',
      terminalRun: true,
      actionResult: { matched: true, action: 'REMOVE' },
      errorSummary: null,
    });
  });

  it('skips a pending evaluation whose run already ended', async () => {
    const { repository, updateEvaluation } = createRepository(
      storedEvaluation({
        run: { ...storedEvaluation().run, status: 'CANCELLED' },
      })
    );

    const result = await repository.claimEvaluation(
      'org-1',
      'run-1',
      0,
      now,
      POST_RULE_STALE_CLAIM_MS
    );

    expect(result).toEqual(
      expect.objectContaining({ outcome: 'REPLAYED', terminalRun: true })
    );
    expect(updateEvaluation).toHaveBeenCalledWith({
      where: { id: 'evaluation-1' },
      data: { status: 'SKIPPED', completedAt: now },
    });
  });

  it('reports a missing evaluation as not found', async () => {
    const { repository } = createRepository(null);

    await expect(
      repository.claimEvaluation(
        'org-1',
        'run-1',
        0,
        now,
        POST_RULE_STALE_CLAIM_MS
      )
    ).resolves.toEqual({ outcome: 'NOT_FOUND' });
  });
});

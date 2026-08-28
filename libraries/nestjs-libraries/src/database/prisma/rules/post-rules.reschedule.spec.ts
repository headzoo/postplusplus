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

import { PostRulesExecutionService } from './post-rules.execution.service';
import { postRuleSuccessorKey } from './post-rules.execution';

const capabilityMetadata = {
  actions: { remove: true, autoRepost: true, autoPlug: true },
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
} as any;

const rootPost = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'post-1',
    organizationId: 'org-1',
    integrationId: 'channel-1',
    group: 'group-1',
    state: 'PUBLISHED',
    publishDate: new Date('2026-08-20T10:00:00.000Z'),
    releaseId: 'tweet-1',
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

const removeRule = (overrides: Record<string, unknown> = {}) =>
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
    createSuccessorRun: jest.fn().mockResolvedValue({ id: 'run-2' }),
    getRemovableGroupMembers: jest.fn().mockResolvedValue([
      {
        id: 'post-1',
        parentPostId: null,
        releaseId: 'tweet-1',
        platformDeletedAt: null,
      },
    ]),
    markPostsPlatformDeleted: jest.fn().mockResolvedValue({ updated: 1 }),
    getRootPostByGroup: jest.fn().mockResolvedValue(null),
    getReschedulePipeline: jest.fn(),
  };
  const capability = {
    metadata: jest.fn().mockReturnValue(capabilityMetadata),
    loadMetrics: jest.fn(),
    removePost: jest.fn().mockResolvedValue({ status: 'removed' }),
    repost: jest.fn(),
    addPlugReply: jest.fn(),
  };
  const postsService = {
    getPostsRecursively: jest
      .fn()
      .mockResolvedValue([{ ...rootPost(), tags: [] }]),
    mapTypeToPost: jest.fn(async (body: any) => body),
    createPost: jest.fn().mockResolvedValue([{ postId: 'post-2' }]),
    validatePosts: jest
      .fn()
      .mockResolvedValue([
        { valid: true, errors: true, emptyContent: false, tooLong: false },
      ]),
  };
  const service = Object.create(
    PostRulesExecutionService.prototype
  ) as PostRulesExecutionService;
  (service as any)._executionRepository = executionRepository;
  (service as any)._integrationManager = {
    getPostRulesCapabilities: jest.fn().mockReturnValue({
      x: { actions: ['REMOVE'], metrics: ['LIKES', 'REPLIES'] },
    }),
    getSocialIntegration: jest.fn().mockReturnValue({ postRules: capability }),
  };
  (service as any)._refreshIntegrationService = { refresh: jest.fn() };
  (service as any)._postsService = postsService;
  (service as any)._pipelineService = { enqueue: jest.fn() };
  (service as any)._notificationService = { inAppNotification: jest.fn() };

  return { service, executionRepository, capability, postsService };
};

const claim = (overrides: Record<string, any> = {}) => ({
  outcome: 'CLAIMED' as const,
  evaluation: { id: 'evaluation-1', evaluationIndex: 0, actionResult: null },
  evaluationCount: 1,
  run: {
    id: 'run-1',
    organizationId: 'org-1',
    lineageId: 'lineage-1',
    rescheduleAttempt: 0,
  },
  rule: removeRule(),
  post: rootPost(),
  ...overrides,
});

const request = { organizationId: 'org-1', runId: 'run-1', evaluationIndex: 0 };

const manualReschedule = {
  mode: 'MANUAL' as const,
  daysAfterEvaluation: 2,
  timeOfDay: '09:30',
  timezone: 'UTC',
};

describe('unconditional removal', () => {
  it('removes the whole thread child before parent and marks each member', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(claim());
    executionRepository.getRemovableGroupMembers.mockResolvedValue([
      {
        id: 'post-1',
        parentPostId: null,
        releaseId: 'tweet-1',
        platformDeletedAt: null,
      },
      {
        id: 'post-2',
        parentPostId: 'post-1',
        releaseId: 'tweet-2',
        platformDeletedAt: null,
      },
    ]);

    const result = await service.processEvaluation(request);

    expect(capability.loadMetrics).not.toHaveBeenCalled();
    expect(capability.removePost.mock.calls.map((call) => call[2])).toEqual([
      'tweet-2',
      'tweet-1',
    ]);
    expect(executionRepository.markPostsPlatformDeleted).toHaveBeenCalledWith(
      'org-1',
      ['post-2', 'post-1'],
      expect.any(Date)
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.terminalRun).toBe(true);
    expect(result.actionResult?.remoteReleaseIds).toEqual([
      'tweet-2',
      'tweet-1',
    ]);
  });

  it('does nothing when the low-performance conditions do not match', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claim({
        rule: removeRule({
          conditions: [{ metric: 'LIKES', operator: 'LT', threshold: 10 }],
        }),
      })
    );
    capability.loadMetrics.mockResolvedValue({
      status: 'success',
      metrics: { likes: 42 },
    });

    const result = await service.processEvaluation(request);

    expect(capability.removePost).not.toHaveBeenCalled();
    expect(result.actionResult?.matched).toBe(false);
    expect(result.terminalRun).toBe(true);
  });

  it('records a partial thread removal as retryable and keeps the successful members marked', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(claim());
    executionRepository.getRemovableGroupMembers.mockResolvedValue([
      {
        id: 'post-1',
        parentPostId: null,
        releaseId: 'tweet-1',
        platformDeletedAt: null,
      },
      {
        id: 'post-2',
        parentPostId: 'post-1',
        releaseId: 'tweet-2',
        platformDeletedAt: null,
      },
    ]);
    capability.removePost
      .mockResolvedValueOnce({ status: 'removed' })
      .mockResolvedValueOnce({
        status: 'retryable_failure',
        reason: 'rate limited',
      });

    const result = await service.processEvaluation(request);

    expect(executionRepository.markPostsPlatformDeleted).toHaveBeenCalledWith(
      'org-1',
      ['post-2'],
      expect.any(Date)
    );
    expect(result.status).toBe('FAILED');
    expect(result.terminalRun).toBe(false);
    expect(result.actionResult?.failedReleaseIds).toEqual(['tweet-1']);
  });

  it('resumes a partially removed thread and treats an absent remote post as success', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(claim());
    executionRepository.getRemovableGroupMembers.mockResolvedValue([
      {
        id: 'post-1',
        parentPostId: null,
        releaseId: 'tweet-1',
        platformDeletedAt: null,
      },
      {
        id: 'post-2',
        parentPostId: 'post-1',
        releaseId: 'tweet-2',
        platformDeletedAt: new Date('2026-08-21T10:00:00.000Z'),
      },
    ]);
    capability.removePost.mockResolvedValue({ status: 'already_absent' });

    const result = await service.processEvaluation(request);

    expect(capability.removePost).toHaveBeenCalledTimes(1);
    expect(capability.removePost).toHaveBeenCalledWith(
      expect.anything(),
      'token-1',
      'tweet-1'
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.actionResult?.remoteReleaseIds).toEqual([
      'tweet-2',
      'tweet-1',
    ]);
  });
});

describe('bounded rescheduling', () => {
  it('creates exactly one successor, links the lineage and then removes the original', async () => {
    const { service, executionRepository, capability, postsService } =
      createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claim({
        rule: removeRule({
          rescheduleConfig: manualReschedule,
          maxRescheduleAttempts: 3,
        }),
      })
    );

    const result = await service.processEvaluation(request);

    expect(postsService.createPost).toHaveBeenCalledTimes(1);
    expect(executionRepository.createSuccessorRun).toHaveBeenCalledWith(
      'org-1',
      'rule-1',
      'post-2',
      'lineage-1',
      1
    );
    expect(executionRepository.recordEvaluationProgress).toHaveBeenCalledWith(
      'evaluation-1',
      expect.objectContaining({ successorPostId: 'post-2' })
    );
    expect(capability.removePost).toHaveBeenCalled();
    expect(result.actionResult?.successorPostId).toBe('post-2');
    expect(result.actionResult?.attemptLimitReached).toBeUndefined();
  });

  it('reuses the successor recorded by a previous attempt instead of creating another', async () => {
    const { service, executionRepository, postsService } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claim({
        evaluation: {
          id: 'evaluation-1',
          evaluationIndex: 0,
          actionResult: { matched: true, successorPostId: 'post-9' },
        },
        rule: removeRule({
          rescheduleConfig: manualReschedule,
          maxRescheduleAttempts: 3,
        }),
      })
    );

    const result = await service.processEvaluation(request);

    expect(postsService.createPost).not.toHaveBeenCalled();
    expect(executionRepository.createSuccessorRun).not.toHaveBeenCalled();
    expect(result.actionResult?.successorPostId).toBe('post-9');
  });

  it('reuses a successor discovered through the lineage after a lost progress write', async () => {
    const { service, executionRepository, postsService } = createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claim({
        rule: removeRule({
          rescheduleConfig: manualReschedule,
          maxRescheduleAttempts: 3,
        }),
      })
    );
    executionRepository.findSuccessorRun.mockResolvedValue({
      id: 'run-2',
      postId: 'post-7',
    });

    const result = await service.processEvaluation(request);

    expect(executionRepository.findSuccessorRun).toHaveBeenCalledWith(
      'rule-1',
      'lineage-1',
      1
    );
    expect(postsService.createPost).not.toHaveBeenCalled();
    expect(result.actionResult?.successorPostId).toBe('post-7');
  });

  it('removes without a successor once the attempt limit is reached', async () => {
    const { service, executionRepository, capability, postsService } =
      createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claim({
        run: {
          id: 'run-1',
          organizationId: 'org-1',
          lineageId: 'lineage-1',
          rescheduleAttempt: 2,
        },
        rule: removeRule({
          rescheduleConfig: manualReschedule,
          maxRescheduleAttempts: 2,
        }),
      })
    );

    const result = await service.processEvaluation(request);

    expect(postsService.createPost).not.toHaveBeenCalled();
    expect(executionRepository.createSuccessorRun).not.toHaveBeenCalled();
    expect(capability.removePost).toHaveBeenCalled();
    expect(result.actionResult?.attemptLimitReached).toBe(true);
    expect(result.actionResult?.message).toContain('attempt limit');
    expect(result.actionResult?.rule).toEqual(
      expect.objectContaining({
        rescheduleAttempt: 2,
        maxRescheduleAttempts: 2,
        rescheduleMode: 'MANUAL',
      })
    );
  });

  it('does not remove the published post when the reschedule fails', async () => {
    const { service, executionRepository, capability, postsService } =
      createService();
    executionRepository.claimEvaluation.mockResolvedValue(
      claim({
        rule: removeRule({
          rescheduleConfig: manualReschedule,
          maxRescheduleAttempts: 3,
        }),
      })
    );
    postsService.createPost.mockRejectedValue(new Error('queue is full'));

    const result = await service.processEvaluation(request);

    expect(capability.removePost).not.toHaveBeenCalled();
    expect(result.status).toBe('FAILED');
    expect(result.terminalRun).toBe(false);
    expect(result.errorSummary).toContain('queue is full');
  });

  it('derives one stable successor key per evaluation', () => {
    expect(postRuleSuccessorKey('run-1', 0)).toBe('rule_run-1_0');
    expect(postRuleSuccessorKey('run-1', 1)).not.toBe(
      postRuleSuccessorKey('run-1', 0)
    );
  });
});

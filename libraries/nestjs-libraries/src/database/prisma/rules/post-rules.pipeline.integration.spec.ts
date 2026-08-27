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

const integration = {
  id: 'channel-1',
  organizationId: 'org-1',
  providerIdentifier: 'x',
  disabled: false,
  deletedAt: null,
  token: 'token-1',
  tokenExpiration: new Date('2999-01-01T00:00:00.000Z'),
} as any;

const rootPost = {
  id: 'post-1',
  organizationId: 'org-1',
  integrationId: 'channel-1',
  group: 'group-1',
  state: 'PUBLISHED',
  publishDate: new Date('2026-08-20T10:00:00.000Z'),
  releaseId: 'tweet-1',
  settings: JSON.stringify({ __type: 'x', post_type: 'post' }),
  image: '[]',
  content: 'hello',
  delay: 0,
  deletedAt: null,
  platformDeletedAt: null,
  parentPostId: null,
  integration,
  pipelineQueueItem: { pipelineId: 'pipeline-1' },
} as any;

const createService = () => {
  const executionRepository = {
    claimEvaluation: jest.fn(),
    recordEvaluationProgress: jest.fn().mockResolvedValue({}),
    finalizeEvaluation: jest.fn().mockResolvedValue({ finalized: true }),
    findSuccessorRun: jest.fn().mockResolvedValue(null),
    createSuccessorRun: jest.fn().mockResolvedValue({ id: 'run-2' }),
    getRemovableGroupMembers: jest
      .fn()
      .mockResolvedValue([
        {
          id: 'post-1',
          parentPostId: null,
          releaseId: 'tweet-1',
          platformDeletedAt: null,
        },
      ]),
    markPostsPlatformDeleted: jest.fn().mockResolvedValue({ updated: 1 }),
    getRootPostByGroup: jest.fn().mockResolvedValue({ id: 'post-2' }),
    getReschedulePipeline: jest.fn().mockResolvedValue({
      id: 'pipeline-2',
      integrations: [
        {
          integration: {
            id: 'channel-1',
            providerIdentifier: 'x',
            disabled: false,
            deletedAt: null,
          },
        },
        {
          integration: {
            id: 'channel-2',
            providerIdentifier: 'bluesky',
            disabled: false,
            deletedAt: null,
          },
        },
        {
          integration: {
            id: 'channel-3',
            providerIdentifier: 'threads',
            disabled: true,
            deletedAt: null,
          },
        },
      ],
    }),
  };
  const capability = {
    metadata: jest
      .fn()
      .mockReturnValue({ actions: { remove: true }, metrics: { likes: true } }),
    loadMetrics: jest.fn(),
    removePost: jest.fn().mockResolvedValue({ status: 'removed' }),
    repost: jest.fn(),
    addPlugReply: jest.fn(),
  };
  const postsService = {
    getPostsRecursively: jest
      .fn()
      .mockResolvedValue([{ ...rootPost, tags: [] }]),
    mapTypeToPost: jest.fn(async (body: any) => body),
    createPost: jest.fn(),
    validatePosts: jest.fn(),
  };
  const pipelineService = {
    enqueue: jest
      .fn()
      .mockResolvedValue({ id: 'item-1', group: 'queue-group-1' }),
  };

  const service = Object.create(
    PostRulesExecutionService.prototype
  ) as PostRulesExecutionService;
  (service as any)._executionRepository = executionRepository;
  (service as any)._integrationManager = {
    getPostRulesCapabilities: jest
      .fn()
      .mockReturnValue({ x: { actions: ['REMOVE'], metrics: [] } }),
    getSocialIntegration: jest.fn().mockReturnValue({ postRules: capability }),
  };
  (service as any)._refreshIntegrationService = { refresh: jest.fn() };
  (service as any)._postsService = postsService;
  (service as any)._pipelineService = pipelineService;
  (service as any)._notificationService = { inAppNotification: jest.fn() };

  executionRepository.claimEvaluation.mockResolvedValue({
    outcome: 'CLAIMED',
    evaluation: { id: 'evaluation-1', evaluationIndex: 0, actionResult: null },
    evaluationCount: 1,
    run: {
      id: 'run-1',
      organizationId: 'org-1',
      lineageId: 'lineage-1',
      rescheduleAttempt: 1,
    },
    rule: {
      id: 'rule-1',
      name: 'Requeue flops',
      enabled: true,
      action: 'REMOVE',
      conditionMatch: 'ANY',
      conditions: [],
      actionConfig: {},
      rescheduleConfig: { mode: 'PIPELINE', pipelineId: 'pipeline-2' },
      maxRescheduleAttempts: 3,
      integrations: [],
      pipelines: [{ pipelineId: 'pipeline-1' }],
    },
    post: rootPost,
  });

  return {
    service,
    executionRepository,
    capability,
    postsService,
    pipelineService,
  };
};

const request = { organizationId: 'org-1', runId: 'run-1', evaluationIndex: 0 };

describe('Pipeline reschedule through the Pipeline boundary', () => {
  it('enqueues one idempotent queue item covering every active Pipeline channel', async () => {
    const { service, pipelineService, executionRepository } = createService();

    const result = await service.processEvaluation(request);

    expect(pipelineService.enqueue).toHaveBeenCalledTimes(1);
    const [orgId, body, createdBy, idempotencyKey] =
      pipelineService.enqueue.mock.calls[0];
    expect(orgId).toBe('org-1');
    expect(createdBy).toBe('API');
    expect(idempotencyKey).toBe('rule_run-1_0');
    expect(body.pipelineId).toBe('pipeline-2');
    expect(body.post.type).toBe('draft');
    expect(body.post.posts.map((post: any) => post.integration.id)).toEqual([
      'channel-1',
      'channel-2',
    ]);
    expect(body.post.posts[0].settings).toEqual({
      __type: 'x',
      post_type: 'post',
    });
    expect(body.post.posts[1].settings).toEqual({ __type: 'bluesky' });

    expect(executionRepository.getRootPostByGroup).toHaveBeenCalledWith(
      'org-1',
      'queue-group-1',
      'channel-1'
    );
    expect(executionRepository.createSuccessorRun).toHaveBeenCalledWith(
      'org-1',
      'rule-1',
      'post-2',
      'lineage-1',
      2
    );
    expect(result.actionResult?.successorPostId).toBe('post-2');
    expect(result.status).toBe('COMPLETED');
  });

  it('never bypasses the Pipeline when the target is unavailable', async () => {
    const { service, executionRepository, capability, pipelineService } =
      createService();
    executionRepository.getReschedulePipeline.mockResolvedValue(null);

    const result = await service.processEvaluation(request);

    expect(pipelineService.enqueue).not.toHaveBeenCalled();
    expect(capability.removePost).not.toHaveBeenCalled();
    expect(result.status).toBe('FAILED');
    expect(result.errorSummary).toContain('unavailable');
  });

  it('refuses to reschedule into a Pipeline that no longer holds the published channel', async () => {
    const { service, executionRepository, capability } = createService();
    executionRepository.getReschedulePipeline.mockResolvedValue({
      id: 'pipeline-2',
      integrations: [
        {
          integration: {
            id: 'channel-2',
            providerIdentifier: 'bluesky',
            disabled: false,
            deletedAt: null,
          },
        },
      ],
    });

    const result = await service.processEvaluation(request);

    expect(capability.removePost).not.toHaveBeenCalled();
    expect(result.status).toBe('FAILED');
    expect(result.errorSummary).toContain('no longer contains');
  });

  it('surfaces a Pipeline validation rejection instead of removing the original', async () => {
    const { service, pipelineService, capability } = createService();
    pipelineService.enqueue.mockRejectedValue(
      new Error(
        'Pipeline content must contain exactly the Pipeline integrations'
      )
    );

    const result = await service.processEvaluation(request);

    expect(capability.removePost).not.toHaveBeenCalled();
    expect(result.status).toBe('FAILED');
    expect(result.errorSummary).toContain('exactly the Pipeline integrations');
  });
});

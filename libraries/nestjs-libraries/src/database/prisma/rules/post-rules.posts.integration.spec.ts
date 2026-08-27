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
import { resolveManualRescheduleDate } from './post-rules.execution';

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
  image: JSON.stringify([{ id: 'media-1', path: 'a.png' }]),
  content: 'first',
  delay: 0,
  deletedAt: null,
  platformDeletedAt: null,
  parentPostId: null,
  integration,
  pipelineQueueItem: null,
} as any;

const manualReschedule = {
  mode: 'MANUAL' as const,
  daysAfterEvaluation: 1,
  timeOfDay: '09:00',
  timezone: 'UTC',
};

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
    getRootPostByGroup: jest.fn().mockResolvedValue(null),
    getReschedulePipeline: jest.fn(),
  };
  const capability = {
    metadata: jest.fn().mockReturnValue({
      actions: { remove: true },
      metrics: { likes: true, replies: true },
    }),
    loadMetrics: jest.fn(),
    removePost: jest.fn().mockResolvedValue({ status: 'removed' }),
    repost: jest.fn(),
    addPlugReply: jest.fn(),
  };
  const postsService = {
    getPostsRecursively: jest.fn().mockResolvedValue([
      {
        ...rootPost,
        tags: [{ tag: { name: 'launch' } }],
      },
      {
        id: 'post-1-child',
        content: 'reply',
        image: JSON.stringify([]),
        delay: 90,
      },
    ]),
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
    getPostRulesCapabilities: jest
      .fn()
      .mockReturnValue({ x: { actions: ['REMOVE'], metrics: [] } }),
    getSocialIntegration: jest.fn().mockReturnValue({ postRules: capability }),
  };
  (service as any)._refreshIntegrationService = { refresh: jest.fn() };
  (service as any)._postsService = postsService;
  (service as any)._pipelineService = { enqueue: jest.fn() };
  (service as any)._notificationService = { inAppNotification: jest.fn() };

  executionRepository.claimEvaluation.mockResolvedValue({
    outcome: 'CLAIMED',
    evaluation: { id: 'evaluation-1', evaluationIndex: 0, actionResult: null },
    evaluationCount: 1,
    run: {
      id: 'run-1',
      organizationId: 'org-1',
      lineageId: 'lineage-1',
      rescheduleAttempt: 0,
    },
    rule: {
      id: 'rule-1',
      name: 'Remove flops',
      enabled: true,
      action: 'REMOVE',
      conditionMatch: 'ANY',
      conditions: [],
      actionConfig: {},
      rescheduleConfig: manualReschedule,
      maxRescheduleAttempts: 3,
      integrations: [{ integrationId: 'channel-1' }],
      pipelines: [],
    },
    post: rootPost,
  });

  return { service, executionRepository, capability, postsService };
};

const request = { organizationId: 'org-1', runId: 'run-1', evaluationIndex: 0 };

describe('manual reschedule through the Posts boundary', () => {
  it('clones the whole thread with its content, media, delays, settings and tags', async () => {
    const { service, postsService } = createService();

    await service.processEvaluation(request);

    expect(postsService.mapTypeToPost).toHaveBeenCalledTimes(1);
    const [payload] = postsService.mapTypeToPost.mock.calls[0];
    expect(payload.type).toBe('schedule');
    expect(payload.shortLink).toBe(false);
    expect(payload.tags).toEqual([{ value: 'launch', label: 'launch' }]);
    expect(payload.posts).toHaveLength(1);
    expect(payload.posts[0].integration).toEqual({ id: 'channel-1' });
    expect(payload.posts[0].group).toBe('rule_run-1_0');
    expect(payload.posts[0].settings).toEqual({
      __type: 'x',
      post_type: 'post',
    });
    expect(payload.posts[0].value).toEqual([
      {
        content: 'first',
        image: [{ id: 'media-1', path: 'a.png' }],
        delay: 0,
      },
      { content: 'reply', image: [], delay: 90 },
    ]);
  });

  it('goes through the shared validation and creation path with a stable group', async () => {
    const { service, postsService } = createService();

    await service.processEvaluation(request);

    expect(postsService.validatePosts).toHaveBeenCalledWith(
      'org-1',
      expect.arrayContaining([
        expect.objectContaining({ integration: { id: 'channel-1' } }),
      ])
    );
    expect(postsService.createPost).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        posts: [expect.objectContaining({ group: 'rule_run-1_0' })],
      }),
      'API',
      true
    );
  });

  it('reuses the group a previous attempt already created', async () => {
    const { service, executionRepository, postsService } = createService();
    executionRepository.getRootPostByGroup.mockResolvedValue({ id: 'post-5' });

    const result = await service.processEvaluation(request);

    expect(executionRepository.getRootPostByGroup).toHaveBeenCalledWith(
      'org-1',
      'rule_run-1_0',
      'channel-1'
    );
    expect(postsService.createPost).not.toHaveBeenCalled();
    expect(result.actionResult?.successorPostId).toBe('post-5');
  });

  it('refuses to remove the original when the clone fails validation', async () => {
    const { service, capability, postsService } = createService();
    postsService.validatePosts.mockResolvedValue([
      {
        name: 'X',
        valid: false,
        settingsError: 'Title is required',
        errors: true,
        emptyContent: false,
        tooLong: false,
      },
    ]);

    const result = await service.processEvaluation(request);

    expect(postsService.createPost).not.toHaveBeenCalled();
    expect(capability.removePost).not.toHaveBeenCalled();
    expect(result.status).toBe('FAILED');
    expect(result.errorSummary).toContain('Title is required');
  });

  it('resolves the saved relative target instead of a stale absolute date', () => {
    expect(
      resolveManualRescheduleDate(
        {
          mode: 'MANUAL',
          daysAfterEvaluation: 2,
          timeOfDay: '09:30',
          timezone: 'UTC',
        },
        new Date('2026-08-21T18:00:00.000Z')
      ).toISOString()
    ).toBe('2026-08-23T09:30:00.000Z');

    expect(
      resolveManualRescheduleDate(
        {
          mode: 'MANUAL',
          daysAfterEvaluation: 0,
          timeOfDay: '08:00',
          timezone: 'UTC',
        },
        new Date('2026-08-21T18:00:00.000Z')
      ).toISOString()
    ).toBe('2026-08-22T08:00:00.000Z');
  });

  it('honours the stored organization timezone', () => {
    expect(
      resolveManualRescheduleDate(
        {
          mode: 'MANUAL',
          daysAfterEvaluation: 1,
          timeOfDay: '09:00',
          timezone: 'America/New_York',
        },
        new Date('2026-08-21T18:00:00.000Z')
      ).toISOString()
    ).toBe('2026-08-22T13:00:00.000Z');
  });
});

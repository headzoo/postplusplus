jest.mock('nestjs-temporal-core', () => ({
  Activity: () => () => undefined,
  ActivityMethod: () => () => undefined,
  TemporalService: class TemporalService {},
}));

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({
    PostsService: class PostsService {},
  })
);

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({
    NotificationService: class NotificationService {},
  })
);

jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));

jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({
    RefreshIntegrationService: class RefreshIntegrationService {},
  })
);

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({
    IntegrationService: class IntegrationService {},
  })
);

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({
    WebhooksService: class WebhooksService {},
  })
);

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/logs/logs.service',
  () => ({
    LogsService: class LogsService {},
  })
);

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({
    SubscriptionService: class SubscriptionService {},
  })
);

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.plug.service',
  () => ({
    PipelinePlugService: class PipelinePlugService {},
  })
);

jest.mock('@gitroom/helpers/utils/strip.html.validation', () => ({
  stripHtmlValidation: jest.fn(),
}));

jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({
    getSsrfSafeDispatcher: jest.fn(),
  })
);

jest.mock('@gitroom/nestjs-libraries/integrations/publish.file.sink', () => ({
  getPublishFileSinkDirectory: jest.fn(),
  sinkOutboundPublish: jest.fn(),
}));

import { PostActivity } from './post.activity';
import { WebhookHttpLogSource } from '@prisma/client';

const activity = (overrides: {
  logsService?: Record<string, jest.Mock>;
  integrationService?: Record<string, jest.Mock>;
}) =>
  new PostActivity(
    {
      getPostByForWebhookId: jest.fn().mockResolvedValue([{ id: 'post-1' }]),
    } as any,
    {} as any,
    {} as any,
    {
      getIntegrationById: jest.fn().mockResolvedValue({
        id: 'int-1',
        name: 'My X',
        profile: 'me',
      }),
      ...overrides.integrationService,
    } as any,
    {} as any,
    {
      getWebhooks: jest.fn().mockResolvedValue([
        {
          id: 'wh-1',
          name: 'CRM',
          url: 'https://example.com/hook',
          integrations: [],
        },
      ]),
    } as any,
    {
      logOutboundWebhook: jest.fn().mockResolvedValue(undefined),
      ...overrides.logsService,
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { append: jest.fn().mockResolvedValue(undefined) } as any
  );

describe('PostActivity.sendWebhooks', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('writes an outbound webhook log after a successful delivery', async () => {
    const logsService = {
      logOutboundWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const response = {
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => '{"ok":true}',
    };
    global.fetch = jest.fn().mockResolvedValue(response) as any;

    await activity({ logsService }).sendWebhooks('post-1', 'org-1', 'int-1');

    expect(logsService.logOutboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        webhookId: 'wh-1',
        integrationId: 'int-1',
        source: WebhookHttpLogSource.ORG_WEBHOOK,
        method: 'POST',
        url: 'https://example.com/hook',
        response,
        sourceDisplayName: 'My X',
        sourceUsername: 'me',
        targetDisplayName: 'CRM',
        targetUsername: 'example.com',
        eventType: 'post.create',
      })
    );
  });

  it('logs delivery failures without failing the activity', async () => {
    const logsService = {
      logOutboundWebhook: jest.fn().mockResolvedValue(undefined),
    };
    const error = new Error('webhook down');
    global.fetch = jest.fn().mockRejectedValue(error) as any;

    await expect(
      activity({ logsService }).sendWebhooks('post-1', 'org-1', 'int-1')
    ).resolves.toBeUndefined();

    expect(logsService.logOutboundWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        webhookId: 'wh-1',
        error,
        sourceDisplayName: 'My X',
        targetDisplayName: 'CRM',
        targetUsername: 'example.com',
        eventType: 'post.create',
      })
    );
  });
});

describe('PostActivity.editPost', () => {
  const originalStripe = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = originalStripe;
  });

  it('calls the provider editPost with the stored release id', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const editPost = jest.fn().mockResolvedValue([
      {
        id: 'post-1',
        postId: 'new-id',
        releaseURL: 'https://x.com/status/new-id',
        status: 'posted',
      },
    ]);
    const instance = new PostActivity(
      {
        updateTags: jest.fn().mockImplementation((_org, posts) => posts),
        updateMedia: jest.fn().mockResolvedValue([]),
      } as any,
      {} as any,
      {
        getSocialIntegration: jest.fn().mockReturnValue({
          editor: 'normal',
          editPost,
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { append: jest.fn().mockResolvedValue(undefined) } as any
    );

    const { stripHtmlValidation } = jest.requireMock(
      '@gitroom/helpers/utils/strip.html.validation'
    );
    stripHtmlValidation.mockReturnValue('Hello');

    await expect(
      instance.editPost(
        {
          id: 'int-1',
          organizationId: 'org',
          providerIdentifier: 'x',
          token: 'token',
          internalId: 'user',
        } as any,
        [
          {
            id: 'post-1',
            content: 'Hello',
            settings: '{}',
            image: '[]',
            releaseId: 'old-id',
          } as any,
        ]
      )
    ).resolves.toEqual([
      {
        id: 'post-1',
        postId: 'new-id',
        releaseURL: 'https://x.com/status/new-id',
        status: 'posted',
      },
    ]);

    expect(editPost).toHaveBeenCalledWith(
      'user',
      'token',
      [
        expect.objectContaining({
          id: 'post-1',
          message: 'Hello',
        }),
      ],
      expect.objectContaining({ providerIdentifier: 'x' }),
      'old-id'
    );
  });
});

describe('PostActivity V108 legacy plug compatibility', () => {
  it('resolves globalPlugsV107 through PipelinePlugService', async () => {
    const resolveGlobalPlugs = jest
      .fn()
      .mockResolvedValue([{ plugId: 'plug-1' }]);
    const integration = {
      id: 'int-1',
      providerIdentifier: 'x',
    } as any;
    const instance = new PostActivity(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { resolveGlobalPlugs } as any,
      {} as any,
      { append: jest.fn().mockResolvedValue(undefined) } as any
    );

    await expect(
      instance.globalPlugsV107('post-1', integration)
    ).resolves.toEqual([{ plugId: 'plug-1' }]);

    expect(resolveGlobalPlugs).toHaveBeenCalledWith('post-1', 'int-1', 'x');
  });

  it('resolves processPlugV107 through IntegrationService.processPlugs', async () => {
    const processPlugs = jest.fn().mockResolvedValue(true);
    const payload = {
      plugId: 'plug-1',
      postId: 'post-1',
      delay: 3600000,
      totalRuns: 3,
      currentRun: 1,
      source: 'pipeline' as const,
    };
    const instance = new PostActivity(
      {} as any,
      {} as any,
      {} as any,
      { processPlugs } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { append: jest.fn().mockResolvedValue(undefined) } as any
    );

    await expect(instance.processPlugV107(payload)).resolves.toBe(true);
    expect(processPlugs).toHaveBeenCalledWith(payload);
  });
});

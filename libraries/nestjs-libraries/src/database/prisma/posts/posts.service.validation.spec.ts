import { BadRequestException } from '@nestjs/common';

jest.mock('@gitroom/helpers/utils/sanitize.post.content', () => ({
  sanitizePostContent: (value: string) => value,
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

import { PostsService } from './posts.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

describe('PostsService post references', () => {
  const reference = {
    type: 'quote' as const,
    providerIdentifier: 'x',
    externalId: '123456789',
  };

  const service = (provider: any) => {
    const instance = Object.create(PostsService.prototype) as any;
    instance._integrationManager = {
      getSocialIntegration: jest.fn().mockReturnValue(provider),
    };
    return instance;
  };

  it('rejects references that target another provider', () => {
    expect(() =>
      service({
        name: 'X',
        postReferences: { quote: true },
      }).validatePostReference(
        { value: [{ reference }], settings: {} },
        { providerIdentifier: 'linkedin' }
      )
    ).toThrow(BadRequestException);
  });

  it('rejects references on comments and unsupported providers', () => {
    expect(() =>
      service({
        name: 'X',
        postReferences: { quote: true },
      }).validatePostReference(
        { value: [{}, { reference }], settings: {} },
        { providerIdentifier: 'x' }
      )
    ).toThrow('first post in a thread');

    expect(() =>
      service({ name: 'LinkedIn' }).validatePostReference(
        { value: [{ reference }], settings: {} },
        { providerIdentifier: 'x' }
      )
    ).toThrow('does not support quote post references');
  });
});

describe('PostsService provider read caches', () => {
  const futureTokenExpiration = new Date(Date.now() + 60_000);
  const integration = {
    id: 'integration-id',
    internalId: 'x-user-id',
    providerIdentifier: 'x',
    token: 'token',
    tokenExpiration: futureTokenExpiration,
  };

  const service = (post: any, provider: any) => {
    const instance = Object.create(PostsService.prototype) as any;
    instance._postRepository = {
      getPostById: jest.fn().mockResolvedValue(post),
    };
    instance._integrationManager = {
      getSocialIntegration: jest.fn().mockReturnValue(provider),
    };
    instance._channelInteractionService = {
      isLikerSyncPausedForIntegration: jest.fn(),
    };
    instance._refreshIntegrationService = { refresh: jest.fn() };
    instance._integrationService = { disconnectChannel: jest.fn() };
    return instance as PostsService;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves stored post analytics without making another provider request', async () => {
    const cached = [{ label: 'Likes', percentageChange: 0, data: [] }];
    jest.mocked(ioRedis.get).mockResolvedValue(JSON.stringify(cached));
    const postAnalytics = jest.fn();
    const instance = service(
      { id: 'post-id', releaseId: 'tweet-id', integration },
      { postAnalytics }
    );

    await expect(
      instance.checkPostAnalytics('organization-id', 'post-id', 7)
    ).resolves.toEqual(cached);
    expect(ioRedis.get).toHaveBeenCalledWith(
      'integration:organization-id:post-id:7'
    );
    expect(postAnalytics).not.toHaveBeenCalled();
  });

  it('serves stored post likers without making another provider request', async () => {
    const cached = {
      supported: true as const,
      users: [{ id: 'person-id', name: 'Person', username: 'person' }],
    };
    jest.mocked(ioRedis.get).mockResolvedValue(JSON.stringify(cached));
    const postLikers = jest.fn();
    const instance = service(
      {
        id: 'post-id',
        state: 'PUBLISHED',
        releaseId: 'tweet-id',
        integration,
      },
      { postLikers }
    );

    await expect(
      instance.getPostLikers('organization-id', 'post-id')
    ).resolves.toEqual(cached);
    expect(ioRedis.get).toHaveBeenCalledWith(
      'post-likers:organization-id:post-id'
    );
    expect(postLikers).not.toHaveBeenCalled();
    expect(
      (instance as any)._channelInteractionService
        .isLikerSyncPausedForIntegration
    ).not.toHaveBeenCalled();
  });
});

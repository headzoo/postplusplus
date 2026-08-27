import { IntegrationService } from './integration.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { HttpException } from '@nestjs/common';

jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

describe('IntegrationService channel notices', () => {
  const org = { id: 'org-a' } as any;
  const user = { id: 'user-a' } as any;
  const social = {
    id: 'social',
    name: 'Social channel',
    picture: null,
    profile: 'channel',
    providerIdentifier: 'supported',
    disabled: false,
    type: 'social',
    token: 'token',
    tokenExpiration: new Date(Date.now() + 60_000),
  };

  const createService = (
    integrations: any[],
    providers: Record<string, any>
  ) => {
    const service = Object.create(
      IntegrationService.prototype
    ) as IntegrationService;
    (service as any)._integrationRepository = {
      getIntegrationsList: jest.fn().mockResolvedValue(integrations),
      getIntegrationById: jest.fn((_orgId: string, integrationId: string) =>
        integrations.find((integration) => integration.id === integrationId)
      ),
      getNoticeReadsForUser: jest.fn().mockResolvedValue([]),
      markIntegrationNoticesRead: jest.fn().mockResolvedValue({}),
    };
    (service as any)._integrationManager = {
      getSocialIntegration: jest.fn(
        (identifier: string) => providers[identifier]
      ),
    };
    (service as any)._refreshIntegrationService = {
      refresh: jest.fn(),
    };
    return service;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (ioRedis.get as jest.Mock).mockResolvedValue(null);
    (ioRedis.set as jest.Mock).mockResolvedValue('OK');
  });

  it('returns scoped notice status with unsupported and unavailable channels', async () => {
    const channelNotices = jest.fn().mockResolvedValue({
      state: 'ok',
      unreadCount: 3,
      categories: { mention: 1, like: 2 },
    });
    const failingNotices = jest
      .fn()
      .mockRejectedValue(new Error('provider failure'));
    const service = createService(
      [
        social,
        { ...social, id: 'disabled', disabled: true },
        { ...social, id: 'unsupported', providerIdentifier: 'unsupported' },
        { ...social, id: 'failed', providerIdentifier: 'failing' },
        { ...social, id: 'article', type: 'article' },
      ],
      {
        supported: { channelNotices },
        failing: { channelNotices: failingNotices },
        unsupported: {},
      }
    );

    await expect(service.getChannelNoticeStatus(org, user)).resolves.toEqual({
      statuses: {
        social: expect.objectContaining({
          id: 'social',
          state: 'ok',
          unreadCount: 3,
          categories: { mention: 1, like: 2 },
        }),
        disabled: expect.objectContaining({
          id: 'disabled',
          state: 'disabled',
          unreadCount: 0,
        }),
        unsupported: expect.objectContaining({
          id: 'unsupported',
          state: 'unsupported',
          unreadCount: 0,
        }),
        failed: expect.objectContaining({
          id: 'failed',
          state: 'unavailable',
          unreadCount: 0,
        }),
        article: expect.objectContaining({
          id: 'article',
          state: 'unsupported',
          unreadCount: 0,
        }),
      },
    });
    expect(
      (service as any)._integrationRepository.getIntegrationsList
    ).toHaveBeenCalledWith('org-a');
    expect(
      (service as any)._integrationRepository.getNoticeReadsForUser
    ).toHaveBeenCalledWith('user-a', [
      'social',
      'disabled',
      'unsupported',
      'failed',
      'article',
    ]);
    expect(channelNotices).toHaveBeenCalled();
  });

  it('retries channel notices after a refresh-token failure', async () => {
    const channelNotices = jest
      .fn()
      .mockRejectedValueOnce(new RefreshToken('', '{}', {} as any))
      .mockResolvedValueOnce({
        state: 'ok',
        unreadCount: 1,
        categories: { reply: 1 },
      });
    const service = createService([{ ...social, token: 'old-token' }], {
      supported: { channelNotices },
    });
    (service as any)._refreshIntegrationService.refresh.mockResolvedValue({
      accessToken: 'new-token',
    });

    await expect(service.getChannelNoticeStatus(org, user)).resolves.toEqual({
      statuses: {
        social: expect.objectContaining({
          id: 'social',
          state: 'ok',
          unreadCount: 1,
        }),
      },
    });
    expect(
      (service as any)._refreshIntegrationService.refresh
    ).toHaveBeenCalledTimes(1);
    expect(channelNotices).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ token: 'old-token' }),
      'old-token',
      expect.any(Date)
    );
    expect(channelNotices).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ token: 'new-token' }),
      'new-token',
      expect.any(Date)
    );
  });

  it('marks notices read only for integrations in the organization', async () => {
    const service = createService([social], {});
    await expect(
      service.markChannelNoticesRead(org, user, 'social')
    ).resolves.toEqual({ success: true });
    expect(
      (service as any)._integrationRepository.markIntegrationNoticesRead
    ).toHaveBeenCalledWith('user-a', 'social');

    await expect(
      service.markChannelNoticesRead(org, user, 'missing')
    ).rejects.toBeInstanceOf(HttpException);
  });
});

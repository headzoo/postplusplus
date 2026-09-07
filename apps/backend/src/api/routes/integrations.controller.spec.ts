jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({
    PostsService: class PostsService {},
  })
);
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

import {
  IntegrationsController,
  publicProfileUrl,
} from './integrations.controller';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

describe('publicProfileUrl', () => {
  it('returns undefined for empty values', () => {
    expect(publicProfileUrl(undefined)).toBeUndefined();
    expect(publicProfileUrl('')).toBeUndefined();
  });

  it('accepts valid http and https URLs without credentials', () => {
    expect(publicProfileUrl('https://example.com/profile')).toBe(
      'https://example.com/profile'
    );
    expect(publicProfileUrl('http://example.com/profile')).toBe(
      'http://example.com/profile'
    );
  });

  it('rejects javascript: URLs', () => {
    expect(publicProfileUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('rejects malformed URLs', () => {
    expect(publicProfileUrl('not-a-url')).toBeUndefined();
    expect(publicProfileUrl('https://')).toBeUndefined();
  });

  it('rejects credential-bearing URLs', () => {
    expect(
      publicProfileUrl('https://user:pass@example.com/profile')
    ).toBeUndefined();
    expect(
      publicProfileUrl('https://user@example.com/profile')
    ).toBeUndefined();
    expect(
      publicProfileUrl('https://:pass@example.com/profile')
    ).toBeUndefined();
  });
});

describe('IntegrationsController strategy settings', () => {
  it('passes the complete strategy DTO to the service', async () => {
    const updateChannelStrategy = jest.fn().mockResolvedValue({
      strategy: { id: 'lead_capture', version: 1 },
      recomputeRequested: true,
    });
    const controller = new IntegrationsController(
      {} as any,
      { updateChannelStrategy } as any,
      {} as any,
      {} as any,
      {} as any
    );

    await expect(
      controller.updateChannelStrategy({ id: 'org-a' } as any, 'channel-a', {
        strategyId: 'lead_capture',
      })
    ).resolves.toEqual({
      strategy: { id: 'lead_capture', version: 1 },
      recomputeRequested: true,
    });
    expect(updateChannelStrategy).toHaveBeenCalledWith('org-a', 'channel-a', {
      strategyId: 'lead_capture',
    });
  });
});

describe('IntegrationsController utm params settings', () => {
  it('passes the complete utm params DTO to the service', async () => {
    const updateChannelUtmParams = jest.fn().mockResolvedValue({
      utmParams: 'utm_campaign=spring',
    });
    const controller = new IntegrationsController(
      {} as any,
      { updateChannelUtmParams } as any,
      {} as any,
      {} as any,
      {} as any
    );

    await expect(
      controller.updateChannelUtmParams({ id: 'org-a' } as any, 'channel-a', {
        utmParams: 'utm_campaign=spring',
      })
    ).resolves.toEqual({ utmParams: 'utm_campaign=spring' });
    expect(updateChannelUtmParams).toHaveBeenCalledWith('org-a', 'channel-a', {
      utmParams: 'utm_campaign=spring',
    });
  });
});

describe('IntegrationsController lead discovery settings', () => {
  it('passes the opt-in and quota DTO to the service', async () => {
    const updateChannelLeadDiscovery = jest.fn().mockResolvedValue({
      enabled: true,
      dailyQuota: 3,
    });
    const controller = new IntegrationsController(
      {} as any,
      { updateChannelLeadDiscovery } as any,
      {} as any,
      {} as any,
      {} as any
    );

    await expect(
      controller.updateChannelLeadDiscovery(
        { id: 'org-a' } as any,
        'channel-a',
        { enabled: true, dailyQuota: 3 }
      )
    ).resolves.toEqual({ enabled: true, dailyQuota: 3 });
    expect(updateChannelLeadDiscovery).toHaveBeenCalledWith(
      'org-a',
      'channel-a',
      { enabled: true, dailyQuota: 3 }
    );
  });
});

describe('IntegrationsController mention read cache', () => {
  it('does not cache provider failures as confirmed misses', async () => {
    const integrationService = {
      getIntegrationById: jest.fn().mockResolvedValue({
        id: 'channel-a',
        providerIdentifier: 'x',
      }),
      getMentions: jest.fn().mockResolvedValue([]),
    };
    const controller = new IntegrationsController(
      {
        getSocialIntegration: jest.fn().mockReturnValue({
          allowsReadFeature: jest.fn().mockReturnValue(true),
        }),
      } as any,
      integrationService as any,
      {} as any,
      {} as any,
      {} as any
    );
    jest.spyOn(controller, 'functionIntegration').mockResolvedValue(false);
    (ioRedis.get as jest.Mock).mockResolvedValue(null);

    await expect(
      controller.mentions({ id: 'org-a' } as any, {
        id: 'channel-a',
        name: 'mention',
        data: { query: 'missing' },
      })
    ).resolves.toEqual([]);
    expect(ioRedis.set).not.toHaveBeenCalled();
  });
});

describe('IntegrationsController conversion webhook credentials', () => {
  it('returns the plaintext token only from rotation', async () => {
    const rotateConversionWebhookCredential = jest
      .fn()
      .mockResolvedValue({ token: 'one-time-token' });
    const getConversionWebhookCredentialStatus = jest.fn().mockResolvedValue({
      configured: true,
      lastFour: 'oken',
      createdAt: '2026-08-27T00:00:00.000Z',
      rotatedAt: '2026-08-27T00:00:00.000Z',
    });
    const controller = new IntegrationsController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        rotateConversionWebhookCredential,
        getConversionWebhookCredentialStatus,
      } as any
    );

    await expect(
      controller.rotateConversionWebhookCredential(
        { id: 'org-a' } as any,
        'channel-a'
      )
    ).resolves.toEqual({ token: 'one-time-token' });
    expect(rotateConversionWebhookCredential).toHaveBeenCalledWith(
      'org-a',
      'channel-a'
    );

    await expect(
      controller.getConversionWebhookCredentialStatus(
        { id: 'org-a' } as any,
        'channel-a'
      )
    ).resolves.toEqual({
      configured: true,
      lastFour: 'oken',
      createdAt: '2026-08-27T00:00:00.000Z',
      rotatedAt: '2026-08-27T00:00:00.000Z',
    });
    expect(
      getConversionWebhookCredentialStatus.mock.results[0].value
    ).not.toHaveProperty('token');
  });
});

jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({
    PostsService: class PostsService {},
  })
);

import {
  IntegrationsController,
  publicProfileUrl,
} from './integrations.controller';

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

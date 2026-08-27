jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
  socialIntegrationList: [],
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({
    PostsService: class PostsService {},
  })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({
    MediaService: class MediaService {},
  })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({
    NotificationService: class NotificationService {},
  })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({
    RefreshIntegrationService: class RefreshIntegrationService {},
  })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/conversions/conversion.service',
  () => ({
    ConversionService: class ConversionService {},
  })
);
jest.mock('@sentry/nestjs', () => ({
  metrics: { count: jest.fn() },
}));

import { HttpException } from '@nestjs/common';
import { ConversionSource } from '@prisma/client';
import { PublicIntegrationsController } from './public.integrations.controller';
import * as Sentry from '@sentry/nestjs';

describe('PublicIntegrationsController conversions', () => {
  const conversionService = {
    ingestGoal: jest.fn(),
    resolveSupportCasePublic: jest.fn(),
  };
  const controller = new PublicIntegrationsController(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    conversionService as any
  );
  const org = { id: 'org-a' } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires integrationId for public goal ingestion', async () => {
    await expect(
      controller.ingestConversionGoal(org, {
        eventId: 'evt-1',
        goal: 'signup',
        attribution: { utm_campaign: 'spring' },
      } as any)
    ).rejects.toBeInstanceOf(HttpException);
    expect(conversionService.ingestGoal).not.toHaveBeenCalled();
  });

  it('ingests goals for the authenticated organization', async () => {
    conversionService.ingestGoal.mockResolvedValue({
      created: true,
      conversion: { id: 'evt-1' },
    });

    await expect(
      controller.ingestConversionGoal(org, {
        eventId: 'evt-1',
        integrationId: 'integration-a',
        goal: 'signup',
        attribution: { ppClickId: 'click-1' },
      } as any)
    ).resolves.toEqual({ created: true, conversion: { id: 'evt-1' } });
    expect(conversionService.ingestGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        source: ConversionSource.API,
        integrationId: 'integration-a',
      })
    );
    expect(Sentry.metrics.count).toHaveBeenCalledWith('public_api-request', 1);
  });

  it('exposes explicit support resolution on the public API', async () => {
    conversionService.resolveSupportCasePublic.mockResolvedValue({
      created: true,
      conversion: { id: 'evt-2' },
    });

    await expect(
      controller.resolveSupportConversion(org, {
        eventId: 'resolve-1',
        integrationId: 'integration-a',
        externalCaseKey: 'conversation:abc',
      } as any)
    ).resolves.toEqual({ created: true, conversion: { id: 'evt-2' } });
    expect(Sentry.metrics.count).toHaveBeenCalledWith('public_api-request', 1);
  });
});

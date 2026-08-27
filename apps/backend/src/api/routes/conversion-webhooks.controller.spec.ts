jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/conversions/conversion.service',
  () => ({
    ConversionService: class ConversionService {},
  })
);

import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConversionSource } from '@prisma/client';
import { ConversionWebhooksController } from './conversion-webhooks.controller';

describe('ConversionWebhooksController', () => {
  const conversionService = {
    findIntegrationForConversionWebhook: jest.fn(),
    verifyConversionWebhookCredential: jest.fn(),
    ingestGoal: jest.fn(),
  };
  const controller = new ConversionWebhooksController(conversionService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects missing bearer credentials', async () => {
    await expect(
      controller.ingestGoal('integration-a', undefined, {
        eventId: 'evt-1',
        goal: 'signup',
        attribution: { ppClickId: 'click-1' },
      } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown integrations without leaking credential state', async () => {
    conversionService.findIntegrationForConversionWebhook.mockResolvedValue(
      null
    );

    await expect(
      controller.ingestGoal('integration-a', 'Bearer secret-token', {
        eventId: 'evt-1',
        goal: 'signup',
        attribution: { ppClickId: 'click-1' },
      } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(
      conversionService.verifyConversionWebhookCredential
    ).not.toHaveBeenCalled();
  });

  it('rejects invalid bearer credentials', async () => {
    conversionService.findIntegrationForConversionWebhook.mockResolvedValue({
      id: 'integration-a',
      organizationId: 'org-a',
    });
    conversionService.verifyConversionWebhookCredential.mockResolvedValue(
      false
    );

    await expect(
      controller.ingestGoal('integration-a', 'Bearer wrong-token', {
        eventId: 'evt-1',
        goal: 'signup',
        attribution: { ppClickId: 'click-1' },
      } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ingests webhook goals through the shared service path', async () => {
    conversionService.findIntegrationForConversionWebhook.mockResolvedValue({
      id: 'integration-a',
      organizationId: 'org-a',
    });
    conversionService.verifyConversionWebhookCredential.mockResolvedValue(true);
    conversionService.ingestGoal.mockResolvedValue({
      created: true,
      conversion: { id: 'evt-1' },
    });

    await expect(
      controller.ingestGoal('integration-a', 'Bearer valid-token', {
        eventId: 'evt-1',
        goal: 'signup',
        attribution: { ppClickId: 'click-1' },
      } as any)
    ).resolves.toEqual({ created: true, conversion: { id: 'evt-1' } });
    expect(conversionService.ingestGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        source: ConversionSource.WEBHOOK,
        integrationId: 'integration-a',
      })
    );
  });

  it('rejects body integration IDs that do not match the authenticated route', async () => {
    conversionService.findIntegrationForConversionWebhook.mockResolvedValue({
      id: 'integration-a',
      organizationId: 'org-a',
    });
    conversionService.verifyConversionWebhookCredential.mockResolvedValue(true);

    await expect(
      controller.ingestGoal('integration-a', 'Bearer valid-token', {
        eventId: 'evt-1',
        integrationId: 'integration-b',
        goal: 'signup',
        attribution: { ppClickId: 'click-1' },
      } as any)
    ).rejects.toMatchObject({
      status: 400,
      response: { msg: 'integrationId must match the route integration' },
    });
    expect(conversionService.ingestGoal).not.toHaveBeenCalled();
  });

  it('maps ingestion validation failures to 400 responses', async () => {
    conversionService.findIntegrationForConversionWebhook.mockResolvedValue({
      id: 'integration-a',
      organizationId: 'org-a',
    });
    conversionService.verifyConversionWebhookCredential.mockResolvedValue(true);
    conversionService.ingestGoal.mockRejectedValue(
      new Error('Click attribution is invalid or expired')
    );

    await expect(
      controller.ingestGoal('integration-a', 'Bearer valid-token', {
        eventId: 'evt-1',
        goal: 'signup',
        attribution: { ppClickId: 'bad-click' },
      } as any)
    ).rejects.toBeInstanceOf(HttpException);
  });
});

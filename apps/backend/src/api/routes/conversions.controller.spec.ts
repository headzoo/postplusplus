jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/conversions/conversion.service',
  () => ({
    ConversionService: class ConversionService {},
  })
);

import { HttpException } from '@nestjs/common';
import { ConversionSource } from '@prisma/client';
import { ConversionsController } from './conversions.controller';

describe('ConversionsController', () => {
  const conversionService = {
    listConversions: jest.fn(),
    summarizeConversions: jest.fn(),
    ingestGoal: jest.fn(),
    resolveSupportCasePublic: jest.fn(),
  };
  const controller = new ConversionsController(conversionService as any);
  const org = { id: 'org-a' } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists conversions with org ownership', async () => {
    conversionService.listConversions.mockResolvedValue({
      items: [{ id: 'evt-1' }],
      nextCursor: undefined,
    });

    await expect(
      controller.listConversions(org, 'integration-a', { take: 25 } as any)
    ).resolves.toEqual({ items: [{ id: 'evt-1' }], nextCursor: undefined });
    expect(conversionService.listConversions).toHaveBeenCalledWith(
      'org-a',
      'integration-a',
      expect.objectContaining({ take: 25 })
    );
  });

  it('rejects partial date ranges', async () => {
    await expect(
      controller.listConversions(org, 'integration-a', {
        from: '2026-08-01',
      } as any)
    ).rejects.toBeInstanceOf(HttpException);
    expect(conversionService.listConversions).not.toHaveBeenCalled();
  });

  it('ingests goals through the shared service path', async () => {
    conversionService.ingestGoal.mockResolvedValue({
      created: true,
      conversion: { id: 'evt-1' },
    });

    await expect(
      controller.ingestGoal(org, 'integration-a', {
        eventId: 'evt-ext-1',
        goal: 'signup',
        attribution: { ppClickId: 'click-1' },
      } as any)
    ).resolves.toEqual({ created: true, conversion: { id: 'evt-1' } });
    expect(conversionService.ingestGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        source: ConversionSource.API,
        integrationId: 'integration-a',
        eventId: 'evt-ext-1',
        goal: 'signup',
        ppClickId: 'click-1',
      })
    );
  });

  it('maps invalid click attribution to a client error', async () => {
    conversionService.ingestGoal.mockRejectedValue(
      new Error('Click attribution is invalid or expired')
    );

    await expect(
      controller.ingestGoal(org, 'integration-a', {
        eventId: 'evt-ext-1',
        goal: 'signup',
        attribution: { ppClickId: 'bad-click' },
      } as any)
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('resolves support cases when route integration matches body', async () => {
    conversionService.resolveSupportCasePublic.mockResolvedValue({
      created: true,
      conversion: { id: 'evt-2' },
    });

    await expect(
      controller.resolveSupportCase(org, 'integration-a', {
        eventId: 'resolve-1',
        integrationId: 'integration-a',
        externalCaseKey: 'conversation:abc',
      } as any)
    ).resolves.toEqual({ created: true, conversion: { id: 'evt-2' } });
  });

  it('rejects support resolution when integrationId mismatches route', async () => {
    await expect(
      controller.resolveSupportCase(org, 'integration-a', {
        eventId: 'resolve-1',
        integrationId: 'integration-b',
        externalCaseKey: 'conversation:abc',
      } as any)
    ).rejects.toBeInstanceOf(HttpException);
    expect(conversionService.resolveSupportCasePublic).not.toHaveBeenCalled();
  });
});

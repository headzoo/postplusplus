import {
  ChannelInteractionDirection,
  ChannelInteractionKind,
  ConversionJobKind,
} from '@prisma/client';
import { ConversionService } from './conversion.service';

const createRepository = () => ({
  completeJob: jest.fn().mockResolvedValue({ count: 1 }),
  retryOrFailJob: jest.fn().mockResolvedValue({
    updated: true,
    terminal: true,
  }),
  insertEvent: jest.fn().mockResolvedValue({
    event: { id: 'conversion' },
    created: true,
  }),
  getInteractionWindow: jest.fn().mockResolvedValue([]),
  updateDerivationState: jest.fn().mockResolvedValue({}),
  emitDerivedEventWithCooldown: jest.fn().mockResolvedValue({
    emitted: true,
    event: { id: 'conversion' },
  }),
  recordSupportInbound: jest.fn().mockResolvedValue({ changed: true }),
  recordSupportOutbound: jest.fn().mockResolvedValue({ event: null }),
  findSupportCaseByReference: jest.fn().mockResolvedValue(null),
  resolveSupportCaseWithEvent: jest.fn().mockResolvedValue({
    event: { id: 'resolution' },
    created: true,
  }),
  upsertClickAttribution: jest.fn().mockResolvedValue({
    attribution: { id: 'attribution' },
    created: true,
  }),
});

const job = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'job-1',
    organizationId: 'org',
    integrationId: 'integration',
    strategyId: 'grow_audience',
    strategyVersion: 1,
    kind: ConversionJobKind.MEMBERSHIP_TRANSITION,
    claimToken: 'claim',
    payload: {
      actorExternalId: 'actor-1',
      fromState: 'NOT_FOLLOWER',
      toState: 'FOLLOWER',
      evidenceKey: 'follow-1',
    },
    eventAt: new Date('2026-08-20T12:00:00.000Z'),
    availableAt: new Date('2026-08-20T12:00:00.000Z'),
    ...overrides,
  } as any);

describe('ConversionService', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'conversion-test-secret';
  });

  it('prepares deterministic website-goal click attributions', async () => {
    const repository = createRepository();
    const service = new ConversionService(repository as any);
    const input = {
      organizationId: 'org',
      integrationId: 'integration',
      strategyId: 'lead_capture',
      strategyVersion: 1,
      utmParams: 'utm_campaign=spring&utm_track=legacy&utm_source=newsletter',
      values: [
        {
          id: 'post-item-1',
          content:
            'Visit https://example.com/landing?utm_source=post&pp_click_id=spoofed#details and https://example.com/landing?utm_source=post',
        },
      ],
    };

    const first = await service.prepareLeadCaptureLinks(input);
    const second = await service.prepareLeadCaptureLinks(input);

    const firstUrls = first[0].match(/https:\/\/[^ ]+/g)!;
    const firstClickId = new URL(firstUrls[0]).searchParams.get('pp_click_id');
    expect(firstClickId).toBeTruthy();
    expect(new URL(firstUrls[1]).searchParams.get('pp_click_id')).toBe(
      firstClickId
    );
    expect(second[0]).toBe(first[0]);
    expect(repository.upsertClickAttribution).toHaveBeenCalledTimes(2);
    expect(repository.upsertClickAttribution).toHaveBeenCalledWith(
      'org',
      'integration',
      expect.objectContaining({
        clickId: firstClickId,
        sourcePostItemId: 'post-item-1',
        strategyId: 'lead_capture',
        strategyVersion: 1,
        utmSnapshot: 'utm_source=newsletter&utm_campaign=spring',
        utmFingerprint: expect.any(String),
        expiresAt: expect.any(Date),
      })
    );
  });

  it('keeps non-lead profiles and malformed URLs unchanged', async () => {
    const repository = createRepository();
    const service = new ConversionService(repository as any);

    await expect(
      service.prepareLeadCaptureLinks({
        organizationId: 'org',
        integrationId: 'integration',
        strategyId: 'grow_audience',
        strategyVersion: 1,
        values: [{ id: 'post-item-1', content: 'https://example.com/a' }],
      })
    ).resolves.toEqual(['https://example.com/a']);
    await expect(
      service.prepareLeadCaptureLinks({
        organizationId: 'org',
        integrationId: 'integration',
        strategyId: 'lead_capture',
        strategyVersion: 1,
        values: [{ id: 'post-item-1', content: 'not-a-url' }],
      })
    ).resolves.toEqual(['not-a-url']);
    expect(repository.upsertClickAttribution).not.toHaveBeenCalled();
  });

  it('emits only the configured follower transition and completes mismatches', async () => {
    const repository = createRepository();
    const service = new ConversionService(repository as any);

    await service.evaluateJob(job());
    await service.evaluateJob(
      job({
        id: 'job-2',
        payload: {
          actorExternalId: 'actor-1',
          fromState: 'UNKNOWN',
          toState: 'FOLLOWER',
          evidenceKey: 'follow-2',
        },
      })
    );

    expect(repository.insertEvent).toHaveBeenCalledTimes(1);
    expect(repository.insertEvent).toHaveBeenCalledWith(
      'org',
      'integration',
      expect.objectContaining({
        strategyId: 'grow_audience',
        strategyVersion: 1,
        conversionType: 'follower_gained',
        actorExternalId: 'actor-1',
        dimensions: {
          fromState: 'NOT_FOLLOWER',
          toState: 'FOLLOWER',
        },
      })
    );
    expect(repository.completeJob).toHaveBeenCalledTimes(2);
  });

  it('terminally fails unavailable captured strategy versions', async () => {
    const repository = createRepository();
    const service = new ConversionService(repository as any);

    await expect(
      service.evaluateJob(job({ strategyVersion: 99 }))
    ).resolves.toMatchObject({ status: 'failed' });

    expect(repository.retryOrFailJob).toHaveBeenCalledWith(
      'org',
      'job-1',
      'claim',
      expect.any(Error),
      expect.any(Date),
      1
    );
    expect(repository.completeJob).not.toHaveBeenCalled();
  });

  it('completes interaction evidence that does not belong to a follower profile', async () => {
    const repository = createRepository();
    const service = new ConversionService(repository as any);

    await service.evaluateJob(
      job({
        kind: ConversionJobKind.INTERACTION,
        payload: {
          actorExternalId: 'actor-1',
          interactionEventId: 'interaction-1',
          kind: ChannelInteractionKind.MENTION,
          direction: ChannelInteractionDirection.INBOUND,
        },
      })
    );

    expect(repository.insertEvent).not.toHaveBeenCalled();
    expect(repository.completeJob).toHaveBeenCalled();
  });

  it('uses inbound rolling score and distinct UTC days for amplification', async () => {
    const repository = createRepository();
    repository.getInteractionWindow.mockResolvedValue([
      {
        kind: ChannelInteractionKind.REPOST,
        direction: ChannelInteractionDirection.INBOUND,
        eventAt: new Date('2026-08-19T23:59:00.000Z'),
      },
      {
        kind: ChannelInteractionKind.REPOST,
        direction: ChannelInteractionDirection.INBOUND,
        eventAt: new Date('2026-08-20T00:01:00.000Z'),
      },
      {
        kind: ChannelInteractionKind.MENTION,
        direction: ChannelInteractionDirection.INBOUND,
        eventAt: new Date('2026-08-20T11:00:00.000Z'),
      },
      {
        kind: ChannelInteractionKind.REPOST,
        direction: ChannelInteractionDirection.OUTBOUND,
        eventAt: new Date('2026-08-20T11:30:00.000Z'),
      },
    ]);
    const service = new ConversionService(repository as any);

    await service.evaluateJob(
      job({
        strategyId: 'brand_awareness',
        kind: ConversionJobKind.INTERACTION,
        payload: {
          actorExternalId: 'actor-1',
          interactionEventId: 'interaction-1',
          kind: ChannelInteractionKind.REPOST,
          direction: ChannelInteractionDirection.INBOUND,
        },
      })
    );

    expect(repository.emitDerivedEventWithCooldown).toHaveBeenCalledWith(
      'org',
      'integration',
      expect.objectContaining({
        cooldownMs: 7 * 24 * 60 * 60 * 1000,
        state: expect.objectContaining({
          score: 5,
          activeUtcDays: 2,
          kindCounts: { repost: 2, mention: 1 },
        }),
      })
    );
  });

  it('opens support cases by conversation with actor fallback', async () => {
    const repository = createRepository();
    const service = new ConversionService(repository as any);
    const base = {
      strategyId: 'customer_support',
      kind: ConversionJobKind.INTERACTION,
      payload: {
        actorExternalId: 'actor-1',
        interactionEventId: 'interaction-1',
        kind: ChannelInteractionKind.REPLY,
        direction: ChannelInteractionDirection.INBOUND,
      },
    };

    await service.evaluateJob(job(base));
    await service.evaluateJob(
      job({
        ...base,
        id: 'job-2',
        payload: {
          ...(base.payload as object),
          conversationExternalId: 'thread-1',
        },
      })
    );

    expect(repository.recordSupportInbound).toHaveBeenNthCalledWith(
      1,
      'org',
      'integration',
      expect.any(Object),
      expect.objectContaining({ externalCaseKey: 'actor:actor-1' })
    );
    expect(repository.recordSupportInbound).toHaveBeenNthCalledWith(
      2,
      'org',
      'integration',
      expect.any(Object),
      expect.objectContaining({ externalCaseKey: 'conversation:thread-1' })
    );
  });

  it('passes the inclusive SLA boundary and leaves v1 inference dormant', async () => {
    const repository = createRepository();
    const service = new ConversionService(repository as any);

    await service.evaluateJob(
      job({
        strategyId: 'customer_support',
        kind: ConversionJobKind.INTERACTION,
        payload: {
          actorExternalId: 'actor-1',
          interactionEventId: 'interaction-1',
          kind: ChannelInteractionKind.REPLY,
          direction: ChannelInteractionDirection.OUTBOUND,
        },
      })
    );
    await service.evaluateJob(
      job({
        id: 'inference',
        strategyId: 'customer_support',
        kind: ConversionJobKind.INFERRED_RESOLUTION,
        payload: {
          supportCaseId: 'case-1',
          externalCaseKey: 'actor:actor-1',
          expectedLastInboundAt: '2026-08-20T12:00:00.000Z',
        },
      })
    );

    expect(repository.recordSupportOutbound).toHaveBeenCalledWith(
      'org',
      'integration',
      expect.any(Object),
      expect.objectContaining({
        slaMs: 24 * 60 * 60 * 1000,
        conversionType: 'support_sla_hit',
      })
    );
    expect(
      repository.recordSupportOutbound.mock.calls[0][3]
    ).not.toHaveProperty('inferredResolutionDelayMs');
    expect(repository.resolveSupportCaseWithEvent).not.toHaveBeenCalled();
  });

  it('resolves support cases using their captured strategy and event replay key', async () => {
    const repository = createRepository();
    repository.findSupportCaseByReference.mockResolvedValue({
      id: 'case-1',
      strategyId: 'customer_support',
      strategyVersion: 1,
      openedAt: new Date('2026-08-20T12:00:00.000Z'),
    });
    const service = new ConversionService(repository as any);

    await service.resolveSupportCase({
      organizationId: 'org',
      integrationId: 'integration',
      caseId: 'case-1',
      eventId: 'explicit-1',
      resolvedAt: new Date('2026-08-21T12:00:00.000Z'),
    });

    expect(repository.resolveSupportCaseWithEvent).toHaveBeenCalledWith(
      'org',
      'integration',
      { strategyId: 'customer_support', strategyVersion: 1 },
      expect.objectContaining({
        caseId: 'case-1',
        eventId: 'explicit-1',
        resolutionSource: 'explicit',
      })
    );
  });

  it('rejects explicit support resolutions beyond the allowed future skew', async () => {
    const repository = createRepository();
    repository.findSupportCaseByReference.mockResolvedValue({
      id: 'case-1',
      strategyId: 'customer_support',
      strategyVersion: 1,
      openedAt: new Date('2026-08-20T12:00:00.000Z'),
    });
    const service = new ConversionService(repository as any);

    await expect(
      service.resolveSupportCase({
        organizationId: 'org',
        integrationId: 'integration',
        caseId: 'case-1',
        eventId: 'explicit-future',
        resolvedAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
    ).rejects.toThrow('resolvedAt is too far in the future');
    expect(repository.resolveSupportCaseWithEvent).not.toHaveBeenCalled();
  });

  it('rejects explicit support resolutions before the support case opened', async () => {
    const repository = createRepository();
    repository.findSupportCaseByReference.mockResolvedValue({
      id: 'case-1',
      strategyId: 'customer_support',
      strategyVersion: 1,
      openedAt: new Date('2026-08-20T12:00:00.000Z'),
    });
    const service = new ConversionService(repository as any);

    await expect(
      service.resolveSupportCase({
        organizationId: 'org',
        integrationId: 'integration',
        caseId: 'case-1',
        eventId: 'explicit-before-opening',
        resolvedAt: new Date('2026-08-20T11:59:59.999Z'),
      })
    ).rejects.toThrow('resolvedAt cannot be before the support case opened');
    expect(repository.resolveSupportCaseWithEvent).not.toHaveBeenCalled();
  });
});

import {
  ConversionJobKind,
  ConversionJobStatus,
  ConversionSource,
} from '@prisma/client';
import { ConversionRepository } from './conversion.repository';

const createHarness = () => {
  const tx = {
    integration: {
      findFirst: jest.fn().mockResolvedValue({ id: 'integration' }),
    },
    conversionEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'event' }),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    conversionClickAttribution: {
      create: jest.fn().mockResolvedValue({ id: 'click' }),
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn(),
    },
    conversionEvaluationJob: {
      create: jest.fn().mockResolvedValue({ id: 'job' }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn(),
    },
    conversionDerivationState: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'state' }),
    },
    conversionSupportCase: {
      upsert: jest.fn().mockResolvedValue({ id: 'case' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'case' }),
      create: jest.fn().mockResolvedValue({ id: 'case' }),
      update: jest.fn().mockResolvedValue({ id: 'case' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    conversionWebhookCredential: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
    },
    channelInteractionEvent: { findMany: jest.fn().mockResolvedValue([]) },
    channelAudienceMember: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const transaction = jest.fn((callback: (client: typeof tx) => unknown) =>
    callback(tx)
  );
  const repository = new ConversionRepository(
    {
      model: {
        conversionEvent: tx.conversionEvent,
        conversionClickAttribution: tx.conversionClickAttribution,
        conversionEvaluationJob: tx.conversionEvaluationJob,
        conversionDerivationState: tx.conversionDerivationState,
        conversionSupportCase: tx.conversionSupportCase,
        conversionWebhookCredential: tx.conversionWebhookCredential,
        channelInteractionEvent: tx.channelInteractionEvent,
        integration: tx.integration,
      },
    } as any,
    { model: { integration: tx.integration } } as any,
    { model: { $transaction: transaction } } as any
  );
  return { repository, transaction, tx };
};

describe('ConversionRepository', () => {
  const organizationId = 'organization';
  const integrationId = 'integration';

  it('returns the existing ledger event for duplicate dedupe keys', async () => {
    const { repository, tx } = createHarness();
    tx.conversionEvent.create.mockRejectedValueOnce({ code: 'P2002' });

    const result = await repository.insertEvent(organizationId, integrationId, {
      strategyId: 'lead_capture',
      strategyVersion: 1,
      conversionType: 'website_goal',
      source: ConversionSource.API,
      dedupeKey: 'event:1',
      occurredAt: new Date(),
    });

    expect(result).toEqual({ event: { id: 'event' }, created: false });
    expect(tx.conversionEvent.findFirst).toHaveBeenCalledWith({
      where: { organizationId, integrationId, dedupeKey: 'event:1' },
    });
  });

  it('requires owned integrations before mutations', async () => {
    const { repository, tx } = createHarness();
    tx.integration.findFirst.mockResolvedValueOnce(null);

    await expect(
      repository.enqueueJob(organizationId, integrationId, {
        strategyId: 'brand_awareness',
        strategyVersion: 1,
        kind: ConversionJobKind.INTERACTION,
        dedupeKey: 'interaction:1',
        payload: {},
        eventAt: new Date(),
      })
    ).rejects.toThrow('does not belong');
  });

  it('excludes expired click attributions', async () => {
    const { repository, tx } = createHarness();
    const now = new Date('2026-08-27T12:00:00.000Z');

    await repository.findActiveClickAttribution(
      organizationId,
      integrationId,
      'click',
      now
    );

    expect(tx.conversionClickAttribution.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId,
        integrationId,
        clickId: 'click',
        expiresAt: { gt: now },
      },
    });
  });

  it('uses a descending keyset cursor for ledger reads', async () => {
    const { repository, tx } = createHarness();
    const cursor = {
      occurredAt: new Date('2026-08-27T12:00:00.000Z'),
      id: 'event-2',
    };

    await repository.listEvents(organizationId, integrationId, { cursor });

    expect(tx.conversionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { occurredAt: { lt: cursor.occurredAt } },
            { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
          ],
        }),
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 51,
      })
    );
  });

  it('claims stale processing jobs with a new lease token', async () => {
    const { repository, tx } = createHarness();
    const now = new Date('2026-08-27T12:00:00.000Z');
    tx.conversionEvaluationJob.findFirst
      .mockResolvedValueOnce({ id: 'job' })
      .mockResolvedValueOnce({ id: 'job', claimToken: expect.any(String) });

    await repository.claimDueJob(organizationId, now, 60_000);

    expect(tx.conversionEvaluationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { status: ConversionJobStatus.PENDING, availableAt: { lte: now } },
            {
              status: ConversionJobStatus.PROCESSING,
              claimedAt: { lte: new Date(now.getTime() - 60_000) },
            },
          ],
        }),
        data: expect.objectContaining({
          status: ConversionJobStatus.PROCESSING,
          claimedAt: now,
        }),
      })
    );
  });

  it('claims a bounded cross-organization batch with opaque claim references', async () => {
    const { repository, tx } = createHarness();
    const now = new Date('2026-08-27T12:00:00.000Z');
    tx.conversionEvaluationJob.findFirst
      .mockResolvedValueOnce({ id: 'job-1' })
      .mockResolvedValueOnce({ id: 'job-2' })
      .mockResolvedValueOnce(null);

    const result = await repository.claimDueJobsBatch(10, now, 60_000);

    expect(result).toEqual([
      { jobId: 'job-1', claimToken: expect.any(String) },
      { jobId: 'job-2', claimToken: expect.any(String) },
    ]);
    expect(tx.conversionEvaluationJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          integration: { deletedAt: null },
        }),
      })
    );
    expect(tx.conversionEvaluationJob.updateMany).toHaveBeenCalledTimes(2);
  });

  it('resolves and reclaims claimed work by lease token', async () => {
    const { repository, tx } = createHarness();
    const now = new Date('2026-08-27T12:00:00.000Z');

    await repository.getClaimedJob('job', 'claim');
    await repository.reclaimStaleProcessingJobs(now, 60_000);

    expect(tx.conversionEvaluationJob.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'job',
        claimToken: 'claim',
        status: ConversionJobStatus.PROCESSING,
        integration: { deletedAt: null },
      },
    });
    expect(tx.conversionEvaluationJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: ConversionJobStatus.PROCESSING,
        claimedAt: { lte: new Date(now.getTime() - 60_000) },
      },
      data: {
        status: ConversionJobStatus.PENDING,
        claimedAt: null,
        claimToken: null,
      },
    });
  });

  it('terminally fails jobs at the configured attempt limit', async () => {
    const { repository, tx } = createHarness();
    tx.conversionEvaluationJob.findFirst.mockResolvedValueOnce({
      id: 'job',
      attempts: 7,
    });

    const result = await repository.retryOrFailJob(
      organizationId,
      'job',
      'claim',
      new Error('failure'),
      new Date(),
      8
    );

    expect(result).toEqual({ updated: true, terminal: true });
    expect(tx.conversionEvaluationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ConversionJobStatus.FAILED,
          attempts: 8,
          lastError: 'failure',
        }),
      })
    );
  });

  it('enforces support-case uniqueness through the integration compound key', async () => {
    const { repository, tx } = createHarness();

    await repository.upsertSupportCase(organizationId, integrationId, {
      externalCaseKey: 'thread:1',
      strategyId: 'customer_support',
      strategyVersion: 1,
      openedAt: new Date(),
    });

    expect(tx.conversionSupportCase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId_externalCaseKey: {
            integrationId,
            externalCaseKey: 'thread:1',
          },
        },
      })
    );
  });

  it('uses a serializable transaction for cooldown state updates', async () => {
    const { repository, transaction, tx } = createHarness();

    await repository.updateDerivationState(
      organizationId,
      integrationId,
      {
        strategyId: 'brand_awareness',
        strategyVersion: 1,
        conversionType: 'amplification_threshold',
        subjectKey: 'person',
      },
      () => ({ lastEmittedAt: new Date(), state: { score: 5 } })
    );

    expect(transaction.mock.calls[0][1]).toEqual({
      isolationLevel: 'Serializable',
    });
    expect(tx.conversionDerivationState.upsert).toHaveBeenCalled();
  });

  it('enforces amplification cooldown while allowing the exact boundary', async () => {
    const inside = createHarness();
    const lastEmittedAt = new Date('2026-08-20T12:00:00.000Z');
    inside.tx.conversionDerivationState.findUnique.mockResolvedValue({
      lastEmittedAt,
      lastEventAt: lastEmittedAt,
      state: null,
    });
    const input = {
      stateKey: {
        strategyId: 'brand_awareness',
        strategyVersion: 1,
        conversionType: 'amplification_threshold',
        subjectKey: 'actor',
      },
      actorExternalId: 'actor',
      eventAt: new Date('2026-08-27T11:59:59.999Z'),
      cooldownMs: 7 * 24 * 60 * 60 * 1000,
      state: { score: 5 },
      event: {
        strategyId: 'brand_awareness',
        strategyVersion: 1,
        conversionType: 'amplification_threshold',
        source: ConversionSource.DERIVED,
        dedupeKey: 'amplification:1',
        occurredAt: new Date('2026-08-27T11:59:59.999Z'),
      },
    };

    await expect(
      inside.repository.emitDerivedEventWithCooldown(
        organizationId,
        integrationId,
        input
      )
    ).resolves.toMatchObject({ emitted: false });
    expect(inside.tx.conversionEvent.create).not.toHaveBeenCalled();

    const boundary = createHarness();
    boundary.tx.conversionDerivationState.findUnique.mockResolvedValue({
      lastEmittedAt,
      lastEventAt: lastEmittedAt,
      state: null,
    });
    await expect(
      boundary.repository.emitDerivedEventWithCooldown(
        organizationId,
        integrationId,
        {
          ...input,
          eventAt: new Date('2026-08-27T12:00:00.000Z'),
          event: {
            ...input.event,
            occurredAt: new Date('2026-08-27T12:00:00.000Z'),
          },
        }
      )
    ).resolves.toMatchObject({ emitted: true });
    expect(boundary.tx.conversionEvent.create).toHaveBeenCalledTimes(1);
  });

  it('records first support response at the SLA boundary but not after it', async () => {
    const openedAt = new Date('2026-08-20T12:00:00.000Z');
    const supportCase = {
      id: 'case',
      externalCaseKey: 'conversation:1',
      strategyId: 'customer_support',
      strategyVersion: 1,
      actorExternalId: 'actor',
      openedAt,
      lastInboundAt: openedAt,
      firstOutboundAt: null,
      resolvedAt: null,
    };
    const boundary = createHarness();
    boundary.tx.conversionSupportCase.findFirst.mockResolvedValue(supportCase);

    await boundary.repository.recordSupportOutbound(
      organizationId,
      integrationId,
      { strategyId: 'customer_support', strategyVersion: 1 },
      {
        externalCaseKey: 'conversation:1',
        interactionEventId: 'reply-1',
        actorExternalId: 'actor',
        occurredAt: new Date('2026-08-21T12:00:00.000Z'),
        slaMs: 24 * 60 * 60 * 1000,
        conversionType: 'support_sla_hit',
      }
    );
    expect(boundary.tx.conversionEvent.create).toHaveBeenCalledTimes(1);

    const late = createHarness();
    late.tx.conversionSupportCase.findFirst.mockResolvedValue(supportCase);
    await late.repository.recordSupportOutbound(
      organizationId,
      integrationId,
      { strategyId: 'customer_support', strategyVersion: 1 },
      {
        externalCaseKey: 'conversation:1',
        interactionEventId: 'reply-2',
        actorExternalId: 'actor',
        occurredAt: new Date('2026-08-21T12:00:00.001Z'),
        slaMs: 24 * 60 * 60 * 1000,
        conversionType: 'support_sla_hit',
      }
    );
    expect(late.tx.conversionSupportCase.updateMany).toHaveBeenCalled();
    expect(late.tx.conversionEvent.create).not.toHaveBeenCalled();
  });

  it('reopens only resolved support cases with newer inbound evidence', async () => {
    const { repository, tx } = createHarness();
    tx.conversionSupportCase.findFirst.mockResolvedValue({
      id: 'case',
      strategyId: 'customer_support',
      strategyVersion: 1,
      resolvedAt: new Date('2026-08-20T12:00:00.000Z'),
      lastInboundAt: new Date('2026-08-19T12:00:00.000Z'),
    });

    await repository.recordSupportInbound(
      organizationId,
      integrationId,
      { strategyId: 'customer_support', strategyVersion: 1 },
      {
        externalCaseKey: 'conversation:1',
        actorExternalId: 'actor',
        occurredAt: new Date('2026-08-21T12:00:00.000Z'),
      }
    );

    expect(tx.conversionSupportCase.update).toHaveBeenCalledWith({
      where: { id: 'case' },
      data: expect.objectContaining({
        openedAt: new Date('2026-08-21T12:00:00.000Z'),
        firstOutboundAt: null,
        resolvedAt: null,
      }),
    });
  });

  it('returns the existing explicit resolution event on replay', async () => {
    const { repository, tx } = createHarness();
    tx.conversionEvent.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      repository.resolveSupportCaseWithEvent(
        organizationId,
        integrationId,
        { strategyId: 'customer_support', strategyVersion: 1 },
        {
          caseId: 'case',
          eventId: 'explicit-1',
          resolvedAt: new Date(),
          conversionType: 'support_issue_resolved',
          resolutionSource: 'explicit',
        }
      )
    ).resolves.toEqual({
      event: { id: 'existing' },
      created: false,
    });
    expect(tx.conversionSupportCase.updateMany).not.toHaveBeenCalled();
  });

  it('counts converted actors with stored audience profiles', async () => {
    const { repository, tx } = createHarness();
    tx.conversionEvent.groupBy.mockResolvedValueOnce([
      { actorExternalId: 'actor-1' },
      { actorExternalId: 'actor-2' },
    ]);
    tx.channelAudienceMember.count.mockResolvedValueOnce(1);

    await expect(
      repository.countDistinctConvertedActorsWithProfiles(
        organizationId,
        integrationId
      )
    ).resolves.toBe(1);
    expect(tx.channelAudienceMember.count).toHaveBeenCalledWith({
      where: {
        organizationId,
        integrationId,
        externalId: { in: ['actor-1', 'actor-2'] },
      },
    });
  });

  it('pages converted actors ordered by latest conversion', async () => {
    const { repository, tx } = createHarness();
    const lastConvertedAt = new Date('2026-08-27T12:00:00.000Z');
    tx.conversionEvent.groupBy.mockResolvedValueOnce([
      {
        actorExternalId: 'actor-1',
        _max: { occurredAt: lastConvertedAt },
        _count: { _all: 2 },
      },
    ]);
    tx.channelAudienceMember.findMany.mockResolvedValueOnce([
      { externalId: 'actor-1' },
    ]);
    tx.conversionEvent.findMany.mockResolvedValueOnce([
      {
        actorExternalId: 'actor-1',
        occurredAt: lastConvertedAt,
        conversionType: 'follower_gained',
        id: 'event-1',
      },
    ]);

    await expect(
      repository.getConvertedActorsPage(organizationId, integrationId, {
        limit: 24,
      })
    ).resolves.toEqual({
      items: [
        {
          externalId: 'actor-1',
          lastConvertedAt,
          conversionCount: 2,
          latestConversionType: 'follower_gained',
        },
      ],
      hasMore: false,
    });
  });
});

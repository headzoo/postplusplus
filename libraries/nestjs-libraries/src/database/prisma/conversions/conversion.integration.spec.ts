import {
  ChannelInteractionDirection,
  ChannelInteractionKind,
  ConversionAttributionMethod,
  ConversionJobKind,
  ConversionSource,
} from '@prisma/client';
import { ConversionService } from './conversion.service';

type StoredEvent = {
  id: string;
  organizationId: string;
  integrationId: string;
  strategyId: string;
  strategyVersion: number;
  conversionType: string;
  source: ConversionSource;
  dedupeKey: string;
  sourceEventId?: string | null;
  actorExternalId?: string | null;
  clickAttributionId?: string | null;
  occurredAt: Date;
  ingestedAt: Date;
  attributionMethod?: ConversionAttributionMethod | null;
  attributionWindowStart?: Date | null;
  attributionWindowEnd?: Date | null;
  dimensions?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

type StoredAttribution = {
  id: string;
  organizationId: string;
  integrationId: string;
  clickId: string;
  strategyId: string;
  strategyVersion: number;
  utmFingerprint?: string | null;
  utmSnapshot?: string | null;
  expiresAt: Date;
  createdAt: Date;
};

type StoredSupportCase = {
  id: string;
  organizationId: string;
  integrationId: string;
  externalCaseKey: string;
  strategyId: string;
  strategyVersion: number;
  actorExternalId: string;
  openedAt: Date;
  lastInboundAt: Date | null;
  firstOutboundAt: Date | null;
  resolvedAt: Date | null;
};

const createInMemoryHarness = () => {
  let nextId = 1;
  const id = () => `conv-${nextId++}`;
  const events = new Map<string, StoredEvent>();
  const eventsByDedupe = new Map<string, StoredEvent>();
  const attributions = new Map<string, StoredAttribution>();
  const supportCases = new Map<string, StoredSupportCase>();
  const derivationState = new Map<string, Record<string, unknown>>();
  const interactionWindow: Array<{
    kind: ChannelInteractionKind;
    direction: ChannelInteractionDirection;
    eventAt: Date;
  }> = [];
  const integrations = new Map<
    string,
    {
      id: string;
      organizationId: string;
      strategyId: string;
      strategyVersion: number;
    }
  >();
  const channelAnalyticsDailyPoint = jest.fn();

  const dedupeKey = (
    organizationId: string,
    integrationId: string,
    key: string
  ) => `${organizationId}:${integrationId}:${key}`;

  const repository = {
    upsertClickAttribution: jest.fn(
      async (
        organizationId: string,
        integrationId: string,
        input: {
          clickId: string;
          strategyId: string;
          strategyVersion: number;
          utmFingerprint?: string;
          utmSnapshot?: string;
          expiresAt: Date;
        }
      ) => {
        const row: StoredAttribution = {
          id: id(),
          organizationId,
          integrationId,
          clickId: input.clickId,
          strategyId: input.strategyId,
          strategyVersion: input.strategyVersion,
          utmFingerprint: input.utmFingerprint ?? null,
          utmSnapshot: input.utmSnapshot ?? null,
          expiresAt: input.expiresAt,
          createdAt: new Date(),
        };
        attributions.set(input.clickId, row);
        return { attribution: row, created: true };
      }
    ),
    findActiveClickAttributionByClickId: jest.fn(
      async (organizationId: string, clickId: string, now = new Date()) => {
        const row = attributions.get(clickId);
        if (!row || row.organizationId !== organizationId) return null;
        if (row.expiresAt <= now) return null;
        return row;
      }
    ),
    findActiveClickAttributionByUtmFingerprint: jest.fn(
      async (
        organizationId: string,
        integrationId: string,
        utmFingerprint: string,
        now = new Date()
      ) => {
        for (const row of attributions.values()) {
          if (
            row.organizationId === organizationId &&
            row.integrationId === integrationId &&
            row.utmFingerprint === utmFingerprint &&
            row.expiresAt > now
          ) {
            return row;
          }
        }
        return null;
      }
    ),
    findOwnedIntegration: jest.fn(
      async (organizationId: string, integrationId: string) =>
        integrations.get(`${organizationId}:${integrationId}`) ?? null
    ),
    insertEvent: jest.fn(
      async (
        organizationId: string,
        integrationId: string,
        input: Omit<StoredEvent, 'id' | 'organizationId' | 'integrationId'>
      ) => {
        const key = dedupeKey(organizationId, integrationId, input.dedupeKey);
        const existing = eventsByDedupe.get(key);
        if (existing) {
          return { event: existing, created: false };
        }
        const event: StoredEvent = {
          id: id(),
          organizationId,
          integrationId,
          ingestedAt: new Date(),
          ...input,
        };
        events.set(event.id, event);
        eventsByDedupe.set(key, event);
        return { event, created: true };
      }
    ),
    completeJob: jest.fn().mockResolvedValue({ count: 1 }),
    retryOrFailJob: jest.fn().mockResolvedValue({
      updated: true,
      terminal: true,
    }),
    getInteractionWindow: jest.fn(
      async (
        _organizationId: string,
        _integrationId: string,
        _actorExternalId: string,
        windowStart: Date,
        windowEnd: Date
      ) =>
        interactionWindow.filter(
          (row) => row.eventAt >= windowStart && row.eventAt <= windowEnd
        )
    ),
    updateDerivationState: jest.fn(
      async (
        _organizationId: string,
        _integrationId: string,
        key: { subjectKey: string },
        update: (
          current: Record<string, unknown> | null
        ) => Record<string, unknown>
      ) => {
        const stateKey = key.subjectKey;
        const current = derivationState.get(stateKey) ?? null;
        derivationState.set(stateKey, update(current));
        return {};
      }
    ),
    emitDerivedEventWithCooldown: jest.fn(
      async (
        organizationId: string,
        integrationId: string,
        input: {
          cooldownMs: number;
          stateKey: { subjectKey: string };
          actorExternalId: string;
          eventAt: Date;
          state: Record<string, unknown>;
          event: Omit<StoredEvent, 'id' | 'organizationId' | 'integrationId'>;
        }
      ) => {
        const stateKey = input.stateKey.subjectKey;
        const current = derivationState.get(stateKey) as
          | { lastEmittedAt?: Date }
          | undefined;
        if (
          current?.lastEmittedAt &&
          input.eventAt.getTime() <
            current.lastEmittedAt.getTime() + input.cooldownMs
        ) {
          derivationState.set(stateKey, {
            ...current,
            state: input.state,
          });
          return { emitted: false, event: null };
        }
        const inserted = await repository.insertEvent(
          organizationId,
          integrationId,
          input.event
        );
        derivationState.set(stateKey, {
          lastEmittedAt: input.eventAt,
          state: input.state,
        });
        return { emitted: true, event: inserted.event };
      }
    ),
    recordSupportInbound: jest.fn(
      async (
        organizationId: string,
        integrationId: string,
        snapshot: { strategyId: string; strategyVersion: number },
        input: {
          externalCaseKey: string;
          actorExternalId: string;
          occurredAt: Date;
        }
      ) => {
        const key = `${organizationId}:${integrationId}:${input.externalCaseKey}`;
        const existing = supportCases.get(key);
        if (!existing) {
          const supportCase: StoredSupportCase = {
            id: id(),
            organizationId,
            integrationId,
            externalCaseKey: input.externalCaseKey,
            strategyId: snapshot.strategyId,
            strategyVersion: snapshot.strategyVersion,
            actorExternalId: input.actorExternalId,
            openedAt: input.occurredAt,
            lastInboundAt: input.occurredAt,
            firstOutboundAt: null,
            resolvedAt: null,
          };
          supportCases.set(key, supportCase);
          return { supportCase, changed: true };
        }
        return { supportCase: existing, changed: false };
      }
    ),
    recordSupportOutbound: jest.fn(
      async (
        organizationId: string,
        integrationId: string,
        snapshot: { strategyId: string; strategyVersion: number },
        input: {
          externalCaseKey: string;
          interactionEventId: string;
          actorExternalId: string;
          occurredAt: Date;
          slaMs: number;
          conversionType: string;
        }
      ) => {
        const key = `${organizationId}:${integrationId}:${input.externalCaseKey}`;
        const supportCase = supportCases.get(key);
        if (
          !supportCase ||
          supportCase.strategyId !== snapshot.strategyId ||
          supportCase.strategyVersion !== snapshot.strategyVersion ||
          supportCase.firstOutboundAt
        ) {
          return { supportCase: supportCase ?? null, event: null };
        }
        supportCase.firstOutboundAt = input.occurredAt;
        const responseDurationMs =
          input.occurredAt.getTime() - supportCase.openedAt.getTime();
        if (responseDurationMs > input.slaMs) {
          return { supportCase, event: null };
        }
        const inserted = await repository.insertEvent(
          organizationId,
          integrationId,
          {
            strategyId: snapshot.strategyId,
            strategyVersion: snapshot.strategyVersion,
            conversionType: input.conversionType,
            source: ConversionSource.DERIVED,
            sourceEventId: input.interactionEventId,
            dedupeKey: `support-sla:${supportCase.id}`,
            actorExternalId: input.actorExternalId,
            occurredAt: input.occurredAt,
            dimensions: {
              externalCaseKey: input.externalCaseKey,
              responseDurationMs,
            },
          }
        );
        return { supportCase, event: inserted.event };
      }
    ),
    findSupportCaseByReference: jest.fn(
      async (
        organizationId: string,
        integrationId: string,
        reference: { caseId?: string; externalCaseKey?: string }
      ) => {
        for (const supportCase of supportCases.values()) {
          if (
            supportCase.organizationId !== organizationId ||
            supportCase.integrationId !== integrationId
          ) {
            continue;
          }
          if (reference.caseId && supportCase.id === reference.caseId) {
            return {
              id: supportCase.id,
              strategyId: supportCase.strategyId,
              strategyVersion: supportCase.strategyVersion,
              openedAt: supportCase.openedAt,
            };
          }
          if (
            reference.externalCaseKey &&
            supportCase.externalCaseKey === reference.externalCaseKey
          ) {
            return {
              id: supportCase.id,
              strategyId: supportCase.strategyId,
              strategyVersion: supportCase.strategyVersion,
              openedAt: supportCase.openedAt,
            };
          }
        }
        return null;
      }
    ),
    resolveSupportCaseWithEvent: jest.fn(
      async (
        organizationId: string,
        integrationId: string,
        snapshot: { strategyId: string; strategyVersion: number },
        input: {
          caseId?: string;
          externalCaseKey?: string;
          eventId: string;
          resolvedAt: Date;
          conversionType: string;
          resolutionSource: string;
        }
      ) => {
        const reference = input.caseId
          ? { caseId: input.caseId }
          : { externalCaseKey: input.externalCaseKey! };
        const supportCase = await repository.findSupportCaseByReference(
          organizationId,
          integrationId,
          reference
        );
        if (!supportCase) {
          return { event: null, created: false };
        }
        for (const row of supportCases.values()) {
          if (row.id === supportCase.id) {
            row.resolvedAt = input.resolvedAt;
            break;
          }
        }
        const inserted = await repository.insertEvent(
          organizationId,
          integrationId,
          {
            strategyId: snapshot.strategyId,
            strategyVersion: snapshot.strategyVersion,
            conversionType: input.conversionType,
            source: ConversionSource.API,
            sourceEventId: input.eventId,
            dedupeKey: `${input.resolutionSource}:support:${input.eventId}`,
            occurredAt: input.resolvedAt,
            dimensions: { resolutionSource: input.resolutionSource },
          }
        );
        return inserted;
      }
    ),
    listEvents: jest.fn(
      async (organizationId: string, integrationId: string) => ({
        events: [...events.values()].filter(
          (event) =>
            event.organizationId === organizationId &&
            event.integrationId === integrationId
        ),
        next: undefined,
      })
    ),
    summarizeEvents: jest.fn(
      async (organizationId: string, integrationId: string) => {
        const summary: Record<string, { count: number; value: number }> = {};
        for (const event of events.values()) {
          if (
            event.organizationId !== organizationId ||
            event.integrationId !== integrationId
          ) {
            continue;
          }
          const day = event.occurredAt.toISOString().slice(0, 10);
          const key = `${day}:${event.conversionType}`;
          summary[key] = summary[key] ?? { count: 0, value: 0 };
          summary[key].count += 1;
        }
        return summary;
      }
    ),
    rotateWebhookCredential: jest.fn().mockResolvedValue(undefined),
    getWebhookCredentialStatus: jest.fn().mockResolvedValue(null),
    findWebhookCredentialByTokenHash: jest.fn().mockResolvedValue(null),
    findIntegrationForWebhook: jest.fn(
      async (integrationId: string) =>
        [...integrations.values()].find((row) => row.id === integrationId) ??
        null
    ),
  };

  const service = new ConversionService(repository as any);
  const registerIntegration = (
    organizationId: string,
    integrationId: string,
    strategyId: string,
    strategyVersion = 1
  ) => {
    integrations.set(`${organizationId}:${integrationId}`, {
      id: integrationId,
      organizationId,
      strategyId,
      strategyVersion,
    });
  };

  const job = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'job-1',
      organizationId: 'org-a',
      integrationId: 'integration-a',
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

  return {
    service,
    repository,
    registerIntegration,
    job,
    events,
    attributions,
    supportCases,
    interactionWindow,
    channelAnalyticsDailyPoint,
  };
};

describe('Conversion integration contracts', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'conversion-integration-secret';
  });

  it('covers grow_audience follower transitions through service evaluation', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'grow_audience');

    await harness.service.evaluateJob(harness.job());

    expect([...harness.events.values()]).toEqual([
      expect.objectContaining({
        strategyId: 'grow_audience',
        conversionType: 'follower_gained',
        source: ConversionSource.DERIVED,
      }),
    ]);
    expect(harness.channelAnalyticsDailyPoint).not.toHaveBeenCalled();
  });

  it('covers community_retention follower transitions with the same profile semantics', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration(
      'org-a',
      'integration-a',
      'community_retention'
    );

    await harness.service.evaluateJob(
      harness.job({ strategyId: 'community_retention' })
    );

    expect([...harness.events.values()]).toEqual([
      expect.objectContaining({
        strategyId: 'community_retention',
        conversionType: 'follower_gained',
      }),
    ]);
  });

  it('covers lead_capture link preparation and API goal ingestion', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'lead_capture');

    const [prepared] = await harness.service.prepareLeadCaptureLinks({
      organizationId: 'org-a',
      integrationId: 'integration-a',
      strategyId: 'lead_capture',
      strategyVersion: 1,
      utmParams: 'utm_campaign=spring',
      values: [
        {
          id: 'post-item-1',
          content: 'https://example.com/signup?utm_source=post',
        },
      ],
    });
    const clickId = new URL(
      prepared.match(/https:\/\/[^\s]+/)![0]
    ).searchParams.get('pp_click_id');
    expect(clickId).toBeTruthy();

    const apiResult = await harness.service.ingestGoal({
      organizationId: 'org-a',
      source: ConversionSource.API,
      integrationId: 'integration-a',
      eventId: 'goal-api-1',
      goal: 'signup',
      ppClickId: clickId!,
    });

    expect(apiResult.created).toBe(true);
    expect(apiResult.conversion).toEqual(
      expect.objectContaining({
        strategyId: 'lead_capture',
        strategyVersion: 1,
        conversionType: 'website_goal',
        attributionMethod: ConversionAttributionMethod.CLICK_ID,
      })
    );
  });

  it('covers lead_capture webhook goal ingestion through the shared service path', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'lead_capture');

    await harness.service.prepareLeadCaptureLinks({
      organizationId: 'org-a',
      integrationId: 'integration-a',
      strategyId: 'lead_capture',
      strategyVersion: 1,
      utmParams: 'utm_campaign=webhook',
      values: [
        {
          id: 'post-item-2',
          content: 'https://example.com/signup?utm_source=webhook',
        },
      ],
    });
    const attribution = [...harness.attributions.values()][0];

    const webhookResult = await harness.service.ingestGoal({
      organizationId: 'org-a',
      source: ConversionSource.WEBHOOK,
      integrationId: 'integration-a',
      eventId: 'goal-webhook-1',
      goal: 'trial_started',
      ppClickId: attribution.clickId,
    });

    expect(webhookResult.created).toBe(true);
    expect(webhookResult.conversion?.source).toBe(ConversionSource.WEBHOOK);
  });

  it('matches canonical standard UTM values only and rejects exact mismatches', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'lead_capture');

    await harness.service.prepareLeadCaptureLinks({
      organizationId: 'org-a',
      integrationId: 'integration-a',
      strategyId: 'lead_capture',
      strategyVersion: 1,
      utmParams: 'utm_content=hero&campaign_variant=blue&utm_source=newsletter',
      values: [
        {
          id: 'post-item-utm',
          content: 'https://example.com/signup',
        },
      ],
    });

    const attribution = [...harness.attributions.values()][0];
    expect(attribution.utmSnapshot).toBe(
      'utm_source=newsletter&utm_content=hero'
    );

    const result = await harness.service.ingestGoal({
      organizationId: 'org-a',
      source: ConversionSource.API,
      integrationId: 'integration-a',
      eventId: 'goal-utm-canonical',
      goal: 'signup',
      utm: {
        utm_content: 'hero',
        utm_source: 'newsletter',
      },
    });
    expect(result.conversion?.attributionMethod).toBe(
      ConversionAttributionMethod.UTM
    );

    await expect(
      harness.service.ingestGoal({
        organizationId: 'org-a',
        source: ConversionSource.API,
        integrationId: 'integration-a',
        eventId: 'goal-utm-mismatch',
        goal: 'signup',
        utm: {
          utm_source: 'newsletter',
          utm_content: 'footer',
        },
      })
    ).rejects.toThrow('UTM attribution is invalid or expired');
  });

  it('rejects blank click IDs without falling back to valid UTM attribution', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'lead_capture');

    await harness.service.prepareLeadCaptureLinks({
      organizationId: 'org-a',
      integrationId: 'integration-a',
      strategyId: 'lead_capture',
      strategyVersion: 1,
      utmParams: 'utm_campaign=blank-click-id',
      values: [
        {
          id: 'post-item-3',
          content: 'https://example.com/signup?utm_source=webhook',
        },
      ],
    });

    await expect(
      harness.service.ingestGoal({
        organizationId: 'org-a',
        source: ConversionSource.WEBHOOK,
        integrationId: 'integration-a',
        eventId: 'goal-blank-click-id',
        goal: 'trial_started',
        ppClickId: '   ',
        utm: { utm_campaign: 'blank-click-id' },
      })
    ).rejects.toThrow('ppClickId must be between 1 and 512 characters');
    expect(
      harness.repository.findActiveClickAttributionByUtmFingerprint
    ).not.toHaveBeenCalled();
  });

  it('covers brand_awareness amplification threshold and cooldown behavior', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'brand_awareness');
    harness.interactionWindow.push(
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
      }
    );

    await harness.service.evaluateJob(
      harness.job({
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

    expect([...harness.events.values()]).toEqual([
      expect.objectContaining({
        strategyId: 'brand_awareness',
        conversionType: 'amplification_threshold',
      }),
    ]);

    await harness.service.evaluateJob(
      harness.job({
        id: 'job-cooldown',
        strategyId: 'brand_awareness',
        kind: ConversionJobKind.INTERACTION,
        payload: {
          actorExternalId: 'actor-1',
          interactionEventId: 'interaction-2',
          kind: ChannelInteractionKind.REPOST,
          direction: ChannelInteractionDirection.INBOUND,
        },
      })
    );

    expect([...harness.events.values()]).toHaveLength(1);
  });

  it('covers customer_support SLA and explicit resolution', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'customer_support');
    const inboundAt = new Date('2026-08-20T12:00:00.000Z');
    const outboundAt = new Date('2026-08-20T18:00:00.000Z');

    await harness.service.evaluateJob(
      harness.job({
        strategyId: 'customer_support',
        kind: ConversionJobKind.INTERACTION,
        payload: {
          actorExternalId: 'actor-1',
          interactionEventId: 'interaction-in',
          kind: ChannelInteractionKind.REPLY,
          direction: ChannelInteractionDirection.INBOUND,
          conversationExternalId: 'thread-1',
        },
      })
    );
    await harness.service.evaluateJob(
      harness.job({
        id: 'job-outbound',
        strategyId: 'customer_support',
        kind: ConversionJobKind.INTERACTION,
        eventAt: outboundAt,
        payload: {
          actorExternalId: 'actor-1',
          interactionEventId: 'interaction-out',
          kind: ChannelInteractionKind.REPLY,
          direction: ChannelInteractionDirection.OUTBOUND,
          conversationExternalId: 'thread-1',
        },
      })
    );

    expect([...harness.events.values()]).toEqual([
      expect.objectContaining({
        conversionType: 'support_sla_hit',
        strategyId: 'customer_support',
      }),
    ]);

    const resolution = await harness.service.resolveSupportCase({
      organizationId: 'org-a',
      integrationId: 'integration-a',
      externalCaseKey: 'conversation:thread-1',
      eventId: 'resolve-1',
      resolvedAt: new Date('2026-08-21T12:00:00.000Z'),
    });

    expect(resolution.created).toBe(true);
    expect([...harness.events.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conversionType: 'support_issue_resolved' }),
      ])
    );
  });

  it('no-ops nonmatching follower transitions and non-follower strategies', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'grow_audience');

    await harness.service.evaluateJob(
      harness.job({
        payload: {
          actorExternalId: 'actor-1',
          fromState: 'UNKNOWN',
          toState: 'FOLLOWER',
          evidenceKey: 'follow-2',
        },
      })
    );
    await harness.service.evaluateJob(
      harness.job({
        strategyId: 'lead_capture',
        kind: ConversionJobKind.INTERACTION,
        payload: {
          actorExternalId: 'actor-1',
          interactionEventId: 'interaction-1',
          kind: ChannelInteractionKind.MENTION,
          direction: ChannelInteractionDirection.INBOUND,
        },
      })
    );

    expect(harness.events.size).toBe(0);
  });

  it('preserves captured strategy snapshots when integration strategy changes', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'lead_capture', 2);
    harness.attributions.set('legacy-click', {
      id: 'attr-1',
      organizationId: 'org-a',
      integrationId: 'integration-a',
      clickId: 'legacy-click',
      strategyId: 'lead_capture',
      strategyVersion: 1,
      expiresAt: new Date('2999-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const result = await harness.service.ingestGoal({
      organizationId: 'org-a',
      source: ConversionSource.API,
      integrationId: 'integration-a',
      eventId: 'goal-snapshot-1',
      goal: 'signup',
      ppClickId: 'legacy-click',
    });

    expect(result.conversion).toEqual(
      expect.objectContaining({
        strategyId: 'lead_capture',
        strategyVersion: 1,
      })
    );
  });

  it('replays provider and API goals idempotently', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'lead_capture');
    harness.attributions.set('click-idempotent', {
      id: 'attr-2',
      organizationId: 'org-a',
      integrationId: 'integration-a',
      clickId: 'click-idempotent',
      strategyId: 'lead_capture',
      strategyVersion: 1,
      expiresAt: new Date('2999-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const first = await harness.service.ingestGoal({
      organizationId: 'org-a',
      source: ConversionSource.API,
      integrationId: 'integration-a',
      eventId: 'goal-replay-1',
      goal: 'signup',
      ppClickId: 'click-idempotent',
    });
    const second = await harness.service.ingestGoal({
      organizationId: 'org-a',
      source: ConversionSource.API,
      integrationId: 'integration-a',
      eventId: 'goal-replay-1',
      goal: 'signup',
      ppClickId: 'click-idempotent',
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(harness.events.size).toBe(1);
  });

  it('rejects cross-organization attribution and expired click IDs', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'lead_capture');
    harness.attributions.set('org-a-click', {
      id: 'attr-3',
      organizationId: 'org-a',
      integrationId: 'integration-a',
      clickId: 'org-a-click',
      strategyId: 'lead_capture',
      strategyVersion: 1,
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    await expect(
      harness.service.ingestGoal({
        organizationId: 'org-b',
        source: ConversionSource.API,
        integrationId: 'integration-a',
        eventId: 'goal-org-b',
        goal: 'signup',
        ppClickId: 'org-a-click',
      })
    ).rejects.toThrow('invalid or expired');

    await expect(
      harness.service.ingestGoal({
        organizationId: 'org-a',
        source: ConversionSource.API,
        integrationId: 'integration-a',
        eventId: 'goal-expired',
        goal: 'signup',
        ppClickId: 'org-a-click',
      })
    ).rejects.toThrow('invalid or expired');
  });

  it('never writes channel analytics daily points from conversion paths', async () => {
    const harness = createInMemoryHarness();
    harness.registerIntegration('org-a', 'integration-a', 'grow_audience');
    harness.registerIntegration('org-b', 'integration-b', 'lead_capture');

    await harness.service.evaluateJob(harness.job());
    await harness.service.prepareLeadCaptureLinks({
      organizationId: 'org-b',
      integrationId: 'integration-b',
      strategyId: 'lead_capture',
      strategyVersion: 1,
      values: [{ id: 'post-item-1', content: 'https://example.com/signup' }],
    });

    expect(harness.channelAnalyticsDailyPoint).not.toHaveBeenCalled();
  });
});

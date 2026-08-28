import {
  ChannelAudienceMembership,
  ChannelFollowerSyncStatus,
  ChannelInteractionDirection,
  ChannelInteractionKind,
  ChannelInteractionWindow,
} from '@prisma/client';
import {
  ChannelInteractionRepository,
  utcHourKey,
} from './channel-interaction.repository';
import { RELATIONSHIP_FORMULA_VERSION } from './channel-interaction.scoring';
import { LEAD_FIT_MIN_SCORE } from '@gitroom/nestjs-libraries/temporal/lead-bridge.schedule';

const leadFitVisibility = {
  OR: [{ leadFitScore: null }, { leadFitScore: { gte: LEAD_FIT_MIN_SCORE } }],
};

const excludeActiveListMembership = {
  listMemberships: {
    none: { list: { deletedAt: null } },
  },
};

const event = (overrides: Record<string, any> = {}) => ({
  providerEventKey: 'event-1',
  kind: ChannelInteractionKind.LIKE,
  direction: ChannelInteractionDirection.INBOUND,
  eventAt: new Date('2026-08-12T23:30:00.000Z'),
  counterparty: { externalId: 'person-1', name: 'Person' },
  normalizationVersion: 1,
  score: 2,
  ...overrides,
});

const interactionCounts = (
  overrides: Record<string, { inbound?: number; outbound?: number }> = {}
) => ({
  like: { inbound: 0, outbound: 0 },
  mention: { inbound: 0, outbound: 0 },
  repost: { inbound: 0, outbound: 0 },
  reply: { inbound: 0, outbound: 0 },
  follow: { inbound: 0, outbound: 0 },
  ...Object.fromEntries(
    Object.entries(overrides).map(([kind, value]) => [
      kind,
      { inbound: 0, outbound: 0, ...value },
    ])
  ),
});

const growSelection = {
  strategyId: 'grow_audience' as const,
  strategyVersion: 1,
};

const growIntegrationFilter = {
  is: {
    strategyId: {
      notIn: [
        'lead_capture',
        'community_retention',
        'brand_awareness',
        'customer_support',
      ],
    },
  },
};

const snapshotInput = (overrides: Record<string, any> = {}) => ({
  externalId: 'person-1',
  effortScore: 12,
  reciprocationScore: 8,
  reciprocity: 2 / 3,
  grade: 2,
  formulaVersion: 2,
  triage: 'over_invested' as const,
  ...growSelection,
  ...overrides,
});

const createHarness = () => {
  const tx = {
    integration: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'integration',
        strategyId: 'grow_audience',
        strategyVersion: 1,
      }),
    },
    channelAudienceMember: {
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    channelInteractionEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'interaction-1' }),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    conversionEvaluationJob: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    channelInteractionDailyAggregate: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    channelFollowerSyncState: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    channelInteractionWindowSummary: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn(),
    },
    channelInteractionRollupState: {
      upsert: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
    },
    channelInteractionSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn().mockResolvedValue({}),
    },
    channelRelationshipGradeSnapshot: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    channelAudienceNote: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    channelAudienceList: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    channelAudienceListMember: {
      upsert: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    channelAudienceMemberTriageIgnore: {
      upsert: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    channelAudienceLeadFitFeedback: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    channelAudienceLeadBridge: {
      upsert: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      aggregate: jest.fn().mockResolvedValue({
        _max: { bridgeRelationshipGrade: null },
      }),
    },
    channelAudienceCultivatePickBatch: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    channelAudienceCultivatePick: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    channelAudienceHotPickBatch: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    channelAudienceHotPick: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    channelAudienceMemberGrade: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    userOrganization: {
      findFirst: jest.fn().mockResolvedValue({ id: 'member' }),
    },
  };
  const transaction = jest.fn((callback: (client: any) => unknown) =>
    callback(tx)
  );
  const integrationFindMany = jest.fn();
  const repository = new ChannelInteractionRepository(
    {
      model: {
        channelInteractionDailyAggregate: {
          groupBy: tx.channelInteractionDailyAggregate.groupBy,
        },
        channelInteractionEvent: {},
        channelInteractionRollupState: {},
        channelFollowerSyncState: {},
        channelInteractionWindowSummary: {},
        channelAudienceMember: {
          findFirst: tx.channelAudienceMember.findFirst,
          findMany: tx.channelAudienceMember.findMany,
        },
        channelAudienceNote: tx.channelAudienceNote,
        channelAudienceList: tx.channelAudienceList,
        channelAudienceListMember: tx.channelAudienceListMember,
        channelAudienceHotPickBatch: tx.channelAudienceHotPickBatch,
        channelAudienceHotPick: tx.channelAudienceHotPick,
        channelAudienceCultivatePickBatch: tx.channelAudienceCultivatePickBatch,
        channelAudienceCultivatePick: tx.channelAudienceCultivatePick,
        channelRelationshipGradeSnapshot: tx.channelRelationshipGradeSnapshot,
      },
    } as any,
    { model: { integration: { findMany: integrationFindMany } } } as any,
    {
      model: { channelInteractionSubscription: { updateMany: jest.fn() } },
    } as any,
    { model: { $transaction: transaction } } as any
  );
  return {
    repository,
    tx,
    groupBy: tx.channelInteractionEvent.groupBy,
    dailyAggregateGroupBy: tx.channelInteractionDailyAggregate.groupBy,
    transaction,
    findFirst: tx.channelInteractionRollupState.findFirst,
    followerSyncFindFirst: tx.channelFollowerSyncState.findFirst,
    findMany: tx.channelInteractionWindowSummary.findMany,
    integrationFindMany,
    audienceMemberFindMany: tx.channelAudienceMember.findMany,
  };
};

describe('ChannelInteractionRepository', () => {
  it('builds UTC hour keys and rejects invalid dates', () => {
    expect(utcHourKey(new Date('2026-08-25T13:59:59.999Z'))).toBe(
      '2026-08-25T13'
    );
    expect(utcHourKey(new Date('2026-08-25T13:00:00.000-04:00'))).toBe(
      '2026-08-25T17'
    );
    expect(() => utcHourKey(new Date('invalid'))).toThrow(
      'utcHourKey requires a valid Date'
    );
  });

  it('bounds and deduplicates Hot refresh IDs from projections and inbound events', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findMany
      .mockResolvedValueOnce([
        { externalId: 'net-gap' },
        { externalId: 'shared' },
        { externalId: 'stored-tail' },
      ])
      .mockResolvedValueOnce([
        { externalId: 'shared' },
        { externalId: 'recent' },
        { externalId: 'recent-tail' },
      ]);
    tx.channelInteractionEvent.findMany.mockResolvedValue([
      { counterpartyExternalId: 'shared' },
      { counterpartyExternalId: 'recent' },
      { counterpartyExternalId: 'recent-tail' },
    ]);

    await expect(
      repository.listHotRefreshExternalIds({
        organizationId: 'org',
        integrationId: 'integration',
        poolSize: 3,
        recentEventSince: new Date('2026-08-25T12:00:00.000Z'),
      })
    ).resolves.toEqual(['shared', 'net-gap', 'recent']);
    expect(tx.channelInteractionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        distinct: ['counterpartyExternalId'],
        take: 3,
        where: expect.objectContaining({
          direction: ChannelInteractionDirection.INBOUND,
        }),
      })
    );
    expect(tx.channelAudienceMember.findMany).toHaveBeenLastCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        membershipState: ChannelAudienceMembership.FOLLOWER,
        externalId: { in: ['shared', 'recent', 'recent-tail'] },
      },
      select: { externalId: true },
    });
  });

  it('completes an authoritative empty Hot batch without pick writes', async () => {
    const { repository, tx } = createHarness();
    await expect(
      repository.replaceHotPickBatch({
        organizationId: 'org',
        integrationId: 'integration',
        hour: '2026-08-25T13',
        strategyId: 'grow_audience',
        strategyVersion: 1,
        materializationVersion: 1,
        candidateCount: 0,
        picks: [],
      })
    ).resolves.toEqual({ count: 0 });
    expect(tx.channelAudienceHotPick.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        hour: '2026-08-25T13',
      },
    });
    expect(tx.channelAudienceHotPickBatch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ pickCount: 0 }),
      })
    );
    expect(tx.channelAudienceHotPick.createMany).not.toHaveBeenCalled();
  });

  it('serves a completed empty current Hot batch without live fallback', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceHotPickBatch.findUnique.mockResolvedValueOnce({
      hour: '2026-08-25T13',
      strategyId: 'grow_audience',
      strategyVersion: 1,
      materializationVersion: 1,
      pickCount: 0,
    });

    await expect(
      repository.getAudienceHot({
        organizationId: 'org',
        integrationId: 'integration',
        strategyId: 'grow_audience',
        strategyVersion: 1,
        materializationVersion: 1,
        direction: 'asc',
        limit: 20,
        now: new Date('2026-08-25T13:30:00.000Z'),
      })
    ).resolves.toEqual({
      items: [],
      hasMore: false,
      source: 'materialized',
      hour: '2026-08-25T13',
    });
    expect(tx.channelAudienceHotPick.findMany).toHaveBeenCalledTimes(1);
    expect(tx.channelAudienceMember.findMany).not.toHaveBeenCalled();
  });

  it('returns empty materialized result for stale explicit hot hour without loading batch', async () => {
    const { repository, tx } = createHarness();
    const now = new Date('2026-08-25T13:30:00.000Z');

    await expect(
      repository.getAudienceHot({
        organizationId: 'org',
        integrationId: 'integration',
        strategyId: 'grow_audience',
        strategyVersion: 1,
        materializationVersion: 1,
        direction: 'asc',
        limit: 20,
        hour: '2026-08-25T11',
        cursor: { finalRank: 1, externalId: 'hot-1' },
        now,
      })
    ).resolves.toEqual({
      items: [],
      hasMore: false,
      source: 'materialized',
      hour: null,
    });
    expect(tx.channelAudienceHotPickBatch.findUnique).not.toHaveBeenCalled();
    expect(tx.channelAudienceHotPick.findMany).not.toHaveBeenCalled();
  });

  it('returns empty materialized result for future explicit hot hour without loading batch', async () => {
    const { repository, tx } = createHarness();
    const now = new Date('2026-08-25T13:30:00.000Z');

    await expect(
      repository.getAudienceHot({
        organizationId: 'org',
        integrationId: 'integration',
        strategyId: 'grow_audience',
        strategyVersion: 1,
        materializationVersion: 1,
        direction: 'asc',
        limit: 20,
        hour: '2099-01-01T00',
        cursor: { finalRank: 1, externalId: 'hot-1' },
        now,
      })
    ).resolves.toEqual({
      items: [],
      hasMore: false,
      source: 'materialized',
      hour: null,
    });
    expect(tx.channelAudienceHotPickBatch.findUnique).not.toHaveBeenCalled();
    expect(tx.channelAudienceHotPick.findMany).not.toHaveBeenCalled();
  });

  it('loads explicit hot hour when it matches the immediately previous UTC hour', async () => {
    const { repository, tx } = createHarness();
    const now = new Date('2026-08-25T13:30:00.000Z');
    tx.channelAudienceHotPickBatch.findUnique.mockResolvedValueOnce({
      hour: '2026-08-25T12',
      strategyId: 'grow_audience',
      strategyVersion: 1,
      materializationVersion: 1,
      pickCount: 0,
    });

    await expect(
      repository.getAudienceHot({
        organizationId: 'org',
        integrationId: 'integration',
        strategyId: 'grow_audience',
        strategyVersion: 1,
        materializationVersion: 1,
        direction: 'asc',
        limit: 20,
        hour: '2026-08-25T12',
        now,
      })
    ).resolves.toEqual({
      items: [],
      hasMore: false,
      source: 'materialized',
      hour: '2026-08-25T12',
    });
    expect(tx.channelAudienceHotPickBatch.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.channelAudienceHotPick.findMany).toHaveBeenCalledTimes(1);
  });

  it('loads interaction metrics for follower ids from daily aggregates', async () => {
    const { repository, dailyAggregateGroupBy } = createHarness();
    dailyAggregateGroupBy.mockResolvedValue([
      {
        counterpartyExternalId: 'person-1',
        _sum: { interactionCount: 23, interactionScore: 40 },
        _max: { lastInteractionAt: new Date('2026-08-12T12:00:00.000Z') },
      },
    ]);

    const metrics = await repository.getFollowerInteractionMetrics(
      'org',
      'integration',
      ['person-1', 'person-2', 'person-1']
    );

    expect(dailyAggregateGroupBy).toHaveBeenCalledWith({
      by: ['counterpartyExternalId'],
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        counterpartyExternalId: { in: ['person-1', 'person-2'] },
      },
      _sum: {
        interactionCount: true,
        interactionScore: true,
      },
      _max: {
        lastInteractionAt: true,
      },
    });
    expect(metrics.get('person-1')).toEqual({
      interactionCount: 23,
      interactionScore: 40,
      lastInteractionAt: new Date('2026-08-12T12:00:00.000Z'),
    });
    expect(metrics.has('person-2')).toBe(false);
  });

  it('counts canonical stored categories and at most twenty owned lists', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceList.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        id: `list-${index + 1}`,
        name: `List ${index + 1}`,
      }))
    );
    tx.channelAudienceMember.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(0);

    const result = await repository.getStoredFollowerAudienceCounts(
      'org',
      'integration'
    );

    expect(tx.channelAudienceList.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 21,
      select: { id: true, name: true },
    });
    expect(result.categories).toEqual({
      hot_lead: 1,
      mutual: 2,
      over_invested: 3,
      quiet: 4,
      engaged_not_yet: 5,
      lead: 6,
      followed: 7,
      unfollowed: 8,
      ignored: 9,
      cultivate: 10,
      hot: 0,
    });
    expect(result.lists).toHaveLength(20);
    expect(result.lists[0]).toEqual({
      id: 'list-1',
      name: 'List 1',
      total: 0,
    });
    expect(result.listsTruncated).toBe(true);
    expect(tx.channelAudienceMember.count).toHaveBeenCalledTimes(31);
    expect(tx.channelAudienceMember.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 'org',
        integrationId: 'integration',
        ignoredAt: null,
        listMemberships: {
          some: { listId: 'list-1', list: { deletedAt: null } },
        },
      }),
    });
    expect(tx.channelAudienceMember.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 'org',
        integrationId: 'integration',
        membershipState: {
          in: [
            ChannelAudienceMembership.UNKNOWN,
            ChannelAudienceMembership.NOT_FOLLOWER,
          ],
        },
        OR: [
          { inboundInteractionCount: { gt: 0 } },
          { leadBridgesAsLead: { some: {} } },
          {
            leadFitFeedbacks: {
              some: { source: 'lead_add', verdict: 'accepted' },
            },
          },
        ],
        ignoredAt: null,
        triageIgnores: {
          none: expect.objectContaining({
            triage: 'lead',
            OR: expect.any(Array),
          }),
        },
        AND: [leadFitVisibility, excludeActiveListMembership],
      }),
    });
    expect(tx.channelAudienceMember.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 'org',
        integrationId: 'integration',
        membershipState: ChannelAudienceMembership.FOLLOWER,
        ignoredAt: null,
        NOT: { relationshipTriage: 'hot_lead' },
        triageIgnores: {
          none: expect.objectContaining({
            triage: 'cultivate',
            OR: expect.any(Array),
          }),
        },
      }),
    });
  });

  it('adds inbound mention score to follower interaction metrics', async () => {
    const { repository, tx, dailyAggregateGroupBy } = createHarness();
    await repository.recordNormalizedEvent(
      'org',
      'integration',
      event({
        kind: ChannelInteractionKind.MENTION,
        score: 4,
        counterparty: { externalId: 'follower-1', name: 'Follower' },
      })
    );

    expect(tx.channelInteractionDailyAggregate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          counterpartyExternalId: 'follower-1',
          interactionScore: 4,
        }),
        update: {
          interactionCount: { increment: 1 },
          interactionScore: { increment: 4 },
        },
      })
    );

    dailyAggregateGroupBy.mockResolvedValue([
      {
        counterpartyExternalId: 'follower-1',
        _sum: { interactionCount: 1, interactionScore: 4 },
        _max: { lastInteractionAt: new Date('2026-08-12T23:30:00.000Z') },
      },
    ]);
    const metrics = await repository.getFollowerInteractionMetrics(
      'org',
      'integration',
      ['follower-1']
    );
    expect(metrics.get('follower-1')).toEqual({
      interactionCount: 1,
      interactionScore: 4,
      lastInteractionAt: new Date('2026-08-12T23:30:00.000Z'),
    });
  });

  it('increments the UTC daily aggregate once under concurrent duplicate delivery', async () => {
    const { repository, tx } = createHarness();
    tx.channelInteractionEvent.createMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const results = await Promise.all([
      repository.recordNormalizedEvent('org', 'integration', event()),
      repository.recordNormalizedEvent('org', 'integration', event()),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([{ created: true }, { created: false }])
    );
    expect(tx.channelInteractionDailyAggregate.upsert).toHaveBeenCalledTimes(1);
    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
      },
      data: {
        inboundInteractionCount: { increment: 1 },
      },
    });
    expect(tx.channelInteractionDailyAggregate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId_counterpartyExternalId_day: {
            integrationId: 'integration',
            counterpartyExternalId: 'person-1',
            day: new Date('2026-08-12T00:00:00.000Z'),
          },
        },
        update: {
          interactionCount: { increment: 1 },
          interactionScore: { increment: 2 },
        },
      })
    );
  });

  it('persists conversation identity and enqueues accepted interaction evidence atomically', async () => {
    const { repository, tx } = createHarness();

    await repository.recordNormalizedEvent(
      'org',
      'integration',
      event({ conversationExternalId: 'thread-1' })
    );

    expect(tx.channelInteractionEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          conversationExternalId: 'thread-1',
        }),
      ],
      skipDuplicates: true,
    });
    expect(tx.conversionEvaluationJob.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          strategyId: 'grow_audience',
          strategyVersion: 1,
          kind: 'INTERACTION',
          dedupeKey: 'interaction:interaction-1',
          payload: expect.objectContaining({
            interactionEventId: 'interaction-1',
            conversationExternalId: 'thread-1',
          }),
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('enqueues only NOT_FOLLOWER to FOLLOWER membership transitions', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst
      .mockResolvedValueOnce({
        membershipState: ChannelAudienceMembership.NOT_FOLLOWER,
      })
      .mockResolvedValueOnce({
        membershipState: ChannelAudienceMembership.UNKNOWN,
      });

    await repository.applyMembershipUpdate(
      'org',
      'integration',
      { externalId: 'person-1' },
      ChannelAudienceMembership.FOLLOWER,
      {
        eventAt: new Date('2026-08-20T12:00:00.000Z'),
        key: 'follow-1',
      }
    );
    await repository.applyMembershipUpdate(
      'org',
      'integration',
      { externalId: 'person-2' },
      ChannelAudienceMembership.FOLLOWER,
      {
        eventAt: new Date('2026-08-20T12:00:00.000Z'),
        key: 'follow-2',
      }
    );

    expect(tx.conversionEvaluationJob.createMany).toHaveBeenCalledTimes(1);
    expect(tx.conversionEvaluationJob.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          kind: 'MEMBERSHIP_TRANSITION',
          dedupeKey: 'membership-transition:follow-1',
          payload: {
            actorExternalId: 'person-1',
            fromState: 'NOT_FOLLOWER',
            toState: 'FOLLOWER',
            evidenceKey: 'follow-1',
          },
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('captures follower-sync transitions without treating initial imports as conversions', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst
      .mockResolvedValueOnce({
        membershipState: ChannelAudienceMembership.NOT_FOLLOWER,
      })
      .mockResolvedValueOnce(null);

    await repository.applyFollowerSyncPage(
      'org',
      'integration',
      'generation-2',
      [{ externalId: 'prior-non-follower' }, { externalId: 'initial-import' }]
    );

    expect(tx.conversionEvaluationJob.createMany).toHaveBeenCalledTimes(1);
    expect(tx.conversionEvaluationJob.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          dedupeKey:
            'membership-transition:follower-sync:generation-2:prior-non-follower',
          payload: expect.objectContaining({
            actorExternalId: 'prior-non-follower',
          }),
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('refreshes profiles without promoting unknown membership', async () => {
    const { repository, tx } = createHarness();
    await repository.recordNormalizedEvent('org', 'integration', event());

    expect(tx.channelAudienceMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ name: 'Person' }),
      })
    );
    expect(
      tx.channelAudienceMember.upsert.mock.calls[0][0].update
    ).not.toHaveProperty('membershipState');
  });

  it('rejects a cross-organization integration before any interaction write', async () => {
    const { repository, tx } = createHarness();
    tx.integration.findFirst.mockResolvedValue(null);

    await expect(
      repository.recordNormalizedEvent('wrong-org', 'integration', event())
    ).rejects.toThrow('does not belong');
    expect(tx.channelInteractionEvent.createMany).not.toHaveBeenCalled();
  });

  it('prevents stale follower pages from stamping a newer snapshot', async () => {
    const { repository, tx } = createHarness();
    tx.channelFollowerSyncState.updateMany.mockResolvedValue({ count: 0 });

    const applied = await repository.applyFollowerSyncPage(
      'org',
      'integration',
      'stale-generation',
      [{ externalId: 'person-1' }]
    );

    expect(applied).toBe(false);
    expect(tx.channelAudienceMember.upsert).not.toHaveBeenCalled();
  });

  it('stages follower membership without exposing partial additions', async () => {
    const { repository, tx } = createHarness();

    await repository.applyFollowerSyncPage(
      'org',
      'integration',
      'generation-2',
      [{ externalId: 'person-1' }]
    );

    expect(tx.channelAudienceMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          followerSyncGeneration: 'generation-2',
          followedAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          followerSyncGeneration: 'generation-2',
        }),
      })
    );
    expect(
      tx.channelAudienceMember.upsert.mock.calls[0][0].create
    ).not.toHaveProperty('membershipState');
    expect(
      tx.channelAudienceMember.upsert.mock.calls[0][0].update
    ).not.toHaveProperty('membershipState');
    expect(
      tx.channelAudienceMember.upsert.mock.calls[0][0].update
    ).not.toHaveProperty('followedAt');
  });

  it('keeps a provider followedAt on sync create and never stamps it on update', async () => {
    const { repository, tx } = createHarness();
    const followedAt = new Date('2026-01-01T00:00:00.000Z');

    await repository.applyFollowerSyncPage(
      'org',
      'integration',
      'generation-2',
      [{ externalId: 'person-1', followedAt }]
    );

    expect(tx.channelAudienceMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ followedAt }),
        update: expect.not.objectContaining({ followedAt: expect.anything() }),
      })
    );
    expect(
      tx.channelAudienceMember.upsert.mock.calls[0][0].update
    ).not.toHaveProperty('followedAt');
  });

  it('prevents stale completion from demoting the active generation', async () => {
    const { repository, tx } = createHarness();
    tx.channelFollowerSyncState.updateMany.mockResolvedValue({ count: 0 });

    const completed = await repository.completeFollowerSync(
      'org',
      'integration',
      'stale-generation',
      new Date()
    );

    expect(completed).toBe(false);
    expect(tx.channelAudienceMember.updateMany).not.toHaveBeenCalled();
  });

  it('demotes only followers absent from the successfully completed generation', async () => {
    const { repository, tx } = createHarness();
    const completed = await repository.completeFollowerSync(
      'org',
      'integration',
      'generation-2',
      new Date('2026-08-12T12:00:00.000Z')
    );

    expect(completed).toBe(true);
    expect(tx.channelAudienceMember.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        followerSyncGeneration: 'generation-2',
        OR: [
          { membershipEvidenceGeneration: null },
          { membershipEvidenceGeneration: { not: 'generation-2' } },
        ],
      },
      data: { membershipState: ChannelAudienceMembership.FOLLOWER },
    });
    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        membershipState: ChannelAudienceMembership.FOLLOWER,
        AND: [
          {
            OR: [
              { followerSyncGeneration: null },
              { followerSyncGeneration: { not: 'generation-2' } },
            ],
          },
          {
            OR: [
              { membershipEvidenceGeneration: null },
              { membershipEvidenceGeneration: { not: 'generation-2' } },
            ],
          },
        ],
      },
      data: { membershipState: ChannelAudienceMembership.NOT_FOLLOWER },
    });
    expect(tx.channelFollowerSyncState.update).toHaveBeenCalledWith({
      where: { integrationId: 'integration' },
      data: {
        activeGeneration: 'generation-2',
        pendingGeneration: null,
        status: ChannelFollowerSyncStatus.COMPLETE,
        completedAt: new Date('2026-08-12T12:00:00.000Z'),
      },
    });
  });

  it('preserves a follow received during the active follower sync', async () => {
    const { repository, tx } = createHarness();
    tx.channelFollowerSyncState.findFirst.mockResolvedValue({
      pendingGeneration: 'generation-2',
    });

    await repository.recordNormalizedEvent(
      'org',
      'integration',
      event({
        kind: ChannelInteractionKind.FOLLOW,
        membershipUpdate: ChannelAudienceMembership.FOLLOWER,
      })
    );
    await repository.completeFollowerSync(
      'org',
      'integration',
      'generation-2',
      new Date()
    );

    expect(tx.channelAudienceMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          membershipState: ChannelAudienceMembership.FOLLOWER,
          membershipEvidenceGeneration: 'generation-2',
        }),
      })
    );
    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { membershipEvidenceGeneration: null },
                { membershipEvidenceGeneration: { not: 'generation-2' } },
              ],
            },
          ]),
        }),
      })
    );
  });

  it('preserves an unfollow received after its profile was staged', async () => {
    const { repository, tx } = createHarness();
    tx.channelFollowerSyncState.findFirst.mockResolvedValue({
      pendingGeneration: 'generation-2',
    });

    await repository.applyFollowerSyncPage(
      'org',
      'integration',
      'generation-2',
      [{ externalId: 'person-1' }]
    );
    await repository.applyMembershipUpdate(
      'org',
      'integration',
      { externalId: 'person-1' },
      ChannelAudienceMembership.NOT_FOLLOWER
    );
    await repository.completeFollowerSync(
      'org',
      'integration',
      'generation-2',
      new Date()
    );

    expect(tx.channelAudienceMember.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          membershipState: ChannelAudienceMembership.NOT_FOLLOWER,
          membershipEvidenceGeneration: 'generation-2',
        }),
      })
    );
    expect(tx.channelAudienceMember.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          followerSyncGeneration: 'generation-2',
          OR: [
            { membershipEvidenceGeneration: null },
            { membershipEvidenceGeneration: { not: 'generation-2' } },
          ],
        }),
      })
    );
  });

  it('retains the last complete snapshot while a new sync begins and fails', async () => {
    const { repository, tx } = createHarness();

    await repository.beginFollowerSync('org', 'integration', 'generation-2');
    expect(
      tx.channelFollowerSyncState.upsert.mock.calls[0][0].update
    ).not.toHaveProperty('activeGeneration');
    expect(
      tx.channelFollowerSyncState.upsert.mock.calls[0][0].update
    ).not.toHaveProperty('completedAt');

    await repository.failFollowerSync('org', 'integration', 'generation-2');
    expect(tx.channelFollowerSyncState.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          pendingGeneration: null,
          status: ChannelFollowerSyncStatus.FAILED,
        },
      })
    );
  });

  it('removes stale subscriptions that are no longer desired', async () => {
    const { repository, tx } = createHarness();
    tx.channelInteractionSubscription.findMany.mockResolvedValue([
      {
        id: 'stale',
        eventKey: 'post.quote.create',
        direction: ChannelInteractionDirection.OUTBOUND,
        state: 'ERROR',
      },
    ]);

    await repository.applySubscriptionReconciliation('org', 'integration', {
      state: 'partial',
      subscriptions: [
        {
          eventKey: 'follow.follow',
          direction: 'inbound',
          state: 'error',
          failureCategory: 'authorization',
          reason: 'missing follows.read',
        },
      ],
      coverage: [],
    } as any);

    expect(tx.channelInteractionSubscription.delete).toHaveBeenCalledWith({
      where: { id: 'stale' },
    });
  });

  it('keeps failed cleanup pending and completes it only after remote removal succeeds', async () => {
    const { repository, tx } = createHarness();
    const failedCleanup = {
      state: 'error',
      subscriptions: [
        {
          eventKey: 'like',
          direction: 'inbound',
          state: 'error',
          failureCategory: 'transient',
        },
      ],
      coverage: [],
    } as any;
    const completeCleanup = {
      state: 'unconfigured',
      subscriptions: [
        {
          eventKey: 'like',
          direction: 'inbound',
          state: 'unconfigured',
        },
      ],
      coverage: [],
    } as any;

    await repository.applySubscriptionReconciliation(
      'org',
      'integration',
      failedCleanup,
      true
    );
    expect(tx.channelInteractionSubscription.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          state: 'REMOVING',
          failureCategory: 'transient',
        }),
      })
    );

    await repository.applySubscriptionReconciliation(
      'org',
      'integration',
      completeCleanup,
      true
    );
    expect(tx.channelInteractionSubscription.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventKey: 'like',
          state: 'UNCONFIGURED',
        }),
        update: expect.objectContaining({
          state: 'UNCONFIGURED',
          failureCategory: null,
        }),
      })
    );
  });

  it('selects disabled integrations only while subscription cleanup is pending', async () => {
    const { repository, integrationFindMany } = createHarness();
    integrationFindMany.mockResolvedValue([
      {
        id: 'disabled-integration',
        organizationId: 'org',
        disabled: true,
        deletedAt: null,
      },
    ]);

    await expect(repository.listMaintenanceCandidates()).resolves.toEqual({
      candidates: [
        {
          id: 'disabled-integration',
          organizationId: 'org',
          maintenance: 'cleanup',
        },
      ],
      next: undefined,
    });
    expect(integrationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              channelInteractionSubscriptions: {
                some: { state: 'REMOVING' },
              },
            }),
          ]),
        }),
      })
    );
  });

  it('switches even an empty rollup generation before deleting stale rows', async () => {
    const { repository, tx, groupBy, audienceMemberFindMany } = createHarness();
    const computedAt = new Date('2026-08-12T12:00:00.000Z');
    const cutoffAt = new Date('2026-08-05T12:00:00.000Z');

    const result = await repository.rebuildWindowSummary(
      'org',
      'integration',
      ChannelInteractionWindow.WEEK,
      'new-generation',
      cutoffAt,
      computedAt
    );

    expect(result.itemCount).toBe(0);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          integrationId: 'integration',
          eventAt: { gte: cutoffAt, lte: computedAt },
        },
      })
    );
    expect(audienceMemberFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        membershipState: ChannelAudienceMembership.FOLLOWER,
      },
      select: { externalId: true },
    });
    expect(
      tx.channelInteractionWindowSummary.createMany
    ).not.toHaveBeenCalled();
    expect(tx.channelInteractionRollupState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ activeGeneration: 'new-generation' }),
      })
    );
    expect(
      tx.channelInteractionRollupState.upsert.mock.invocationCallOrder[0]
    ).toBeLessThan(
      tx.channelInteractionWindowSummary.deleteMany.mock.invocationCallOrder[0]
    );
  });

  it('preserves the previous active rollup if writing the new generation fails', async () => {
    const { repository, tx, groupBy, audienceMemberFindMany } = createHarness();
    groupBy.mockResolvedValue([
      {
        counterpartyExternalId: 'person-1',
        kind: ChannelInteractionKind.LIKE,
        direction: ChannelInteractionDirection.INBOUND,
        _count: { _all: 2 },
        _max: { eventAt: new Date('2026-08-12T12:00:00.000Z') },
      },
    ]);
    audienceMemberFindMany.mockResolvedValue([{ externalId: 'person-1' }]);
    tx.channelInteractionWindowSummary.createMany.mockRejectedValue(
      new Error('write failed')
    );

    await expect(
      repository.rebuildWindowSummary(
        'org',
        'integration',
        ChannelInteractionWindow.WEEK,
        'new-generation',
        new Date('2026-08-06T00:00:00.000Z'),
        new Date()
      )
    ).rejects.toThrow('write failed');
    expect(tx.channelInteractionRollupState.upsert).not.toHaveBeenCalled();
    expect(
      tx.channelInteractionWindowSummary.deleteMany
    ).not.toHaveBeenCalled();
  });

  it('materializes zero-valued summaries for followers only', async () => {
    const { repository, tx, groupBy, audienceMemberFindMany } = createHarness();
    const computedAt = new Date('2026-08-12T12:00:00.000Z');
    groupBy.mockResolvedValue([
      {
        counterpartyExternalId: 'active-follower',
        kind: ChannelInteractionKind.LIKE,
        direction: ChannelInteractionDirection.INBOUND,
        _count: { _all: 2 },
        _max: { eventAt: computedAt },
      },
    ]);
    audienceMemberFindMany.mockResolvedValue([
      { externalId: 'active-follower' },
      { externalId: 'zero-follower' },
    ]);

    await expect(
      repository.rebuildWindowSummary(
        'org',
        'integration',
        ChannelInteractionWindow.MONTH,
        'generation-a',
        new Date('2026-07-12T12:00:00.000Z'),
        computedAt
      )
    ).resolves.toMatchObject({ itemCount: 2 });

    expect(tx.channelInteractionWindowSummary.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            counterpartyExternalId: 'active-follower',
            interactionCount: 2,
            interactionScore: 4,
            lastInteractionAt: computedAt,
          }),
          expect.objectContaining({
            counterpartyExternalId: 'zero-follower',
            interactionCount: 0,
            interactionScore: 0,
            lastInteractionAt: null,
          }),
        ]),
      })
    );
  });

  it('queries only current followers in the active summary generation', async () => {
    const {
      repository,
      transaction,
      findFirst,
      followerSyncFindFirst,
      findMany,
    } = createHarness();
    findFirst.mockResolvedValue({
      activeGeneration: 'generation-a',
      computedAt: new Date('2026-08-12T12:00:00.000Z'),
    });
    followerSyncFindFirst.mockResolvedValue({
      activeGeneration: 'followers-a',
      status: ChannelFollowerSyncStatus.IN_PROGRESS,
      completedAt: new Date('2026-08-11T12:00:00.000Z'),
    });
    findMany.mockResolvedValue([]);
    (repository as any)._transaction.model.$transaction = transaction;

    await repository.getRankedFollowers({
      organizationId: 'org',
      integrationId: 'integration',
      window: ChannelInteractionWindow.MONTH,
      direction: 'desc',
      limit: 24,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          integrationId: 'integration',
          generation: 'generation-a',
          audienceMember: {
            is: {
              organizationId: 'org',
              integrationId: 'integration',
              membershipState: ChannelAudienceMembership.FOLLOWER,
              ignoredAt: null,
            },
          },
        }),
        take: 25,
        orderBy: [
          { interactionCount: 'desc' },
          { interactionScore: 'desc' },
          { lastInteractionAt: 'desc' },
          { counterpartyExternalId: 'desc' },
        ],
      })
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('uses null-aware keysets so zero-ranked followers remain pageable', () => {
    const { repository } = createHarness();

    expect(
      (repository as any).rankedFollowerKeyset(
        {
          interactionCount: 0,
          interactionScore: 0,
          lastInteractionAt: null,
          externalId: 'follower-a',
        },
        'desc'
      )
    ).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            interactionCount: 0,
            interactionScore: 0,
            lastInteractionAt: { not: null },
          }),
          expect.objectContaining({
            interactionCount: 0,
            interactionScore: 0,
            lastInteractionAt: null,
            counterpartyExternalId: { lt: 'follower-a' },
          }),
        ]),
      })
    );

    expect(
      (repository as any).rankedFollowerKeyset(
        {
          interactionCount: 0,
          interactionScore: 0,
          lastInteractionAt: '2026-08-12T12:00:00.000Z',
          externalId: 'follower-a',
        },
        'asc'
      )
    ).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            interactionCount: 0,
            interactionScore: 0,
            OR: [
              {
                lastInteractionAt: { gt: new Date('2026-08-12T12:00:00.000Z') },
              },
              { lastInteractionAt: null },
            ],
          }),
        ]),
      })
    );
  });

  it('builds a bounded due batch of per-kind interaction counts', async () => {
    const { repository, tx, groupBy } = createHarness();
    tx.channelAudienceMember.findMany.mockResolvedValue([
      { externalId: 'outbound-only' },
      { externalId: 'zero-activity' },
    ]);
    groupBy.mockResolvedValue([
      {
        counterpartyExternalId: 'outbound-only',
        kind: ChannelInteractionKind.REPLY,
        direction: ChannelInteractionDirection.OUTBOUND,
        _count: { _all: 2 },
      },
    ]);
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await expect(
      repository.getDueRelationshipGradeBatch('org', 'integration', snapshotAt)
    ).resolves.toEqual({
      strategy: growSelection,
      members: [
        {
          externalId: 'outbound-only',
          membershipState: null,
          interactionCounts: interactionCounts({ reply: { outbound: 2 } }),
        },
        {
          externalId: 'zero-activity',
          membershipState: null,
          interactionCounts: interactionCounts(),
        },
      ],
    });
    expect(tx.channelAudienceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: 'asc' },
        take: 100,
        where: expect.objectContaining({
          gradeSnapshots: {
            none: {
              formulaVersion: RELATIONSHIP_FORMULA_VERSION,
              relationshipStrategyId: 'grow_audience',
              relationshipStrategyVersion: 1,
              snapshotAt: { gt: new Date('2026-08-09T12:00:00.000Z') },
            },
          },
        }),
      })
    );
    expect(tx.channelAudienceMember.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: { in: ['outbound-only', 'zero-activity'] },
      },
      select: { externalId: true, membershipState: true },
    });
    expect(groupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventAt: {
            gte: new Date('2026-07-13T12:00:00.000Z'),
            lte: snapshotAt,
          },
        }),
      })
    );
  });

  it('persists v2 history and complete current projections idempotently', async () => {
    const { repository, tx } = createHarness();
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await repository.createRelationshipGradeSnapshots(
      'org',
      'integration',
      snapshotAt,
      [snapshotInput()]
    );

    expect(tx.channelRelationshipGradeSnapshot.createMany).toHaveBeenCalledWith(
      {
        data: [
          {
            organizationId: 'org',
            integrationId: 'integration',
            counterpartyExternalId: 'person-1',
            windowStartedAt: new Date('2026-07-13T12:00:00.000Z'),
            snapshotAt,
            effortScore: 12,
            reciprocationScore: 8,
            reciprocity: 2 / 3,
            grade: 2,
            formulaVersion: 2,
            relationshipStrategyId: 'grow_audience',
            relationshipStrategyVersion: 1,
          },
        ],
        skipDuplicates: true,
      }
    );
    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
        integration: growIntegrationFilter,
        OR: [
          { relationshipSnapshotAt: null },
          { relationshipSnapshotAt: { lte: snapshotAt } },
        ],
      },
      data: {
        relationshipGrade: 2,
        relationshipEffortScore: 12,
        relationshipReciprocationScore: 8,
        relationshipNetGap: -4,
        relationshipTriage: 'over_invested',
        relationshipFormulaVersion: 2,
        relationshipStrategyId: 'grow_audience',
        relationshipStrategyVersion: 1,
        relationshipSnapshotAt: snapshotAt,
      },
    });
  });

  it('scopes projection writes to the strategy the batch was scored with', async () => {
    const { repository, tx } = createHarness();
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await repository.updateCurrentRelationshipProjections(
      'org',
      'integration',
      snapshotAt,
      [snapshotInput({ strategyId: 'lead_capture', triage: 'hot_lead' })]
    );

    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          integration: { is: { strategyId: { equals: 'lead_capture' } } },
        }),
        data: expect.objectContaining({
          relationshipStrategyId: 'lead_capture',
          relationshipTriage: 'hot_lead',
        }),
      })
    );
  });

  it('aggregates targeted member counts without writing snapshots', async () => {
    const { repository, tx, groupBy } = createHarness();
    groupBy.mockResolvedValue([
      {
        counterpartyExternalId: 'person-1',
        kind: ChannelInteractionKind.REPLY,
        direction: ChannelInteractionDirection.OUTBOUND,
        _count: { _all: 2 },
      },
    ]);
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await expect(
      repository.getRelationshipScoresForMembers(
        'org',
        'integration',
        ['person-1', 'quiet-follower'],
        snapshotAt
      )
    ).resolves.toEqual({
      strategy: growSelection,
      members: [
        {
          externalId: 'person-1',
          membershipState: null,
          interactionCounts: interactionCounts({ reply: { outbound: 2 } }),
        },
        {
          externalId: 'quiet-follower',
          membershipState: null,
          interactionCounts: interactionCounts(),
        },
      ],
    });
    expect(groupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          counterpartyExternalId: { in: ['person-1', 'quiet-follower'] },
          eventAt: {
            gte: new Date('2026-07-13T12:00:00.000Z'),
            lte: snapshotAt,
          },
        }),
      })
    );
    expect(
      tx.channelRelationshipGradeSnapshot.createMany
    ).not.toHaveBeenCalled();
  });

  it('updates current relationship projections without writing history', async () => {
    const { repository, tx } = createHarness();
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await expect(
      repository.updateCurrentRelationshipProjections(
        'org',
        'integration',
        snapshotAt,
        [snapshotInput()]
      )
    ).resolves.toEqual({ count: 1 });
    expect(
      tx.channelRelationshipGradeSnapshot.createMany
    ).not.toHaveBeenCalled();
    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
        integration: growIntegrationFilter,
        OR: [
          { relationshipSnapshotAt: null },
          { relationshipSnapshotAt: { lte: snapshotAt } },
        ],
      },
      data: {
        relationshipGrade: 2,
        relationshipEffortScore: 12,
        relationshipReciprocationScore: 8,
        relationshipNetGap: -4,
        relationshipTriage: 'over_invested',
        relationshipFormulaVersion: 2,
        relationshipStrategyId: 'grow_audience',
        relationshipStrategyVersion: 1,
        relationshipSnapshotAt: snapshotAt,
      },
    });
  });

  it('reads the current relationship projection for one owned member', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst.mockResolvedValue({
      externalId: 'person-1',
      membershipState: ChannelAudienceMembership.FOLLOWER,
      relationshipEffortScore: 10,
      relationshipReciprocationScore: 5,
    });

    await expect(
      repository.getCurrentRelationshipProjection(
        'org',
        'integration',
        'person-1'
      )
    ).resolves.toEqual({
      externalId: 'person-1',
      membershipState: ChannelAudienceMembership.FOLLOWER,
      relationshipEffortScore: 10,
      relationshipReciprocationScore: 5,
    });
    expect(tx.channelAudienceMember.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
      },
      select: {
        externalId: true,
        membershipState: true,
        relationshipEffortScore: true,
        relationshipReciprocationScore: true,
      },
    });
  });

  it('loads the current relationship grade when upserting a personal grade', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst.mockResolvedValue({
      id: 'member-1',
      relationshipGrade: 3.5,
    });
    tx.channelAudienceMemberGrade.upsert.mockResolvedValue({ grade: 4.5 });

    await expect(
      repository.upsertAudienceMemberGrade(
        'org',
        'integration',
        'person-1',
        'user-a',
        4.5
      )
    ).resolves.toEqual({ grade: 4.5, relationshipGrade: 3.5 });
    expect(tx.channelAudienceMember.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
      },
      select: { relationshipGrade: true },
    });
  });

  it('requires a recent current-formula snapshot for the selected strategy', async () => {
    const { repository, tx } = createHarness();
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await repository.hasDueRelationshipGradeMembers(
      'org',
      'integration',
      snapshotAt
    );

    expect(tx.channelAudienceMember.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        membershipState: ChannelAudienceMembership.FOLLOWER,
        OR: expect.arrayContaining([
          {
            integration: growIntegrationFilter,
            gradeSnapshots: {
              none: {
                formulaVersion: RELATIONSHIP_FORMULA_VERSION,
                relationshipStrategyId: 'grow_audience',
                relationshipStrategyVersion: 1,
                snapshotAt: { gt: new Date('2026-08-09T12:00:00.000Z') },
              },
            },
          },
          {
            integration: { is: { strategyId: { equals: 'lead_capture' } } },
            gradeSnapshots: {
              none: {
                formulaVersion: RELATIONSHIP_FORMULA_VERSION,
                relationshipStrategyId: 'lead_capture',
                relationshipStrategyVersion: 1,
                snapshotAt: { gt: new Date('2026-08-09T12:00:00.000Z') },
              },
            },
          },
        ]),
      },
      select: { id: true },
    });
    expect(
      tx.channelAudienceMember.findFirst.mock.calls[0][0].where.OR
    ).toHaveLength(5);
  });

  it('uses a custom cadence when checking due relationship grades', async () => {
    const { repository, tx } = createHarness();
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await repository.hasDueRelationshipGradeMembers(
      'org',
      'integration',
      snapshotAt,
      {
        unit: 'hour',
        interval: 1,
      }
    );

    expect(tx.channelAudienceMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              gradeSnapshots: {
                none: expect.objectContaining({
                  formulaVersion: RELATIONSHIP_FORMULA_VERSION,
                  snapshotAt: { gt: new Date('2026-08-12T11:00:00.000Z') },
                }),
              },
            }),
          ]),
        }),
      })
    );
  });

  it('uses a monthly cadence when checking due relationship grades', async () => {
    const { repository, tx } = createHarness();
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await repository.hasDueRelationshipGradeMembers(
      'org',
      'integration',
      snapshotAt,
      {
        unit: 'month',
        interval: 1,
        timeOfDay: '00:00',
        dayOfMonth: 1,
      }
    );

    expect(tx.channelAudienceMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              gradeSnapshots: {
                none: expect.objectContaining({
                  formulaVersion: RELATIONSHIP_FORMULA_VERSION,
                  snapshotAt: { gt: new Date('2026-07-12T12:00:00.000Z') },
                }),
              },
            }),
          ]),
        }),
      })
    );
  });

  it('reports stale projections while a strategy recompute is pending', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst.mockResolvedValue({ id: 'member-1' });

    await expect(
      repository.hasStaleRelationshipProjections('org', 'integration', {
        strategyId: 'lead_capture',
        strategyVersion: 2,
      })
    ).resolves.toBe(true);
    expect(tx.channelAudienceMember.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        membershipState: ChannelAudienceMembership.FOLLOWER,
        OR: [
          { relationshipFormulaVersion: null },
          { relationshipFormulaVersion: { not: RELATIONSHIP_FORMULA_VERSION } },
          { relationshipStrategyId: null },
          { relationshipStrategyId: { not: 'lead_capture' } },
          { relationshipStrategyVersion: null },
          { relationshipStrategyVersion: { not: 2 } },
        ],
      },
      select: { id: true },
    });
  });

  it('selects due channels per stored strategy identity including migrated rows', async () => {
    const { repository, integrationFindMany } = createHarness();
    integrationFindMany.mockResolvedValue([
      { id: 'integration-a', organizationId: 'org' },
    ]);
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await expect(
      repository.listDueRelationshipGradeCandidates(snapshotAt)
    ).resolves.toEqual({
      candidates: [{ id: 'integration-a', organizationId: 'org' }],
      next: undefined,
    });
    const where = integrationFindMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(5);
    expect(where.OR).toContainEqual({
      strategyId: {
        notIn: [
          'lead_capture',
          'community_retention',
          'brand_awareness',
          'customer_support',
        ],
      },
      channelAudienceMembers: {
        some: {
          membershipState: ChannelAudienceMembership.FOLLOWER,
          gradeSnapshots: {
            none: {
              formulaVersion: RELATIONSHIP_FORMULA_VERSION,
              relationshipStrategyId: 'grow_audience',
              relationshipStrategyVersion: 1,
              snapshotAt: { gt: new Date('2026-08-09T12:00:00.000Z') },
            },
          },
        },
      },
    });
  });

  it('increments inbound counts for inbound likes without likesCount', async () => {
    const { repository, tx } = createHarness();

    await repository.recordNormalizedEvent('org', 'integration', event());

    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
      },
      data: {
        inboundInteractionCount: { increment: 1 },
      },
    });
    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
        OR: [
          { lastInboundAt: null },
          { lastInboundAt: { lt: event().eventAt } },
        ],
      },
      data: { lastInboundAt: event().eventAt },
    });
  });

  it('increments likesCount for polled inbound likes', async () => {
    const { repository, tx } = createHarness();

    await repository.recordPolledInboundLike(
      'org',
      'integration',
      'tweet-1',
      {
        externalId: 'person-1',
        name: 'Person',
        username: 'person',
      },
      new Date('2026-08-17T12:00:00.000Z')
    );

    expect(tx.channelInteractionEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          providerEventKey: 'post-like:tweet-1:person-1',
          kind: ChannelInteractionKind.LIKE,
          direction: ChannelInteractionDirection.INBOUND,
          relatedObjectId: 'tweet-1',
          counterpartyExternalId: 'person-1',
        }),
      ],
      skipDuplicates: true,
    });
    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
      },
      data: {
        inboundInteractionCount: { increment: 1 },
        likesCount: { increment: 1 },
      },
    });
  });

  it('does not increment likesCount when a polled like is a duplicate', async () => {
    const { repository, tx } = createHarness();
    tx.channelInteractionEvent.createMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.recordPolledInboundLike(
        'org',
        'integration',
        'tweet-1',
        { externalId: 'person-1' },
        new Date('2026-08-17T12:00:00.000Z')
      )
    ).resolves.toEqual({ created: false });

    expect(tx.channelAudienceMember.updateMany).not.toHaveBeenCalled();
  });

  it('increments inbound counts for inbound replies without likesCount', async () => {
    const { repository, tx } = createHarness();
    const reply = event({
      providerEventKey: 'reply',
      kind: ChannelInteractionKind.REPLY,
    });

    await repository.recordNormalizedEvent('org', 'integration', reply);

    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
      },
      data: {
        inboundInteractionCount: { increment: 1 },
      },
    });
  });

  it('does not increment inbound or likes counts for outbound likes', async () => {
    const { repository, tx } = createHarness();
    const eventAt = new Date('2026-08-12T23:30:00.000Z');

    await repository.recordNormalizedEvent(
      'org',
      'integration',
      event({
        providerEventKey: 'outbound-like',
        direction: ChannelInteractionDirection.OUTBOUND,
        eventAt,
      })
    );

    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
        OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: eventAt } }],
      },
      data: { lastOutboundAt: eventAt },
    });
    expect(tx.channelAudienceMember.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inboundInteractionCount: { increment: 1 },
        }),
      })
    );
    expect(tx.channelAudienceMemberTriageIgnore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          triage: 'hot_lead',
          expiresAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          expiresAt: expect.any(Date),
        }),
      })
    );
  });

  it('forces current relationship projections when requested', async () => {
    const { repository, tx } = createHarness();
    const snapshotAt = new Date('2026-08-12T12:00:00.000Z');

    await expect(
      repository.updateCurrentRelationshipProjections(
        'org',
        'integration',
        snapshotAt,
        [
          snapshotInput({
            effortScore: 4,
            reciprocationScore: 12,
            reciprocity: 1 / 3,
            grade: 3,
            formulaVersion: 3,
            triage: 'hot_lead',
          }),
        ],
        { force: true }
      )
    ).resolves.toEqual({ count: 1 });
    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
        integration: growIntegrationFilter,
      },
      data: expect.objectContaining({
        relationshipEffortScore: 4,
        relationshipReciprocationScore: 12,
        relationshipTriage: 'hot_lead',
        relationshipFormulaVersion: 3,
        relationshipSnapshotAt: snapshotAt,
      }),
    });
  });

  it('does not increment inbound counts when a duplicate like is skipped', async () => {
    const { repository, tx } = createHarness();
    tx.channelInteractionEvent.createMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.recordNormalizedEvent('org', 'integration', event())
    ).resolves.toEqual({ created: false });

    expect(tx.channelAudienceMember.updateMany).not.toHaveBeenCalled();
  });

  it('increments noteCount when creating an audience note', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst.mockResolvedValue({ id: 'member-1' });
    tx.channelAudienceNote.create.mockResolvedValue({
      id: 'note-1',
      content: 'Hello',
      author: {
        id: 'user-1',
        name: 'Ada',
        lastName: null,
        email: 'ada@example.com',
      },
    });

    await expect(
      repository.createAudienceNote(
        'org',
        'integration',
        'person-1',
        'user-1',
        'Hello'
      )
    ).resolves.toMatchObject({ id: 'note-1' });

    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
      },
      data: { noteCount: { increment: 1 } },
    });
  });

  it('decrements noteCount when deleting an audience note', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceNote.findFirst.mockResolvedValue({
      id: 'note-1',
      counterpartyExternalId: 'person-1',
    });
    tx.channelAudienceNote.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.deleteAudienceNote('org', 'integration', 'note-1')
    ).resolves.toBe(true);

    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        externalId: 'person-1',
        noteCount: { gt: 0 },
      },
      data: { noteCount: { decrement: 1 } },
    });
  });

  it('does not decrement noteCount when the note is missing', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceNote.findFirst.mockResolvedValue(null);

    await expect(
      repository.deleteAudienceNote('org', 'integration', 'missing')
    ).resolves.toBe(false);

    expect(tx.channelAudienceNote.deleteMany).not.toHaveBeenCalled();
    expect(tx.channelAudienceMember.updateMany).not.toHaveBeenCalled();
  });

  it('ranks followers by noteCount with keyset pagination', async () => {
    const { repository, tx, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([
      { externalId: 'person-2', name: 'Two', noteCount: 4 },
      { externalId: 'person-1', name: 'One', noteCount: 2 },
      { externalId: 'person-0', name: 'Zero', noteCount: 0 },
    ]);

    await expect(
      repository.getFollowersByNoteCount({
        organizationId: 'org',
        integrationId: 'integration',
        userId: 'user-a',
        direction: 'desc',
        limit: 2,
      })
    ).resolves.toEqual({
      items: [
        { externalId: 'person-2', name: 'Two', noteCount: 4 },
        { externalId: 'person-1', name: 'One', noteCount: 2 },
      ],
      hasMore: true,
    });

    expect(tx.integration.findFirst).toHaveBeenCalled();
    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          integrationId: 'integration',
          membershipState: ChannelAudienceMembership.FOLLOWER,
          AND: [{ ignoredAt: null }],
        },
        orderBy: [{ noteCount: 'desc' }, { externalId: 'desc' }],
        take: 3,
      })
    );

    expect(
      (repository as any).noteCountFollowerKeyset(
        { noteCount: 2, externalId: 'person-1' },
        'desc'
      )
    ).toEqual({
      OR: [
        { noteCount: { lt: 2 } },
        { noteCount: 2, externalId: { lt: 'person-1' } },
      ],
    });
  });

  it('filters ranked followers by username or name when search is set', async () => {
    const { repository, findFirst, followerSyncFindFirst, findMany } =
      createHarness();
    findFirst.mockResolvedValue({
      activeGeneration: 'generation-a',
      computedAt: new Date('2026-08-12T12:00:00.000Z'),
    });
    followerSyncFindFirst.mockResolvedValue({
      activeGeneration: 'followers-a',
      status: ChannelFollowerSyncStatus.IN_PROGRESS,
      completedAt: new Date('2026-08-11T12:00:00.000Z'),
    });
    findMany.mockResolvedValue([]);

    await repository.getRankedFollowers({
      organizationId: 'org',
      integrationId: 'integration',
      window: ChannelInteractionWindow.MONTH,
      direction: 'desc',
      limit: 24,
      search: 'alice',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          audienceMember: {
            is: {
              organizationId: 'org',
              integrationId: 'integration',
              membershipState: ChannelAudienceMembership.FOLLOWER,
              ignoredAt: null,
              OR: [
                { username: { contains: 'alice', mode: 'insensitive' } },
                { name: { contains: 'alice', mode: 'insensitive' } },
              ],
            },
          },
        }),
      })
    );
  });

  it('ranks followers by likesCount with keyset pagination', async () => {
    const { repository, tx, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([
      { externalId: 'person-2', name: 'Two', likesCount: 4 },
      { externalId: 'person-1', name: 'One', likesCount: 2 },
      { externalId: 'person-0', name: 'Zero', likesCount: 0 },
    ]);

    await expect(
      repository.getFollowersByLikesCount({
        organizationId: 'org',
        integrationId: 'integration',
        userId: 'user-a',
        direction: 'desc',
        limit: 2,
      })
    ).resolves.toEqual({
      items: [
        { externalId: 'person-2', name: 'Two', likesCount: 4 },
        { externalId: 'person-1', name: 'One', likesCount: 2 },
      ],
      hasMore: true,
    });

    expect(tx.integration.findFirst).toHaveBeenCalled();
    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          integrationId: 'integration',
          membershipState: ChannelAudienceMembership.FOLLOWER,
          AND: [{ ignoredAt: null }],
        },
        orderBy: [{ likesCount: 'desc' }, { externalId: 'desc' }],
        take: 3,
      })
    );

    expect(
      (repository as any).likesCountFollowerKeyset(
        { likesCount: 2, externalId: 'person-1' },
        'desc'
      )
    ).toEqual({
      OR: [
        { likesCount: { lt: 2 } },
        { likesCount: 2, externalId: { lt: 'person-1' } },
      ],
    });
  });

  it('filters like-count followers by username or name when search is set', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([]);

    await repository.getFollowersByLikesCount({
      organizationId: 'org',
      integrationId: 'integration',
      userId: 'user-a',
      direction: 'desc',
      limit: 24,
      search: 'alice',
    });

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          integrationId: 'integration',
          membershipState: ChannelAudienceMembership.FOLLOWER,
          AND: expect.arrayContaining([
            {
              OR: [
                { username: { contains: 'alice', mode: 'insensitive' } },
                { name: { contains: 'alice', mode: 'insensitive' } },
              ],
            },
            { ignoredAt: null },
          ]),
        },
      })
    );
  });

  it('lists non-followers with inbound interactions as leads', async () => {
    const { repository, tx, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([
      {
        externalId: 'lead-2',
        name: 'Lead Two',
        inboundInteractionCount: 3,
        lastInboundAt: new Date('2026-08-14T12:00:00.000Z'),
      },
      {
        externalId: 'lead-1',
        name: 'Lead One',
        inboundInteractionCount: 1,
        lastInboundAt: new Date('2026-08-13T12:00:00.000Z'),
      },
    ]);

    await expect(
      repository.getAudienceLeads({
        organizationId: 'org',
        integrationId: 'integration',
        userId: 'user-a',
        direction: 'desc',
        limit: 2,
      })
    ).resolves.toEqual({
      items: [
        {
          externalId: 'lead-2',
          name: 'Lead Two',
          inboundInteractionCount: 3,
          lastInboundAt: new Date('2026-08-14T12:00:00.000Z'),
        },
        {
          externalId: 'lead-1',
          name: 'Lead One',
          inboundInteractionCount: 1,
          lastInboundAt: new Date('2026-08-13T12:00:00.000Z'),
        },
      ],
      hasMore: false,
    });

    expect(tx.integration.findFirst).toHaveBeenCalled();
    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          integrationId: 'integration',
          membershipState: {
            in: [
              ChannelAudienceMembership.UNKNOWN,
              ChannelAudienceMembership.NOT_FOLLOWER,
            ],
          },
          OR: [
            { inboundInteractionCount: { gt: 0 } },
            { leadBridgesAsLead: { some: {} } },
            {
              leadFitFeedbacks: {
                some: { source: 'lead_add', verdict: 'accepted' },
              },
            },
          ],
          weFollowedAt: null,
          triageIgnores: {
            none: expect.objectContaining({
              triage: 'lead',
              OR: expect.any(Array),
            }),
          },
          AND: [
            { ignoredAt: null },
            leadFitVisibility,
            excludeActiveListMembership,
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { externalId: 'desc' }],
        take: 3,
      })
    );
  });

  it('excludes leads that belong to any active custom list from the leads triage', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([]);

    await repository.getAudienceLeads({
      organizationId: 'org',
      integrationId: 'integration',
      userId: 'user-a',
      direction: 'desc',
      limit: 24,
    });

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          weFollowedAt: null,
          AND: expect.arrayContaining([excludeActiveListMembership]),
        }),
      })
    );
  });

  it('lists followed audience members who have not followed back', async () => {
    const { repository, tx, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([
      {
        externalId: 'followed-1',
        name: 'Followed One',
        weFollowedAt: new Date('2026-08-20T12:00:00.000Z'),
      },
    ]);

    await expect(
      repository.getAudienceFollowed({
        organizationId: 'org',
        integrationId: 'integration',
        userId: 'user-a',
        direction: 'desc',
        limit: 24,
      })
    ).resolves.toEqual({
      items: [
        {
          externalId: 'followed-1',
          name: 'Followed One',
          weFollowedAt: new Date('2026-08-20T12:00:00.000Z'),
        },
      ],
      hasMore: false,
    });

    expect(tx.integration.findFirst).toHaveBeenCalled();
    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          weFollowedAt: { not: null },
          followedAt: null,
          membershipState: {
            in: [
              ChannelAudienceMembership.UNKNOWN,
              ChannelAudienceMembership.NOT_FOLLOWER,
            ],
          },
        }),
        orderBy: [{ weFollowedAt: 'desc' }, { externalId: 'desc' }],
      })
    );
  });

  it('lists unfollowed audience members who used to follow and no longer do', async () => {
    const { repository, tx, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([
      {
        externalId: 'unfollowed-1',
        name: 'Unfollowed One',
        weFollowedAt: new Date('2026-08-20T12:00:00.000Z'),
        followedAt: new Date('2026-08-01T12:00:00.000Z'),
      },
    ]);

    await expect(
      repository.getAudienceUnfollowed({
        organizationId: 'org',
        integrationId: 'integration',
        userId: 'user-a',
        direction: 'desc',
        limit: 24,
      })
    ).resolves.toEqual({
      items: [
        {
          externalId: 'unfollowed-1',
          name: 'Unfollowed One',
          weFollowedAt: new Date('2026-08-20T12:00:00.000Z'),
          followedAt: new Date('2026-08-01T12:00:00.000Z'),
        },
      ],
      hasMore: false,
    });

    expect(tx.integration.findFirst).toHaveBeenCalled();
    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          weFollowedAt: { not: null },
          followedAt: { not: null },
          membershipState: ChannelAudienceMembership.NOT_FOLLOWER,
          ignoredAt: null,
        }),
        orderBy: [{ weFollowedAt: 'desc' }, { externalId: 'desc' }],
      })
    );
  });

  it('does not treat soft-deleted list membership as leaving the leads triage', async () => {
    const { repository } = createHarness();

    expect((repository as any).excludeActiveListMembershipFilter()).toEqual({
      listMemberships: {
        none: { list: { deletedAt: null } },
      },
    });
  });

  it('caps new lead bridges per warm source while refreshing existing ones', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst
      .mockResolvedValueOnce({ externalId: 'warm-1' }) // bridge exists
      .mockResolvedValueOnce(null) // lead-a membership
      .mockResolvedValueOnce(null) // lead-b membership
      .mockResolvedValueOnce(null); // lead-c membership
    tx.channelAudienceLeadBridge.findUnique
      .mockResolvedValueOnce(null) // lead-a new
      .mockResolvedValueOnce({ leadExternalId: 'lead-b' }) // lead-b refresh
      .mockResolvedValueOnce(null); // lead-c over cap
    tx.channelAudienceLeadBridge.aggregate.mockResolvedValue({
      _max: { bridgeRelationshipGrade: 4.1 },
    });

    await expect(
      repository.applyLeadBridgeDiscoveries({
        organizationId: 'org',
        integrationId: 'integration',
        bridgeExternalId: 'warm-1',
        bridgeRelationshipGrade: 4.1,
        maxApplied: 1,
        leads: [
          { externalId: 'lead-a', name: 'A' },
          { externalId: 'lead-b', name: 'B' },
          { externalId: 'lead-c', name: 'C' },
        ],
      })
    ).resolves.toEqual({
      applied: 1,
      skipped: 1,
      appliedExternalIds: ['lead-a'],
    });

    expect(tx.channelAudienceLeadBridge.upsert).toHaveBeenCalledTimes(2);
    expect(tx.channelAudienceMember.upsert).toHaveBeenCalledTimes(2);
  });

  it('clears all discovered lead bridges and deletes orphan lead-only members', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceLeadBridge.findMany.mockResolvedValue([
      { integrationId: 'integration-a' },
    ]);
    tx.channelAudienceLeadBridge.deleteMany.mockResolvedValue({ count: 3 });
    tx.channelAudienceMember.findMany.mockResolvedValue([
      { integrationId: 'integration-a', externalId: 'lead-1' },
    ]);
    tx.channelAudienceMember.deleteMany.mockResolvedValue({ count: 1 });

    await expect(repository.clearAllDiscoveredLeads()).resolves.toEqual({
      bridgesDeleted: 3,
      orphansDeleted: 1,
      integrationIds: ['integration-a'],
    });

    expect(tx.channelAudienceLeadBridge.deleteMany).toHaveBeenCalledWith({});
    expect(tx.channelAudienceMember.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadBridgeScore: null,
          leadFitScore: null,
        }),
      })
    );
    expect(tx.channelAudienceNote.deleteMany).toHaveBeenCalled();
    expect(tx.channelAudienceMember.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          membershipState: {
            in: [
              ChannelAudienceMembership.UNKNOWN,
              ChannelAudienceMembership.NOT_FOLLOWER,
            ],
          },
          inboundInteractionCount: 0,
        }),
      })
    );
  });

  it('removes orphan Hot picks before deleting demoted members', async () => {
    const { repository, tx } = createHarness();
    const orphanMemberKeys = [
      { integrationId: 'integration-a', counterpartyExternalId: 'lead-1' },
      { integrationId: 'integration-b', counterpartyExternalId: 'lead-2' },
    ];
    tx.channelAudienceLeadBridge.findMany.mockResolvedValue([
      { integrationId: 'integration-a' },
      { integrationId: 'integration-b' },
    ]);
    tx.channelAudienceLeadBridge.deleteMany.mockResolvedValue({ count: 2 });
    tx.channelAudienceMember.findMany.mockResolvedValue([
      { integrationId: 'integration-a', externalId: 'lead-1' },
      { integrationId: 'integration-b', externalId: 'lead-2' },
    ]);
    tx.channelAudienceMember.deleteMany.mockResolvedValue({ count: 2 });
    tx.channelAudienceHotPick.deleteMany.mockResolvedValue({ count: 3 });

    await expect(repository.clearAllDiscoveredLeads()).resolves.toEqual({
      bridgesDeleted: 2,
      orphansDeleted: 2,
      integrationIds: ['integration-a', 'integration-b'],
    });

    expect(tx.channelAudienceHotPick.deleteMany).toHaveBeenCalledWith({
      where: { OR: orphanMemberKeys },
    });
    expect(
      tx.channelAudienceHotPick.deleteMany.mock.invocationCallOrder[0]
    ).toBeLessThan(
      tx.channelAudienceMember.deleteMany.mock.invocationCallOrder[0]
    );
    expect(tx.channelAudienceHotPick.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('filters leads by username or name when search is set', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([]);

    await repository.getAudienceLeads({
      organizationId: 'org',
      integrationId: 'integration',
      userId: 'user-a',
      direction: 'desc',
      limit: 24,
      search: 'alex',
    });

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          integrationId: 'integration',
          membershipState: {
            in: [
              ChannelAudienceMembership.UNKNOWN,
              ChannelAudienceMembership.NOT_FOLLOWER,
            ],
          },
          OR: [
            { inboundInteractionCount: { gt: 0 } },
            { leadBridgesAsLead: { some: {} } },
            {
              leadFitFeedbacks: {
                some: { source: 'lead_add', verdict: 'accepted' },
              },
            },
          ],
          weFollowedAt: null,
          triageIgnores: {
            none: expect.objectContaining({
              triage: 'lead',
              OR: expect.any(Array),
            }),
          },
          AND: expect.arrayContaining([
            {
              OR: [
                { username: { contains: 'alex', mode: 'insensitive' } },
                { name: { contains: 'alex', mode: 'insensitive' } },
              ],
            },
            { ignoredAt: null },
            excludeActiveListMembership,
          ]),
        },
      })
    );
  });

  it('uses createdAt keyset pagination for leads', async () => {
    const { repository } = createHarness();

    expect(
      (repository as any).leadCreatedKeyset(
        {
          createdAt: '2026-08-14T12:00:00.000Z',
          externalId: 'lead-1',
        },
        'desc'
      )
    ).toEqual({
      OR: [
        { createdAt: { lt: new Date('2026-08-14T12:00:00.000Z') } },
        {
          createdAt: new Date('2026-08-14T12:00:00.000Z'),
          externalId: { lt: 'lead-1' },
        },
      ],
    });
  });

  it('lists cultivate candidates excluding hot, bots, ignored, and recent outbound', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([
      {
        externalId: 'warm-1',
        username: 'warm',
        name: 'Warm',
        relationshipGrade: 4,
        relationshipTriage: 'mutual',
        lastOutboundAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);

    await expect(
      repository.listCultivateCandidates({
        organizationId: 'org',
        integrationId: 'integration',
        now: new Date('2026-08-21T12:00:00.000Z'),
        take: 50,
      })
    ).resolves.toEqual([
      {
        externalId: 'warm-1',
        username: 'warm',
        name: 'Warm',
        relationshipGrade: 4,
        relationshipTriage: 'mutual',
        lastOutboundAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          integrationId: 'integration',
          membershipState: ChannelAudienceMembership.FOLLOWER,
          ignoredAt: null,
          NOT: { relationshipTriage: 'hot_lead' },
          triageIgnores: {
            none: expect.objectContaining({
              triage: 'cultivate',
              OR: expect.any(Array),
            }),
          },
        }),
        take: 50,
      })
    );
  });

  it('ranks cultivate candidates by stale age then grade with hour-seeded rotation', () => {
    const { repository } = createHarness();
    const now = new Date('2026-08-21T12:00:00.000Z');
    const ranked = repository.rankCultivateCandidates(
      [
        {
          externalId: 'fresh',
          lastOutboundAt: new Date('2026-08-01T00:00:00.000Z'),
          relationshipGrade: 5,
          relationshipTriage: 'mutual',
        },
        {
          externalId: 'stale',
          lastOutboundAt: null,
          relationshipGrade: 3.5,
          relationshipTriage: 'mutual',
        },
      ],
      '2026-08-21T12',
      now
    );

    expect(ranked[0].externalId).toBe('stale');
    expect(ranked[0].finalRank).toBe(1);
    expect(ranked[0].rulesReason).toContain('No outbound attention yet');
    expect(ranked[1].externalId).toBe('fresh');
    expect(ranked[1].finalRank).toBe(2);
    expect(
      repository.rankCultivateCandidates(
        [
          {
            externalId: 'quiet-1',
            lastOutboundAt: null,
            relationshipGrade: 2,
            relationshipTriage: 'quiet',
          },
        ],
        '2026-08-21T12',
        now
      )[0].rulesReason
    ).toContain('quiet relationship');
  });

  it('reads materialized cultivate picks when present for the hour', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceCultivatePickBatch.findUnique.mockResolvedValue({
      hour: '2026-08-21T12',
      strategyId: 'grow_audience',
      strategyVersion: 1,
      materializationVersion: 1,
    });
    tx.channelAudienceCultivatePick.findMany.mockResolvedValue([
      {
        finalRank: 1,
        rulesRank: 1,
        rulesReason: 'No outbound attention in 20 days · mutual relationship',
        aiReason: null,
        suggestedAction: null,
        source: 'rules',
        counterpartyExternalId: 'warm-1',
        audienceMember: {
          externalId: 'warm-1',
          name: 'Warm',
          username: 'warm',
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
        },
      },
    ]);

    await expect(
      repository.getAudienceCultivate({
        organizationId: 'org',
        integrationId: 'integration',
        strategyId: 'grow_audience',
        strategyVersion: 1,
        materializationVersion: 1,
        direction: 'asc',
        limit: 24,
        now: new Date('2026-08-21T12:30:00.000Z'),
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          externalId: 'warm-1',
          finalRank: 1,
          cultivateReason:
            'No outbound attention in 20 days · mutual relationship',
          cultivateSource: 'rules',
        }),
      ],
      hasMore: false,
      source: 'materialized',
      hour: '2026-08-21T12',
    });
  });

  it('lists cultivate fallback candidates as mutual or quiet without stale cutoff', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([
      {
        externalId: 'quiet-1',
        username: 'quiet',
        name: 'Quiet',
        relationshipGrade: 2,
        relationshipTriage: 'quiet',
        lastOutboundAt: new Date('2026-08-20T00:00:00.000Z'),
      },
    ]);

    await expect(
      repository.listCultivateFallbackCandidates({
        organizationId: 'org',
        integrationId: 'integration',
        take: 10,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        externalId: 'quiet-1',
        relationshipTriage: 'quiet',
      }),
    ]);

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          integrationId: 'integration',
          membershipState: ChannelAudienceMembership.FOLLOWER,
          ignoredAt: null,
          NOT: { relationshipTriage: 'hot_lead' },
          relationshipTriage: { in: ['mutual', 'quiet'] },
        }),
        take: 10,
      })
    );
  });

  it('due-lists cultivate channels with primary or fallback members and retries empty hour batches', async () => {
    const { repository, integrationFindMany } = createHarness();
    integrationFindMany.mockResolvedValue([
      {
        id: 'integration-a',
        organizationId: 'org',
        providerIdentifier: 'x',
      },
    ]);

    await expect(
      repository.listCultivateMaterializeCandidates(
        undefined,
        8,
        '2026-08-21T12'
      )
    ).resolves.toEqual({
      candidates: [
        {
          id: 'integration-a',
          organizationId: 'org',
          providerIdentifier: 'x',
        },
      ],
      next: undefined,
    });

    expect(integrationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channelAudienceMembers: {
            some: {
              OR: [
                expect.objectContaining({
                  membershipState: ChannelAudienceMembership.FOLLOWER,
                }),
                expect.objectContaining({
                  relationshipTriage: { in: ['mutual', 'quiet'] },
                }),
              ],
            },
          },
          channelAudienceCultivatePickBatches: {
            none: { hour: '2026-08-21T12', pickCount: { gt: 0 } },
          },
        }),
      })
    );
  });

  it('serves quiet cultivate fallback picks without primary warm+stale filter', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceCultivatePickBatch.findUnique.mockResolvedValue({
      hour: '2026-08-21T12',
      strategyId: 'grow_audience',
      strategyVersion: 1,
      materializationVersion: 1,
    });
    tx.channelAudienceCultivatePick.findMany.mockResolvedValue([
      {
        finalRank: 1,
        rulesRank: 1,
        rulesReason: 'No outbound attention yet · quiet relationship',
        aiReason: null,
        suggestedAction: null,
        source: 'rules',
        counterpartyExternalId: 'quiet-1',
        audienceMember: {
          externalId: 'quiet-1',
          name: 'Quiet',
          username: 'quiet',
          picture: null,
          profileUrl: null,
          bio: null,
          followersCount: null,
          followingCount: null,
          followedAt: null,
          accountCreatedAt: null,
        },
      },
    ]);

    await expect(
      repository.getAudienceCultivate({
        organizationId: 'org',
        integrationId: 'integration',
        strategyId: 'grow_audience',
        strategyVersion: 1,
        materializationVersion: 1,
        direction: 'asc',
        limit: 24,
        now: new Date('2026-08-21T12:30:00.000Z'),
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          externalId: 'quiet-1',
          cultivateReason: 'No outbound attention yet · quiet relationship',
        }),
      ],
      hasMore: false,
      source: 'materialized',
      hour: '2026-08-21T12',
    });

    expect(tx.channelAudienceCultivatePick.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          audienceMember: expect.objectContaining({
            AND: expect.arrayContaining([
              {
                OR: [
                  expect.objectContaining({ AND: expect.any(Array) }),
                  { relationshipTriage: { in: ['mutual', 'quiet'] } },
                ],
              },
            ]),
          }),
        }),
      })
    );
  });

  it('filters note-count followers by username or name when search is set', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([]);

    await repository.getFollowersByNoteCount({
      organizationId: 'org',
      integrationId: 'integration',
      userId: 'user-a',
      direction: 'desc',
      limit: 24,
      search: 'alice',
    });

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          integrationId: 'integration',
          membershipState: ChannelAudienceMembership.FOLLOWER,
          AND: expect.arrayContaining([
            {
              OR: [
                { username: { contains: 'alice', mode: 'insensitive' } },
                { name: { contains: 'alice', mode: 'insensitive' } },
              ],
            },
            { ignoredAt: null },
          ]),
        },
      })
    );
  });

  it('queries synced audience members for search with keyset pagination', async () => {
    const { repository, tx, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([
      {
        externalId: 'person-2',
        name: 'Alice Two',
        username: 'alice2',
        followedAt: new Date('2026-08-12T12:00:00.000Z'),
      },
      {
        externalId: 'person-1',
        name: 'Alice One',
        username: 'alice1',
        followedAt: new Date('2026-08-11T12:00:00.000Z'),
      },
      {
        externalId: 'person-0',
        name: 'Alice Zero',
        username: 'alice0',
        followedAt: new Date('2026-08-10T12:00:00.000Z'),
      },
    ]);

    await expect(
      repository.getAudienceFollowers({
        organizationId: 'org',
        integrationId: 'integration',
        userId: 'user-a',
        search: 'alice',
        sortField: 'followedAt',
        direction: 'desc',
        limit: 2,
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({ externalId: 'person-2' }),
        expect.objectContaining({ externalId: 'person-1' }),
      ],
      hasMore: true,
    });

    expect(tx.integration.findFirst).toHaveBeenCalled();
    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          integrationId: 'integration',
          membershipState: ChannelAudienceMembership.FOLLOWER,
          AND: expect.arrayContaining([
            {
              OR: [
                { username: { contains: 'alice', mode: 'insensitive' } },
                { name: { contains: 'alice', mode: 'insensitive' } },
              ],
            },
            { ignoredAt: null },
          ]),
        },
        orderBy: [{ followedAt: 'desc' }, { externalId: 'desc' }],
        take: 3,
      })
    );

    expect(
      (repository as any).audienceFollowerKeyset(
        {
          sortField: 'followedAt',
          sortValue: '2026-08-11T12:00:00.000Z',
          externalId: 'person-1',
        },
        'desc'
      )
    ).toEqual({
      OR: [
        { followedAt: { lt: new Date('2026-08-11T12:00:00.000Z') } },
        {
          followedAt: new Date('2026-08-11T12:00:00.000Z'),
          externalId: { lt: 'person-1' },
        },
      ],
    });
  });

  it('queries recent followers by followedAt window with keyset pagination', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    const since = new Date('2026-07-15T00:00:00.000Z');
    audienceMemberFindMany.mockResolvedValue([
      {
        externalId: 'person-2',
        followedAt: new Date('2026-08-12T12:00:00.000Z'),
        lastOutboundAt: null,
      },
      {
        externalId: 'person-1',
        followedAt: new Date('2026-08-11T12:00:00.000Z'),
        lastOutboundAt: new Date('2026-08-10T12:00:00.000Z'),
      },
      {
        externalId: 'person-0',
        followedAt: new Date('2026-08-10T12:00:00.000Z'),
        lastOutboundAt: null,
      },
    ]);

    await expect(
      repository.getRecentFollowers({
        organizationId: 'org',
        integrationId: 'integration',
        userId: 'user-a',
        since,
        limit: 2,
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({ externalId: 'person-2' }),
        expect.objectContaining({ externalId: 'person-1' }),
      ],
      hasMore: true,
    });

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          integrationId: 'integration',
          membershipState: ChannelAudienceMembership.FOLLOWER,
          ignoredAt: null,
          followedAt: { gte: since },
        },
        orderBy: [{ followedAt: 'desc' }, { externalId: 'desc' }],
        take: 3,
        select: expect.objectContaining({
          followedAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
        }),
      })
    );
  });

  it('applies recent-follower keyset when a cursor is provided', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([]);

    await repository.getRecentFollowers({
      organizationId: 'org',
      integrationId: 'integration',
      since: new Date('2026-07-01T00:00:00.000Z'),
      limit: 24,
      cursor: {
        followedAt: '2026-08-11T12:00:00.000Z',
        externalId: 'person-1',
      },
    });

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { followedAt: { lt: new Date('2026-08-11T12:00:00.000Z') } },
            {
              followedAt: new Date('2026-08-11T12:00:00.000Z'),
              externalId: { lt: 'person-1' },
            },
          ],
        }),
      })
    );
  });

  it('loads note, like, and grade fields for a follower page in one member query', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([
      {
        externalId: 'person-1',
        noteCount: 2,
        likesCount: 4,
        relationshipGrade: 3.5,
        relationshipEffortScore: 4,
        relationshipReciprocationScore: 12,
        relationshipNetGap: 8,
        relationshipTriage: 'hot_lead',
        relationshipFormulaVersion: 2,
        relationshipSnapshotAt: new Date('2026-08-12T12:00:00.000Z'),
        personalGrades: [{ grade: 5 }],
      },
    ]);

    await expect(
      repository.getFollowerNoteCounts(
        'org',
        'integration',
        ['person-1'],
        'user-a'
      )
    ).resolves.toEqual(
      new Map([
        [
          'person-1',
          {
            noteCount: 2,
            likesCount: 4,
            relationshipGrade: 3.5,
            myGrade: 5,
            relationshipEffortScore: 4,
            relationshipReciprocationScore: 12,
            relationshipNetGap: 8,
            relationshipTriage: 'hot_lead',
            relationshipFormulaVersion: 2,
            relationshipSnapshotAt: new Date('2026-08-12T12:00:00.000Z'),
            listIds: [],
            ignoredTriages: [],
            ignoredAt: null,
          },
        ],
      ])
    );
    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          integrationId: 'integration',
          externalId: { in: ['person-1'] },
        },
        select: expect.objectContaining({
          relationshipGrade: true,
          relationshipEffortScore: true,
          relationshipReciprocationScore: true,
          relationshipNetGap: true,
          relationshipTriage: true,
          ignoredAt: true,
          personalGrades: expect.objectContaining({
            where: { userId: 'user-a' },
          }),
        }),
      })
    );
  });

  it('omits personal-grade selection for actorless follower reads', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([
      {
        externalId: 'person-1',
        noteCount: 0,
        likesCount: 0,
        relationshipGrade: null,
        relationshipEffortScore: null,
        relationshipReciprocationScore: null,
        relationshipNetGap: null,
        relationshipTriage: null,
        relationshipFormulaVersion: null,
        relationshipSnapshotAt: null,
        listMemberships: [],
        triageIgnores: [],
        ignoredAt: null,
      },
    ]);

    await expect(
      repository.getFollowerNoteCounts('org', 'integration', ['person-1'])
    ).resolves.toEqual(
      new Map([['person-1', expect.objectContaining({ myGrade: null })]])
    );
    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          personalGrades: expect.anything(),
        }),
      })
    );
  });

  it('ranks followers by relationship grade with ungraded values last', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([
      { externalId: 'person-2', relationshipGrade: 5 },
      { externalId: 'person-1', relationshipGrade: 3 },
      { externalId: 'person-0', relationshipGrade: null },
    ]);

    await expect(
      repository.getFollowersByRelationshipGrade({
        organizationId: 'org',
        integrationId: 'integration',
        userId: 'user-a',
        direction: 'desc',
        limit: 2,
      })
    ).resolves.toEqual({
      items: [
        { externalId: 'person-2', relationshipGrade: 5 },
        { externalId: 'person-1', relationshipGrade: 3 },
      ],
      hasMore: true,
    });
    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { relationshipGrade: { sort: 'desc', nulls: 'last' } },
          { externalId: 'desc' },
        ],
        take: 3,
      })
    );
    expect(
      (repository as any).nullableGradeFollowerKeyset(
        { grade: 3, externalId: 'person-1' },
        'desc',
        'relationshipGrade'
      )
    ).toEqual({
      OR: [
        { relationshipGrade: { lt: 3 } },
        { relationshipGrade: 3, externalId: { lt: 'person-1' } },
        { relationshipGrade: null },
      ],
    });
  });

  it('ranks followers by the current user personal grade then ungraded members', async () => {
    const { repository, tx, audienceMemberFindMany } = createHarness();
    tx.channelAudienceMemberGrade.findMany.mockResolvedValue([
      {
        grade: 5,
        audienceMember: {
          externalId: 'person-2',
          relationshipGrade: 4,
          personalGrades: [{ grade: 5 }],
        },
      },
    ]);
    audienceMemberFindMany.mockResolvedValue([
      {
        externalId: 'person-0',
        relationshipGrade: null,
        personalGrades: [],
      },
    ]);

    await expect(
      repository.getFollowersByMyGrade({
        organizationId: 'org',
        integrationId: 'integration',
        userId: 'user-a',
        direction: 'desc',
        limit: 2,
      })
    ).resolves.toEqual({
      items: [
        {
          externalId: 'person-2',
          relationshipGrade: 4,
          personalGrades: [{ grade: 5 }],
        },
        {
          externalId: 'person-0',
          relationshipGrade: null,
          personalGrades: [],
        },
      ],
      hasMore: false,
    });
    expect(tx.channelAudienceMemberGrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-a',
        }),
        orderBy: [{ grade: 'desc' }, { counterpartyExternalId: 'desc' }],
        take: 3,
      })
    );
  });

  it.each(['hot_lead', 'mutual', 'over_invested', 'quiet'] as const)(
    'filters the complete audience by denormalized %s triage',
    async (triage) => {
      const { repository, audienceMemberFindMany } = createHarness();
      audienceMemberFindMany.mockResolvedValue([]);
      const expectedTriageFilter =
        triage === 'hot_lead'
          ? {
              OR: [
                { relationshipTriage: 'hot_lead' },
                {
                  relationshipReciprocationScore: { gt: 0 },
                  relationshipEffortScore: 0,
                },
              ],
              triageIgnores: {
                none: expect.objectContaining({
                  triage: { in: ['hot_lead', 'engaged_not_yet'] },
                  OR: expect.any(Array),
                }),
              },
            }
          : {
              relationshipTriage: triage,
              triageIgnores: {
                none: expect.objectContaining({
                  triage,
                  OR: expect.any(Array),
                }),
              },
            };

      await repository.getAudienceFollowers({
        organizationId: 'org',
        integrationId: 'integration',
        userId: 'user-a',
        sortField: 'followedAt',
        direction: 'desc',
        limit: 24,
        triage,
      });

      expect(audienceMemberFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expectedTriageFilter,
              { ignoredAt: null },
            ]),
          }),
        })
      );
    }
  );

  it('upserts an audience triage ignore for an existing member', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst.mockResolvedValue({
      externalId: 'person-1',
      name: null,
      username: null,
      bio: null,
      followersCount: null,
      followingCount: null,
      leadFitScore: null,
      leadFitReason: null,
      leadFitMatchedTopics: null,
    });
    tx.channelAudienceMemberTriageIgnore.upsert.mockResolvedValue({});

    await expect(
      repository.addAudienceTriageIgnore(
        'org',
        'integration',
        'person-1',
        'hot_lead',
        'user-a'
      )
    ).resolves.toEqual({ ok: true });

    expect(tx.channelAudienceMemberTriageIgnore.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_integrationId_counterpartyExternalId_triage: {
          organizationId: 'org',
          integrationId: 'integration',
          counterpartyExternalId: 'person-1',
          triage: 'hot_lead',
        },
      },
      create: {
        organizationId: 'org',
        integrationId: 'integration',
        counterpartyExternalId: 'person-1',
        triage: 'hot_lead',
        expiresAt: null,
        createdByUserId: 'user-a',
      },
      update: {
        expiresAt: null,
      },
    });
    expect(tx.channelAudienceLeadFitFeedback.upsert).not.toHaveBeenCalled();
  });

  it('snoozes an audience triage badge for seven days', async () => {
    const { repository, tx } = createHarness();
    const now = new Date('2026-08-23T12:00:00.000Z');
    jest.useFakeTimers();
    jest.setSystemTime(now);
    tx.channelAudienceMember.findFirst.mockResolvedValue({
      externalId: 'person-1',
      name: null,
      username: null,
      bio: null,
      followersCount: null,
      followingCount: null,
      leadFitScore: null,
      leadFitReason: null,
      leadFitMatchedTopics: null,
    });
    tx.channelAudienceMemberTriageIgnore.upsert.mockResolvedValue({});

    await expect(
      repository.addAudienceTriageIgnore(
        'org',
        'integration',
        'person-1',
        'hot_lead',
        'user-a',
        undefined,
        { snooze: true }
      )
    ).resolves.toEqual({ ok: true });

    expect(tx.channelAudienceMemberTriageIgnore.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_integrationId_counterpartyExternalId_triage: {
          organizationId: 'org',
          integrationId: 'integration',
          counterpartyExternalId: 'person-1',
          triage: 'hot_lead',
        },
      },
      create: {
        organizationId: 'org',
        integrationId: 'integration',
        counterpartyExternalId: 'person-1',
        triage: 'hot_lead',
        expiresAt: new Date('2026-08-30T12:00:00.000Z'),
        createdByUserId: 'user-a',
      },
      update: {
        expiresAt: new Date('2026-08-30T12:00:00.000Z'),
      },
    });
    jest.useRealTimers();
  });

  it('snapshots rejected lead-fit feedback when dismissing a lead badge', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst.mockResolvedValue({
      externalId: 'person-1',
      name: 'Alex',
      username: 'alex',
      bio: 'NFT coach selling courses',
      followersCount: 100,
      followingCount: 50,
      leadFitScore: 88,
      leadFitReason: 'Looks like a tech lead',
      leadFitMatchedTopics: '["tech"]',
    });
    tx.channelAudienceMemberTriageIgnore.upsert.mockResolvedValue({});

    await expect(
      repository.addAudienceTriageIgnore(
        'org',
        'integration',
        'person-1',
        'lead',
        'user-a',
        ['bio_wording', 'promotional']
      )
    ).resolves.toEqual({ ok: true });

    expect(tx.channelAudienceLeadFitFeedback.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_integrationId_counterpartyExternalId_source: {
            organizationId: 'org',
            integrationId: 'integration',
            counterpartyExternalId: 'person-1',
            source: 'lead_dismiss',
          },
        },
        create: expect.objectContaining({
          source: 'lead_dismiss',
          verdict: 'rejected',
          reasons: JSON.stringify(['bio_wording', 'promotional']),
          bio: 'NFT coach selling courses',
          createdByUserId: 'user-a',
        }),
      })
    );
  });

  it('returns missing member when ignoring triage for an unknown follower', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst.mockResolvedValue(null);

    await expect(
      repository.addAudienceTriageIgnore(
        'org',
        'integration',
        'missing',
        'hot_lead',
        'user-a'
      )
    ).resolves.toEqual({ missing: 'member' });
    expect(tx.channelAudienceMemberTriageIgnore.upsert).not.toHaveBeenCalled();
  });

  it('treats engaged-not-yet as a Hot alias including unreciprocated inbound', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([]);

    await repository.getAudienceFollowers({
      organizationId: 'org',
      integrationId: 'integration',
      userId: 'user-a',
      sortField: 'followedAt',
      direction: 'desc',
      limit: 24,
      triage: 'engaged_not_yet',
    });

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { relationshipTriage: 'hot_lead' },
                {
                  relationshipReciprocationScore: { gt: 0 },
                  relationshipEffortScore: 0,
                },
              ],
              triageIgnores: {
                none: expect.objectContaining({
                  triage: { in: ['hot_lead', 'engaged_not_yet'] },
                  OR: expect.any(Array),
                }),
              },
            },
            { ignoredAt: null },
          ]),
        }),
      })
    );
  });

  it('filters Hot with stored hot_lead or unreciprocated inbound scores', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([]);

    await repository.getAudienceFollowers({
      organizationId: 'org',
      integrationId: 'integration',
      userId: 'user-a',
      sortField: 'followedAt',
      direction: 'desc',
      limit: 24,
      triage: 'hot_lead',
    });

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { relationshipTriage: 'hot_lead' },
                {
                  relationshipReciprocationScore: { gt: 0 },
                  relationshipEffortScore: 0,
                },
              ],
              triageIgnores: {
                none: expect.objectContaining({
                  triage: { in: ['hot_lead', 'engaged_not_yet'] },
                  OR: expect.any(Array),
                }),
              },
            },
            { ignoredAt: null },
          ]),
        }),
      })
    );
  });

  it.each([
    ['relationshipReciprocationScore', 'asc'],
    ['relationshipNetGap', 'desc'],
  ] as const)(
    'sorts and pages nullable projection %s %s',
    async (field, direction) => {
      const { repository, audienceMemberFindMany } = createHarness();
      audienceMemberFindMany.mockResolvedValue([]);

      await repository.getFollowersByProjectedField({
        organizationId: 'org',
        integrationId: 'integration',
        userId: 'user-a',
        field,
        direction,
        limit: 2,
        cursor: { value: 8, externalId: 'person-2' },
      });

      expect(audienceMemberFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { [field]: { sort: direction, nulls: 'last' } },
            { externalId: direction },
          ],
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { ignoredAt: null },
              {
                OR: [
                  { [field]: { [direction === 'desc' ? 'lt' : 'gt']: 8 } },
                  {
                    [field]: 8,
                    externalId: {
                      [direction === 'desc' ? 'lt' : 'gt']: 'person-2',
                    },
                  },
                  { [field]: null },
                ],
              },
            ]),
          }),
        })
      );
    }
  );

  it('excludes stale formulas from priority-grade sorting', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([]);

    await repository.getFollowersByRelationshipGrade({
      organizationId: 'org',
      integrationId: 'integration',
      userId: 'user-a',
      direction: 'desc',
      limit: 24,
    });

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { relationshipFormulaVersion: RELATIONSHIP_FORMULA_VERSION },
            { ignoredAt: null },
          ]),
        }),
      })
    );
  });

  it('filters audience members by custom list membership', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([]);

    await repository.getAudienceFollowers({
      organizationId: 'org',
      integrationId: 'integration',
      userId: 'user-a',
      sortField: 'followedAt',
      direction: 'desc',
      limit: 24,
      listId: 'list-1',
    });

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              listMemberships: {
                some: {
                  listId: 'list-1',
                  list: { deletedAt: null },
                },
              },
            },
            { ignoredAt: null },
          ]),
        }),
      })
    );
    expect(audienceMemberFindMany.mock.calls[0][0].where).not.toHaveProperty(
      'membershipState'
    );
  });

  it('sets ignoredAt when ignoring an audience member', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst.mockResolvedValue({
      externalId: 'person-1',
      ignoredAt: null,
    });
    tx.channelAudienceMember.update.mockResolvedValue({});

    await expect(
      repository.setAudienceMemberIgnored(
        'org',
        'integration',
        'person-1',
        'user-a'
      )
    ).resolves.toEqual({ ok: true });
    expect(tx.channelAudienceMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId_externalId: {
            integrationId: 'integration',
            externalId: 'person-1',
          },
        },
        data: expect.objectContaining({
          ignoredByUserId: 'user-a',
          ignoredAt: expect.any(Date),
        }),
      })
    );
  });

  it('returns missing member when ignoring an unknown follower', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst.mockResolvedValue(null);

    await expect(
      repository.setAudienceMemberIgnored(
        'org',
        'integration',
        'missing',
        'user-a'
      )
    ).resolves.toEqual({ missing: 'member' });
    expect(tx.channelAudienceMember.update).not.toHaveBeenCalled();
  });

  it('clears ignoredAt when unignoring an audience member', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst.mockResolvedValue({
      externalId: 'person-1',
    });
    tx.channelAudienceMember.update.mockResolvedValue({});

    await expect(
      repository.clearAudienceMemberIgnored('org', 'integration', 'person-1')
    ).resolves.toEqual({ ok: true });
    expect(tx.channelAudienceMember.update).toHaveBeenCalledWith({
      where: {
        integrationId_externalId: {
          integrationId: 'integration',
          externalId: 'person-1',
        },
      },
      data: {
        ignoredAt: null,
        ignoredByUserId: null,
      },
    });
  });

  it('lists only ignored followers for the ignored audience view', async () => {
    const { repository, audienceMemberFindMany } = createHarness();
    audienceMemberFindMany.mockResolvedValue([]);

    await repository.getIgnoredAudienceFollowers({
      organizationId: 'org',
      integrationId: 'integration',
      userId: 'user-a',
      direction: 'desc',
      limit: 24,
    });

    expect(audienceMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          membershipState: ChannelAudienceMembership.FOLLOWER,
          AND: [{ ignoredAt: { not: null } }],
        }),
        orderBy: [{ ignoredAt: 'desc' }, { externalId: 'desc' }],
      })
    );
  });

  it('creates a custom list when the name is unique', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceList.findFirst.mockResolvedValue(null);
    tx.channelAudienceList.create.mockResolvedValue({
      id: 'list-1',
      name: 'VIP',
      color: 'blue',
      createdAt: new Date('2026-08-15T00:00:00.000Z'),
      updatedAt: new Date('2026-08-15T00:00:00.000Z'),
    });

    await expect(
      repository.createAudienceList(
        'org',
        'integration',
        'VIP',
        'user-a',
        'blue'
      )
    ).resolves.toEqual({
      conflict: false,
      list: expect.objectContaining({
        id: 'list-1',
        name: 'VIP',
        color: 'blue',
      }),
    });
  });

  it('updates list color when renaming a custom list', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceList.findFirst
      .mockResolvedValueOnce({ id: 'list-1' })
      .mockResolvedValueOnce(null);
    tx.channelAudienceList.update.mockResolvedValue({
      id: 'list-1',
      name: 'VIP',
      color: 'green',
      createdAt: new Date('2026-08-15T00:00:00.000Z'),
      updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    });

    await expect(
      repository.updateAudienceList(
        'org',
        'integration',
        'list-1',
        'VIP',
        'green'
      )
    ).resolves.toEqual({
      list: expect.objectContaining({ id: 'list-1', color: 'green' }),
    });
  });

  it('rejects duplicate list names on the same channel', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceList.findFirst.mockResolvedValue({ id: 'list-1' });

    await expect(
      repository.createAudienceList('org', 'integration', 'VIP', 'user-a')
    ).resolves.toEqual({ conflict: true });
  });

  it('upserts list membership for an audience member', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceList.findFirst.mockResolvedValue({ id: 'list-1' });
    tx.channelAudienceMember.findFirst.mockResolvedValue({
      externalId: 'person-1',
      name: 'Alex',
      username: 'alex',
      bio: 'Builds tools',
      followersCount: 10,
      followingCount: 5,
      leadFitScore: 70,
      leadFitReason: 'Good fit',
      leadFitMatchedTopics: '["tech"]',
    });
    tx.channelAudienceListMember.upsert.mockResolvedValue({});

    await expect(
      repository.addAudienceListMember(
        'org',
        'integration',
        'list-1',
        'person-1',
        'user-a'
      )
    ).resolves.toEqual({ ok: true });
    expect(tx.channelAudienceListMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          listId_counterpartyExternalId: {
            listId: 'list-1',
            counterpartyExternalId: 'person-1',
          },
        },
      })
    );
    expect(tx.channelAudienceLeadFitFeedback.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: 'list_add',
          verdict: 'accepted',
          reasons: '[]',
          bio: 'Builds tools',
          listId: 'list-1',
          createdByUserId: 'user-a',
        }),
      })
    );
  });

  it('imports a profile into the audience and adds list membership', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceList.findFirst.mockResolvedValue({ id: 'list-1' });
    tx.channelAudienceMember.upsert.mockResolvedValue({});
    tx.channelAudienceMember.findFirst.mockResolvedValue({
      externalId: '42',
      name: 'Harbor',
      username: 'HarborClient',
      bio: null,
      followersCount: null,
      followingCount: null,
      leadFitScore: null,
      leadFitReason: null,
      leadFitMatchedTopics: null,
    });
    tx.channelAudienceListMember.upsert.mockResolvedValue({});

    await expect(
      repository.upsertImportedAudienceMemberAndAddToList(
        'org',
        'integration',
        'list-1',
        {
          externalId: '42',
          name: 'Harbor',
          username: 'HarborClient',
          profileUrl: 'https://x.com/HarborClient',
        },
        'user-a'
      )
    ).resolves.toEqual({
      ok: true,
      member: {
        externalId: '42',
        name: 'Harbor',
        username: 'HarborClient',
      },
    });
    expect(tx.channelAudienceMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId_externalId: {
            integrationId: 'integration',
            externalId: '42',
          },
        },
        create: expect.objectContaining({
          organizationId: 'org',
          integrationId: 'integration',
          externalId: '42',
          name: 'Harbor',
          username: 'HarborClient',
          profileUrl: 'https://x.com/HarborClient',
        }),
        update: expect.objectContaining({
          name: 'Harbor',
          username: 'HarborClient',
          profileUrl: 'https://x.com/HarborClient',
        }),
      })
    );
    expect(
      tx.channelAudienceMember.upsert.mock.calls[0][0].create
    ).not.toHaveProperty('membershipState');
    expect(tx.channelAudienceListMember.upsert).toHaveBeenCalled();
  });

  it('imports a profile as a manual lead without list membership', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        externalId: '42',
        name: 'Harbor',
        username: 'HarborClient',
        bio: null,
        followersCount: null,
        followingCount: null,
        leadFitScore: null,
        leadFitReason: null,
        leadFitMatchedTopics: null,
      });
    tx.channelAudienceMember.upsert.mockResolvedValue({});
    tx.channelAudienceMemberTriageIgnore.deleteMany.mockResolvedValue({
      count: 1,
    });

    await expect(
      repository.upsertImportedAudienceMemberAsLead(
        'org',
        'integration',
        {
          externalId: '42',
          name: 'Harbor',
          username: 'HarborClient',
          profileUrl: 'https://x.com/HarborClient',
        },
        'user-a'
      )
    ).resolves.toEqual({
      ok: true,
      member: {
        externalId: '42',
        name: 'Harbor',
        username: 'HarborClient',
      },
    });
    expect(tx.channelAudienceMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organizationId: 'org',
          integrationId: 'integration',
          externalId: '42',
          name: 'Harbor',
          username: 'HarborClient',
          profileUrl: 'https://x.com/HarborClient',
          createdAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          name: 'Harbor',
          username: 'HarborClient',
          profileUrl: 'https://x.com/HarborClient',
          createdAt: expect.any(Date),
        }),
      })
    );
    expect(
      tx.channelAudienceMemberTriageIgnore.deleteMany
    ).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        counterpartyExternalId: '42',
        triage: 'lead',
      },
    });
    expect(tx.channelAudienceLeadFitFeedback.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: 'lead_add',
          verdict: 'accepted',
          createdByUserId: 'user-a',
        }),
      })
    );
    expect(tx.channelAudienceListMember.upsert).not.toHaveBeenCalled();
  });

  it('rejects importing a follower or followed profile as a lead', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findFirst.mockResolvedValue({
      externalId: '42',
      membershipState: ChannelAudienceMembership.FOLLOWER,
      weFollowedAt: null,
    });

    await expect(
      repository.upsertImportedAudienceMemberAsLead('org', 'integration', {
        externalId: '42',
        name: 'Harbor',
        username: 'HarborClient',
      })
    ).resolves.toEqual({ rejected: 'already_audience' });
    expect(tx.channelAudienceMember.upsert).not.toHaveBeenCalled();
  });

  it('lists lead-fit feedback examples and drops accepted rows that were also rejected', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceLeadFitFeedback.findMany
      .mockResolvedValueOnce([
        {
          counterpartyExternalId: 'reject-1',
          name: 'Bad Fit',
          username: 'bad',
          bio: 'NFT coach',
          reasons: '["bio_wording"]',
        },
      ])
      .mockResolvedValueOnce([
        {
          counterpartyExternalId: 'reject-1',
          name: 'Bad Fit',
          username: 'bad',
          bio: 'NFT coach',
          reasons: '[]',
        },
        {
          counterpartyExternalId: 'accept-1',
          name: 'Good Fit',
          username: 'good',
          bio: 'Open source maintainer',
          reasons: '[]',
        },
      ]);

    await expect(
      repository.listLeadFitFeedbackExamples({
        organizationId: 'org',
        integrationId: 'integration',
        limit: 8,
      })
    ).resolves.toEqual({
      rejected: [
        expect.objectContaining({
          counterpartyExternalId: 'reject-1',
          reasons: ['bio_wording'],
        }),
      ],
      accepted: [
        expect.objectContaining({
          counterpartyExternalId: 'accept-1',
          bio: 'Open source maintainer',
        }),
      ],
    });
  });

  it('includes outdated lead-fit versions in unscored lead candidate queries', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findMany.mockResolvedValue([]);

    await repository.listUnscoredLeadCandidatesForIntegration({
      organizationId: 'org',
      integrationId: 'integration',
      limit: 10,
    });

    expect(tx.channelAudienceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { leadFitScoredAt: null },
                { leadFitVersion: null },
                { leadFitVersion: { lt: 2 } },
              ]),
            }),
          ]),
        }),
      })
    );
  });

  it('resolves a unique audience member external id by username', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findMany.mockResolvedValue([
      { externalId: 'person-1' },
    ]);

    await expect(
      repository.findMemberExternalIdByUsername(
        'org',
        'integration',
        'SummerYule'
      )
    ).resolves.toBe('person-1');
    expect(tx.channelAudienceMember.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        username: { equals: 'SummerYule', mode: 'insensitive' },
      },
      select: { externalId: true },
      take: 2,
    });
  });

  it('returns null when a username is missing or duplicated', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceMember.findMany.mockResolvedValue([]);

    await expect(
      repository.findMemberExternalIdByUsername('org', 'integration', 'missing')
    ).resolves.toBeNull();

    tx.channelAudienceMember.findMany.mockResolvedValue([
      { externalId: 'person-1' },
      { externalId: 'person-2' },
    ]);
    await expect(
      repository.findMemberExternalIdByUsername(
        'org',
        'integration',
        'SummerYule'
      )
    ).resolves.toBeNull();
  });

  it('removes only following list members in a bounded batch', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceList.findFirst.mockResolvedValue({ id: 'list-1' });
    tx.channelAudienceListMember.findMany.mockResolvedValue([
      {
        counterpartyExternalId: 'person-1',
        audienceMember: { name: 'Alex', username: 'alex' },
      },
      {
        counterpartyExternalId: 'person-2',
        audienceMember: { name: 'Sam', username: null },
      },
    ]);
    tx.channelAudienceListMember.count.mockResolvedValue(1);

    await expect(
      repository.removeAudienceListMembers('org', 'integration', 'list-1', {
        onlyFollowing: true,
        limit: 50,
      })
    ).resolves.toEqual({
      ok: true,
      removed: [
        { externalId: 'person-1', name: 'Alex', username: 'alex' },
        { externalId: 'person-2', name: 'Sam', username: null },
      ],
      remaining: 1,
      hasMore: true,
    });

    expect(tx.channelAudienceListMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          listId: 'list-1',
          audienceMember: {
            membershipState: ChannelAudienceMembership.FOLLOWER,
          },
        }),
        take: 50,
      })
    );
    expect(tx.channelAudienceListMember.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        listId: 'list-1',
        counterpartyExternalId: { in: ['person-1', 'person-2'] },
      },
    });
  });

  it('removes explicit list member ids and reports no remaining following batch', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceList.findFirst.mockResolvedValue({ id: 'list-1' });
    tx.channelAudienceListMember.findMany.mockResolvedValue([
      {
        counterpartyExternalId: 'person-1',
        audienceMember: { name: 'Alex', username: 'alex' },
      },
    ]);

    await expect(
      repository.removeAudienceListMembers('org', 'integration', 'list-1', {
        externalIds: ['person-1', 'missing'],
      })
    ).resolves.toEqual({
      ok: true,
      removed: [{ externalId: 'person-1', name: 'Alex', username: 'alex' }],
      remaining: 0,
      hasMore: false,
    });
    expect(tx.channelAudienceListMember.count).not.toHaveBeenCalled();
  });

  it('returns missing list when batch-removing from an unknown list', async () => {
    const { repository, tx } = createHarness();
    tx.channelAudienceList.findFirst.mockResolvedValue(null);

    await expect(
      repository.removeAudienceListMembers('org', 'integration', 'missing', {
        onlyFollowing: true,
      })
    ).resolves.toEqual({ missing: 'list' });
    expect(tx.channelAudienceListMember.findMany).not.toHaveBeenCalled();
  });
});

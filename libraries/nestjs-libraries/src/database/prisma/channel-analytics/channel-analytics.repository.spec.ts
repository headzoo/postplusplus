import { ChannelAnalyticsRepository } from './channel-analytics.repository';
import { Prisma } from '@prisma/client';

const createHarness = () => {
  const tx = {
    integration: {
      findFirst: jest.fn().mockResolvedValue({ id: 'integration' }),
    },
    channelAnalyticsDailyPoint: { upsert: jest.fn().mockResolvedValue({}) },
    channelAnalyticsPostMetricSnapshot: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    channelAnalyticsSyncState: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
    },
    post: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const integration = { findMany: jest.fn() };
  const analytics = {
    channelAnalyticsDailyPoint: { findMany: jest.fn(), findFirst: jest.fn() },
    channelAnalyticsPostMetricSnapshot: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    post: { findMany: jest.fn() },
  };
  const repository = new ChannelAnalyticsRepository(
    { model: analytics } as any,
    { model: { integration } } as any,
    { model: { $transaction: jest.fn((callback) => callback(tx)) } } as any
  );
  return { repository, tx, integration, analytics };
};

describe('ChannelAnalyticsRepository', () => {
  it('limits due candidates to caller-approved provider identifiers', async () => {
    const { repository, integration } = createHarness();
    integration.findMany.mockResolvedValue([]);
    await repository.listDueCandidates(
      ['provider-a'],
      new Date('2026-08-15T00:00:00Z')
    );
    expect(integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerIdentifier: { in: ['provider-a'] },
          disabled: false,
          deletedAt: null,
        }),
        orderBy: [
          { channelAnalyticsSyncState: { nextAttemptAt: 'asc' } },
          { id: 'asc' },
        ],
        take: 51,
      })
    );
  });

  it('writes retry-safe daily points under the tenant-owned integration', async () => {
    const { repository, tx } = createHarness();
    await repository.persistDailyPage(
      'org',
      'integration',
      new Date('2026-08-15T12:00:00Z'),
      [
        {
          metricKey: 'views',
          label: 'Views',
          valueMode: 'SUM' as any,
          value: 1,
          day: new Date('2026-08-15T00:00:00Z'),
        },
      ],
      {
        fromDay: new Date('2026-08-01T00:00:00Z'),
        toDay: new Date('2026-08-15T00:00:00Z'),
      }
    );
    expect(tx.channelAnalyticsDailyPoint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId_day_metricKey: {
            integrationId: 'integration',
            day: new Date('2026-08-15T00:00:00Z'),
            metricKey: 'views',
          },
        },
        create: expect.objectContaining({
          currentSnapshotAt: null,
          previousSnapshotAt: null,
        }),
        update: expect.objectContaining({
          currentSnapshotAt: null,
          previousSnapshotAt: null,
        }),
      })
    );
  });

  it('denormalizes like_count onto matching published posts', async () => {
    const { repository, tx } = createHarness();
    const snapshotAt = new Date('2026-08-17T12:00:00Z');
    await repository.persistPostLifetimePage('org', 'integration', snapshotAt, [
      {
        externalPostId: 'tweet-1',
        metricKey: 'like_count',
        label: 'Likes',
        valueMode: 'SUM' as any,
        value: 12,
      },
      {
        externalPostId: 'tweet-1',
        metricKey: 'impression_count',
        label: 'Impressions',
        valueMode: 'SUM' as any,
        value: 100,
      },
    ]);

    expect(tx.channelAnalyticsPostMetricSnapshot.upsert).toHaveBeenCalledTimes(
      2
    );
    expect(tx.post.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.post.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        integrationId: 'integration',
        releaseId: 'tweet-1',
        deletedAt: null,
        state: 'PUBLISHED',
      },
      data: {
        likesCount: 12,
        likesSyncedAt: snapshotAt,
      },
    });
  });

  it('uses the first post-lifetime snapshot only as a baseline', async () => {
    const { repository, tx } = createHarness();
    tx.channelAnalyticsSyncState.findUnique.mockResolvedValue(null);
    const result = await repository.finalizePostLifetimeCapture(
      'org',
      'integration',
      new Date('2026-08-15T12:00:00Z')
    );
    expect(result).toEqual({ finalized: true, derived: 0 });
    expect(tx.channelAnalyticsDailyPoint.upsert).not.toHaveBeenCalled();
  });

  it('binds derived daily points to the finalized snapshot pair', async () => {
    const { repository, tx } = createHarness();
    const previousSnapshotAt = new Date('2026-08-14T12:00:00Z');
    const snapshotAt = new Date('2026-08-15T12:00:00Z');
    tx.channelAnalyticsSyncState.findUnique.mockResolvedValue({
      lastSuccessfulSnapshotAt: previousSnapshotAt,
    });
    tx.channelAnalyticsPostMetricSnapshot.findMany
      .mockResolvedValueOnce([
        {
          externalPostId: 'post',
          metricKey: 'like_count',
          label: 'Likes',
          valueMode: 'SUM',
          displayUnit: 'COUNT',
          value: new Prisma.Decimal(5),
        },
      ])
      .mockResolvedValueOnce([
        {
          externalPostId: 'post',
          metricKey: 'like_count',
          label: 'Likes',
          valueMode: 'SUM',
          displayUnit: 'COUNT',
          value: new Prisma.Decimal(3),
        },
      ]);

    await repository.finalizePostLifetimeCapture(
      'org',
      'integration',
      snapshotAt
    );

    expect(tx.channelAnalyticsDailyPoint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          currentSnapshotAt: snapshotAt,
          previousSnapshotAt,
        }),
        update: expect.objectContaining({
          currentSnapshotAt: snapshotAt,
          previousSnapshotAt,
        }),
      })
    );
  });

  it('extends X coverage for consecutive successful empty snapshots', async () => {
    const { repository, tx } = createHarness();
    const snapshotAt = new Date('2026-08-15T12:00:00Z');
    tx.channelAnalyticsSyncState.findUnique.mockResolvedValue({
      lastSuccessfulSnapshotAt: new Date('2026-08-14T12:00:00Z'),
      coverageStartDay: null,
      coverageEndDay: null,
      pendingCoverageSnapshotAt: null,
      pendingCoverageStartDay: null,
      pendingCoverageEndDay: null,
    });
    tx.channelAnalyticsPostMetricSnapshot.findMany.mockResolvedValue([]);

    await expect(
      repository.finalizePostLifetimeCapture('org', 'integration', snapshotAt)
    ).resolves.toEqual({ finalized: true, derived: 0 });

    expect(tx.channelAnalyticsDailyPoint.upsert).not.toHaveBeenCalled();
    expect(tx.channelAnalyticsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          coverageStartDay: new Date('2026-08-15T00:00:00Z'),
          coverageEndDay: new Date('2026-08-15T00:00:00Z'),
        }),
      })
    );
  });

  it('extends X coverage when consecutive snapshots have non-overlapping posts', async () => {
    const { repository, tx } = createHarness();
    const snapshotAt = new Date('2026-08-15T12:00:00Z');
    tx.channelAnalyticsSyncState.findUnique.mockResolvedValue({
      lastSuccessfulSnapshotAt: new Date('2026-08-14T12:00:00Z'),
      coverageStartDay: new Date('2026-08-14T00:00:00Z'),
      coverageEndDay: new Date('2026-08-14T00:00:00Z'),
      pendingCoverageSnapshotAt: null,
      pendingCoverageStartDay: null,
      pendingCoverageEndDay: null,
    });
    tx.channelAnalyticsPostMetricSnapshot.findMany
      .mockResolvedValueOnce([
        {
          externalPostId: 'current-post',
          metricKey: 'impressions',
          label: 'Impressions',
          valueMode: 'SUM',
          displayUnit: 'COUNT',
          value: new Prisma.Decimal(2),
        },
      ])
      .mockResolvedValueOnce([
        {
          externalPostId: 'previous-post',
          metricKey: 'impressions',
          label: 'Impressions',
          valueMode: 'SUM',
          displayUnit: 'COUNT',
          value: new Prisma.Decimal(1),
        },
      ]);

    await repository.finalizePostLifetimeCapture(
      'org',
      'integration',
      snapshotAt
    );

    expect(tx.channelAnalyticsDailyPoint.upsert).not.toHaveBeenCalled();
    expect(tx.channelAnalyticsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          coverageStartDay: new Date('2026-08-14T00:00:00Z'),
          coverageEndDay: new Date('2026-08-15T00:00:00Z'),
        }),
      })
    );
  });

  it('does not extend X coverage across snapshot-day gaps', async () => {
    const { repository, tx } = createHarness();
    tx.channelAnalyticsSyncState.findUnique.mockResolvedValue({
      lastSuccessfulSnapshotAt: new Date('2026-08-13T12:00:00Z'),
      coverageStartDay: new Date('2026-08-13T00:00:00Z'),
      coverageEndDay: new Date('2026-08-13T00:00:00Z'),
      pendingCoverageSnapshotAt: null,
      pendingCoverageStartDay: null,
      pendingCoverageEndDay: null,
    });
    tx.channelAnalyticsPostMetricSnapshot.findMany.mockResolvedValue([]);

    await repository.finalizePostLifetimeCapture(
      'org',
      'integration',
      new Date('2026-08-15T12:00:00Z')
    );

    expect(tx.channelAnalyticsDailyPoint.upsert).not.toHaveBeenCalled();
    expect(tx.channelAnalyticsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          coverageStartDay: expect.anything(),
          coverageEndDay: expect.anything(),
        }),
      })
    );
  });

  it('is idempotent when retrying the same post-lifetime snapshot', async () => {
    const { repository, tx } = createHarness();
    const snapshotAt = new Date('2026-08-15T12:00:00Z');
    tx.channelAnalyticsSyncState.findUnique.mockResolvedValue({
      lastSuccessfulSnapshotAt: snapshotAt,
    });
    await expect(
      repository.finalizePostLifetimeCapture('org', 'integration', snapshotAt)
    ).resolves.toEqual({ finalized: false, derived: 0 });
    expect(
      tx.channelAnalyticsPostMetricSnapshot.findMany
    ).not.toHaveBeenCalled();
    expect(tx.channelAnalyticsDailyPoint.upsert).not.toHaveBeenCalled();
    expect(tx.channelAnalyticsSyncState.upsert).not.toHaveBeenCalled();
  });

  it('schedules successful daily captures for the next UTC day', async () => {
    const { repository, tx } = createHarness();
    tx.channelAnalyticsSyncState.findUnique.mockResolvedValue({
      pendingCoverageSnapshotAt: new Date('2026-08-15T12:00:00Z'),
      pendingCoverageStartDay: new Date('2026-02-16T00:00:00Z'),
      pendingCoverageEndDay: new Date('2026-08-15T00:00:00Z'),
    });

    await repository.finalizeDailyCapture(
      'org',
      'integration',
      new Date('2026-08-15T12:00:00Z'),
      new Date('2026-08-15T00:00:00Z')
    );

    expect(tx.channelAnalyticsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          nextAttemptAt: new Date('2026-08-16T00:00:00Z'),
          coverageStartDay: new Date('2026-02-16T00:00:00Z'),
          coverageEndDay: new Date('2026-08-15T00:00:00Z'),
        }),
      })
    );
  });

  it('accumulates adjacent one-day gauge coverage', async () => {
    const { repository, tx } = createHarness();
    tx.channelAnalyticsSyncState.findUnique.mockResolvedValue({
      coverageStartDay: new Date('2026-08-01T00:00:00Z'),
      coverageEndDay: new Date('2026-08-15T00:00:00Z'),
      pendingCoverageSnapshotAt: new Date('2026-08-16T12:00:00Z'),
      pendingCoverageStartDay: new Date('2026-08-16T00:00:00Z'),
      pendingCoverageEndDay: new Date('2026-08-16T00:00:00Z'),
    });

    await repository.finalizeDailyCapture(
      'org',
      'integration',
      new Date('2026-08-16T12:00:00Z'),
      new Date('2026-08-16T00:00:00Z')
    );

    expect(tx.channelAnalyticsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          coverageStartDay: new Date('2026-08-01T00:00:00Z'),
          coverageEndDay: new Date('2026-08-16T00:00:00Z'),
        }),
      })
    );
  });

  it('retains earlier rolling historical coverage when intervals overlap', async () => {
    const { repository, tx } = createHarness();
    tx.channelAnalyticsSyncState.findUnique.mockResolvedValue({
      coverageStartDay: new Date('2026-02-16T00:00:00Z'),
      coverageEndDay: new Date('2026-08-15T00:00:00Z'),
      pendingCoverageSnapshotAt: new Date('2026-08-16T12:00:00Z'),
      pendingCoverageStartDay: new Date('2026-05-19T00:00:00Z'),
      pendingCoverageEndDay: new Date('2026-08-16T00:00:00Z'),
    });

    await repository.finalizeDailyCapture(
      'org',
      'integration',
      new Date('2026-08-16T12:00:00Z'),
      new Date('2026-08-16T00:00:00Z')
    );

    expect(tx.channelAnalyticsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          coverageStartDay: new Date('2026-02-16T00:00:00Z'),
          coverageEndDay: new Date('2026-08-16T00:00:00Z'),
        }),
      })
    );
  });

  it('does not bridge a gap in committed coverage', async () => {
    const { repository, tx } = createHarness();
    tx.channelAnalyticsSyncState.findUnique.mockResolvedValue({
      coverageStartDay: new Date('2026-08-01T00:00:00Z'),
      coverageEndDay: new Date('2026-08-10T00:00:00Z'),
      pendingCoverageSnapshotAt: new Date('2026-08-16T12:00:00Z'),
      pendingCoverageStartDay: new Date('2026-08-15T00:00:00Z'),
      pendingCoverageEndDay: new Date('2026-08-16T00:00:00Z'),
    });

    await repository.finalizeDailyCapture(
      'org',
      'integration',
      new Date('2026-08-16T12:00:00Z'),
      new Date('2026-08-16T00:00:00Z')
    );

    expect(tx.channelAnalyticsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          coverageStartDay: expect.anything(),
          coverageEndDay: expect.anything(),
        }),
      })
    );
  });

  it('establishes X delta coverage after seven consecutive derived days', async () => {
    const { repository, tx } = createHarness();
    const firstSnapshot = new Date('2026-08-01T12:00:00Z');
    let coverageStartDay: Date | null = null;
    let coverageEndDay: Date | null = null;

    for (let offset = 1; offset <= 7; offset++) {
      const snapshotAt = new Date(firstSnapshot);
      snapshotAt.setUTCDate(snapshotAt.getUTCDate() + offset);
      const previousSnapshotAt = new Date(snapshotAt);
      previousSnapshotAt.setUTCDate(previousSnapshotAt.getUTCDate() - 1);
      const state = {
        lastSuccessfulSnapshotAt: previousSnapshotAt,
        coverageStartDay,
        coverageEndDay,
        pendingCoverageSnapshotAt: null,
        pendingCoverageStartDay: null,
        pendingCoverageEndDay: null,
      };
      tx.channelAnalyticsSyncState.findUnique
        .mockResolvedValueOnce(state)
        .mockResolvedValueOnce(state);
      tx.channelAnalyticsPostMetricSnapshot.findMany
        .mockResolvedValueOnce([
          {
            externalPostId: 'post',
            metricKey: 'impressions',
            label: 'Impressions',
            valueMode: 'SUM',
            displayUnit: 'COUNT',
            value: new Prisma.Decimal(2),
          },
        ])
        .mockResolvedValueOnce([
          {
            externalPostId: 'post',
            metricKey: 'impressions',
            label: 'Impressions',
            valueMode: 'SUM',
            displayUnit: 'COUNT',
            value: new Prisma.Decimal(1),
          },
        ]);

      await repository.finalizePostLifetimeCapture(
        'org',
        'integration',
        snapshotAt
      );
      coverageStartDay ||= new Date(snapshotAt);
      coverageStartDay.setUTCHours(0, 0, 0, 0);
      coverageEndDay = new Date(coverageStartDay);
      coverageEndDay.setUTCDate(coverageStartDay.getUTCDate() + offset - 1);
    }

    expect(tx.channelAnalyticsSyncState.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          coverageStartDay: new Date('2026-08-02T00:00:00Z'),
          coverageEndDay: new Date('2026-08-08T00:00:00Z'),
        }),
      })
    );
  });

  it('schedules an immediate capture without clearing failure state', async () => {
    const { repository, tx } = createHarness();
    tx.channelAnalyticsSyncState.findUnique.mockResolvedValue({
      failureCount: 2,
    });
    await repository.scheduleImmediateCapture(
      'org',
      'integration',
      new Date(0)
    );
    expect(tx.channelAnalyticsSyncState.upsert).toHaveBeenCalledWith({
      where: { integrationId: 'integration' },
      create: {
        organizationId: 'org',
        integrationId: 'integration',
        nextAttemptAt: new Date(0),
      },
      update: { nextAttemptAt: new Date(0) },
    });
  });

  it('derives deterministic non-zero metric-day deltas from the matching stored bar', async () => {
    const { repository, analytics } = createHarness();
    const currentSnapshotAt = new Date('2026-08-15T18:00:00Z');
    const previousSnapshotAt = new Date('2026-08-14T18:00:00Z');
    analytics.channelAnalyticsDailyPoint.findFirst.mockResolvedValue({
      value: new Prisma.Decimal(4),
      currentSnapshotAt,
      previousSnapshotAt,
    });
    analytics.channelAnalyticsPostMetricSnapshot.findMany
      .mockResolvedValueOnce([
        {
          externalPostId: 'b',
          value: new Prisma.Decimal(4),
        },
        {
          externalPostId: 'a',
          value: new Prisma.Decimal(5),
        },
        {
          externalPostId: 'zero',
          value: new Prisma.Decimal(2),
        },
      ])
      .mockResolvedValueOnce([
        { externalPostId: 'b', value: new Prisma.Decimal(2) },
        { externalPostId: 'a', value: new Prisma.Decimal(3) },
        { externalPostId: 'zero', value: new Prisma.Decimal(2) },
      ]);

    const result = await repository.getMetricDayContributors(
      'org',
      'integration',
      'like_count',
      new Date('2026-08-15T00:00:00Z')
    );

    expect(result.dailyPointTotal).toBe(4);
    expect(result.hasProvenance).toBe(true);
    expect(
      result.contributors.map((contributor) => [
        contributor.externalPostId,
        contributor.delta.toNumber(),
      ])
    ).toEqual([
      ['a', 2],
      ['b', 2],
    ]);
    expect(
      analytics.channelAnalyticsPostMetricSnapshot.findMany
    ).toHaveBeenCalledTimes(2);
    expect(
      analytics.channelAnalyticsPostMetricSnapshot.findMany
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ snapshotAt: currentSnapshotAt }),
      })
    );
    expect(
      analytics.channelAnalyticsPostMetricSnapshot.findMany
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ snapshotAt: previousSnapshotAt }),
      })
    );
  });

  it('uses the bound pair when equal totals have different contributors', async () => {
    const { repository, analytics } = createHarness();
    const currentSnapshotAt = new Date('2026-08-15T18:00:00Z');
    const previousSnapshotAt = new Date('2026-08-14T18:00:00Z');
    const failedPartialSnapshotAt = new Date('2026-08-15T19:00:00Z');
    const failedPartialPreviousSnapshotAt = new Date('2026-08-15T16:00:00Z');
    analytics.channelAnalyticsDailyPoint.findFirst.mockResolvedValue({
      value: new Prisma.Decimal(5),
      currentSnapshotAt,
      previousSnapshotAt,
    });
    analytics.channelAnalyticsPostMetricSnapshot.findMany.mockImplementation(
      ({ where }) => {
        if (where.snapshotAt.getTime() === currentSnapshotAt.getTime()) {
          return [
            {
              externalPostId: 'finalized-post',
              value: new Prisma.Decimal(10),
            },
            {
              externalPostId: 'other-finalized-post',
              value: new Prisma.Decimal(4),
            },
          ];
        }
        if (where.snapshotAt.getTime() === previousSnapshotAt.getTime()) {
          return [
            { externalPostId: 'finalized-post', value: new Prisma.Decimal(7) },
            {
              externalPostId: 'other-finalized-post',
              value: new Prisma.Decimal(2),
            },
          ];
        }
        if (where.snapshotAt.getTime() === failedPartialSnapshotAt.getTime()) {
          return [
            {
              externalPostId: 'failed-partial-post',
              value: new Prisma.Decimal(10),
            },
          ];
        }
        if (
          where.snapshotAt.getTime() ===
          failedPartialPreviousSnapshotAt.getTime()
        ) {
          return [
            {
              externalPostId: 'failed-partial-post',
              value: new Prisma.Decimal(5),
            },
          ];
        }
        return [];
      }
    );

    await expect(
      repository.getMetricDayContributors(
        'org',
        'integration',
        'like_count',
        new Date('2026-08-15T00:00:00Z')
      )
    ).resolves.toMatchObject({
      hasProvenance: true,
      contributors: [
        { externalPostId: 'finalized-post', delta: new Prisma.Decimal(3) },
        {
          externalPostId: 'other-finalized-post',
          delta: new Prisma.Decimal(2),
        },
      ],
    });
    expect(
      analytics.channelAnalyticsPostMetricSnapshot.findMany
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ snapshotAt: failedPartialSnapshotAt }),
      })
    );
    expect(
      analytics.channelAnalyticsPostMetricSnapshot.findMany
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          snapshotAt: failedPartialPreviousSnapshotAt,
        }),
      })
    );
  });

  it('treats legacy daily points without retained snapshots as unavailable', async () => {
    const { repository, analytics } = createHarness();
    analytics.channelAnalyticsDailyPoint.findFirst.mockResolvedValue({
      value: new Prisma.Decimal(5),
      currentSnapshotAt: null,
      previousSnapshotAt: null,
    });
    analytics.channelAnalyticsPostMetricSnapshot.findFirst.mockResolvedValue(
      null
    );

    await expect(
      repository.getMetricDayContributors(
        'org',
        'integration',
        'like_count',
        new Date('2026-08-15T00:00:00Z')
      )
    ).resolves.toMatchObject({
      dailyPointTotal: 5,
      hasProvenance: false,
      contributors: [],
    });
    expect(
      analytics.channelAnalyticsPostMetricSnapshot.findMany
    ).not.toHaveBeenCalled();
  });

  it('reconstructs the bound pair for legacy daily points from retained snapshots', async () => {
    const { repository, analytics } = createHarness();
    const currentSnapshotAt = new Date('2026-08-15T18:00:00Z');
    const previousSnapshotAt = new Date('2026-08-14T18:00:00Z');
    analytics.channelAnalyticsDailyPoint.findFirst.mockResolvedValue({
      value: new Prisma.Decimal(4),
      currentSnapshotAt: null,
      previousSnapshotAt: null,
    });
    analytics.channelAnalyticsPostMetricSnapshot.findFirst
      .mockResolvedValueOnce({ snapshotAt: currentSnapshotAt })
      .mockResolvedValueOnce({ snapshotAt: previousSnapshotAt });
    analytics.channelAnalyticsPostMetricSnapshot.findMany
      .mockResolvedValueOnce([
        { externalPostId: 'a', value: new Prisma.Decimal(5) },
        { externalPostId: 'b', value: new Prisma.Decimal(4) },
      ])
      .mockResolvedValueOnce([
        { externalPostId: 'a', value: new Prisma.Decimal(3) },
        { externalPostId: 'b', value: new Prisma.Decimal(2) },
      ]);

    const result = await repository.getMetricDayContributors(
      'org',
      'integration',
      'like_count',
      new Date('2026-08-15T00:00:00Z')
    );

    expect(result.hasProvenance).toBe(true);
    expect(result.dailyPointTotal).toBe(4);
    expect(
      result.contributors.map((contributor) => [
        contributor.externalPostId,
        contributor.delta.toNumber(),
      ])
    ).toEqual([
      ['a', 2],
      ['b', 2],
    ]);
    expect(
      analytics.channelAnalyticsPostMetricSnapshot.findFirst
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          snapshotAt: {
            gte: new Date('2026-08-15T00:00:00Z'),
            lt: new Date('2026-08-16T00:00:00Z'),
          },
        }),
        orderBy: { snapshotAt: 'desc' },
      })
    );
    expect(
      analytics.channelAnalyticsPostMetricSnapshot.findFirst
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          snapshotAt: { lt: currentSnapshotAt },
        }),
        orderBy: { snapshotAt: 'desc' },
      })
    );
    expect(
      analytics.channelAnalyticsPostMetricSnapshot.findMany
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ snapshotAt: currentSnapshotAt }),
      })
    );
  });

  it('fails closed for legacy daily points with only a single retained snapshot', async () => {
    const { repository, analytics } = createHarness();
    analytics.channelAnalyticsDailyPoint.findFirst.mockResolvedValue({
      value: new Prisma.Decimal(4),
      currentSnapshotAt: null,
      previousSnapshotAt: null,
    });
    analytics.channelAnalyticsPostMetricSnapshot.findFirst
      .mockResolvedValueOnce({ snapshotAt: new Date('2026-08-15T18:00:00Z') })
      .mockResolvedValueOnce(null);

    await expect(
      repository.getMetricDayContributors(
        'org',
        'integration',
        'like_count',
        new Date('2026-08-15T00:00:00Z')
      )
    ).resolves.toMatchObject({
      dailyPointTotal: 4,
      hasProvenance: false,
      contributors: [],
    });
    expect(
      analytics.channelAnalyticsPostMetricSnapshot.findMany
    ).not.toHaveBeenCalled();
  });

  it('fails closed when bound pair deltas do not equal the stored bar total', async () => {
    const { repository, analytics } = createHarness();
    const currentSnapshotAt = new Date('2026-08-15T18:00:00Z');
    const previousSnapshotAt = new Date('2026-08-14T18:00:00Z');
    analytics.channelAnalyticsDailyPoint.findFirst.mockResolvedValue({
      value: new Prisma.Decimal(8),
      currentSnapshotAt,
      previousSnapshotAt,
    });
    analytics.channelAnalyticsPostMetricSnapshot.findMany
      .mockResolvedValueOnce([
        { externalPostId: 'a', value: new Prisma.Decimal(5) },
        { externalPostId: 'b', value: new Prisma.Decimal(4) },
      ])
      .mockResolvedValueOnce([
        { externalPostId: 'a', value: new Prisma.Decimal(3) },
        { externalPostId: 'b', value: new Prisma.Decimal(2) },
      ]);

    await expect(
      repository.getMetricDayContributors(
        'org',
        'integration',
        'like_count',
        new Date('2026-08-15T00:00:00Z')
      )
    ).resolves.toMatchObject({
      dailyPointTotal: 8,
      hasProvenance: false,
      contributors: [],
    });
  });


  it('upserts account daily points without touching sync coverage', async () => {
    const { repository, tx } = createHarness();
    await repository.persistAccountDailyPoints('org', 'integration', [
      {
        metricKey: 'followers',
        label: 'Followers',
        valueMode: 'LATEST' as any,
        value: 1200,
        day: new Date('2026-08-15T00:00:00Z'),
      },
    ]);
    expect(tx.channelAnalyticsDailyPoint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId_day_metricKey: {
            integrationId: 'integration',
            day: new Date('2026-08-15T00:00:00Z'),
            metricKey: 'followers',
          },
        },
      })
    );
    expect(tx.channelAnalyticsSyncState.upsert).not.toHaveBeenCalled();
  });

  it('returns the latest daily point per requested metric key', async () => {
    const { repository, analytics } = createHarness();
    analytics.channelAnalyticsDailyPoint.findMany.mockResolvedValue([
      {
        metricKey: 'followers',
        day: new Date('2026-08-15T00:00:00Z'),
        value: { toNumber: () => 1200 },
        label: 'Followers',
      },
      {
        metricKey: 'followers',
        day: new Date('2026-08-01T00:00:00Z'),
        value: { toNumber: () => 1000 },
        label: 'Followers',
      },
      {
        metricKey: 'subscribers',
        day: new Date('2026-08-10T00:00:00Z'),
        value: { toNumber: () => 50 },
        label: 'Subscribers',
      },
    ]);

    await expect(
      repository.getLatestDailyPoints('org', 'integration', [
        'followers',
        'subscribers',
      ])
    ).resolves.toEqual([
      expect.objectContaining({
        metricKey: 'followers',
        day: new Date('2026-08-15T00:00:00Z'),
      }),
      expect.objectContaining({
        metricKey: 'subscribers',
        day: new Date('2026-08-10T00:00:00Z'),
      }),
    ]);
    expect(analytics.channelAnalyticsDailyPoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          integrationId: 'integration',
          metricKey: { in: ['followers', 'subscribers'] },
        },
        orderBy: [{ metricKey: 'asc' }, { day: 'desc' }],
      })
    );
  });
});

jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager { },
  socialIntegrationList: [],
}));

import { BadRequestException } from '@nestjs/common';
import { ChannelAnalyticsService } from './channel-analytics.service';

const decimal = (value: number) => ({ toNumber: () => value });

const createService = (repository: any) =>
  new ChannelAnalyticsService(
    repository,
    {
      getAnalyticsSnapshotIntegrations: jest.fn().mockReturnValue(['facebook']),
    } as any,
    { client: { getRawClient: () => undefined } } as any
  );

describe('ChannelAnalyticsService', () => {
  const createRepository = () => ({
    persistDailyPage: jest.fn().mockResolvedValue({ persisted: 1 }),
    persistPostLifetimePage: jest.fn().mockResolvedValue({ persisted: 1 }),
    persistAccountDailyPoints: jest.fn().mockResolvedValue({ persisted: 1 }),
    finalizeDailyCapture: jest.fn(),
    finalizePostLifetimeCapture: jest.fn(),
    recordFailure: jest.fn(),
    getDailyPoints: jest.fn().mockResolvedValue([]),
    getLatestDailyPoints: jest.fn().mockResolvedValue([]),
    findOwnedIntegration: jest.fn().mockResolvedValue({ id: 'integration', type: 'social' }),
    getSyncState: jest.fn().mockResolvedValue(null),
  });

  it('validates and persists provider dated points as UTC days', async () => {
    const repository = createRepository();
    const service = createService(repository);
    await service.persistCapturePage('org', 'integration', new Date(), {
      kind: 'daily',
      coverage: { fromDay: '2026-08-15', toDay: '2026-08-15' },
      points: [
        {
          metricKey: 'engagement',
          label: 'Engagement',
          valueMode: 'sum',
          value: 4,
          day: '2026-08-15',
        },
      ],
    });
    expect(repository.persistDailyPage).toHaveBeenCalledWith(
      'org',
      'integration',
      expect.any(Date),
      [expect.objectContaining({ day: new Date('2026-08-15T00:00:00.000Z') })],
      {
        fromDay: new Date('2026-08-15T00:00:00.000Z'),
        toDay: new Date('2026-08-15T00:00:00.000Z'),
      }
    );
  });

  it('rejects invalid provider values before persistence', async () => {
    const service = createService(createRepository());
    await expect(
      service.persistCapturePage('org', 'integration', new Date(), {
        kind: 'daily',
        coverage: { fromDay: '2026-08-15', toDay: '2026-08-15' },
        points: [
          {
            metricKey: 'engagement',
            label: 'Engagement',
            valueMode: 'sum',
            value: Number.NaN,
            day: '2026-08-15',
          },
        ],
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('returns sum, average, and latest window values with trends', async () => {
    const repository = createRepository();
    repository.getDailyPoints.mockResolvedValue([
      {
        metricKey: 'sum',
        label: 'Sum',
        valueMode: 'SUM',
        day: new Date('2026-08-01'),
        value: decimal(2),
      },
      {
        metricKey: 'sum',
        label: 'Sum',
        valueMode: 'SUM',
        day: new Date('2026-08-08'),
        value: decimal(4),
      },
      {
        metricKey: 'average',
        label: 'Average',
        valueMode: 'AVERAGE',
        day: new Date('2026-08-01'),
        value: decimal(2),
      },
      {
        metricKey: 'average',
        label: 'Average',
        valueMode: 'AVERAGE',
        day: new Date('2026-08-08'),
        value: decimal(6),
      },
      {
        metricKey: 'latest',
        label: 'Latest',
        valueMode: 'LATEST',
        day: new Date('2026-08-01'),
        value: decimal(3),
      },
      {
        metricKey: 'latest',
        label: 'Latest',
        valueMode: 'LATEST',
        day: new Date('2026-08-08'),
        value: decimal(9),
      },
    ]);
    const result = await createService(repository).getWindow('org', 'integration', 7, new Date('2026-08-14T12:00:00.000Z'));
    expect(
      result.metrics.map(({ metricKey, total }) => ({ metricKey, total }))
    ).toEqual([
      { metricKey: 'sum', total: 4 },
      { metricKey: 'average', total: 6 },
      { metricKey: 'latest', total: 9 },
    ]);
    expect(result.metrics.every((metric) => metric.trend === null)).toBe(true);
  });

  it('does not calculate a trend with incomplete prior coverage or zero denominator', async () => {
    const repository = createRepository();
    repository.getDailyPoints.mockResolvedValue([
      {
        metricKey: 'm',
        label: 'M',
        valueMode: 'SUM',
        day: new Date('2026-08-07'),
        value: decimal(0),
      },
      {
        metricKey: 'm',
        label: 'M',
        valueMode: 'SUM',
        day: new Date('2026-08-14'),
        value: decimal(2),
      },
    ]);
    const result = await createService(repository).getWindow('org', 'integration', 7, new Date('2026-08-14T12:00:00.000Z'));
    expect(result.metrics[0].trend).toBeNull();
  });

  it('zero-fills sum days and emits trends only with complete UTC coverage', async () => {
    const repository = createRepository();
    repository.getSyncState.mockResolvedValue({
      coverageStartDay: new Date('2026-08-01T00:00:00.000Z'),
      coverageEndDay: new Date('2026-08-14T00:00:00.000Z'),
    });
    repository.getDailyPoints.mockResolvedValue([
      {
        metricKey: 'm',
        label: 'M',
        valueMode: 'SUM',
        day: new Date('2026-08-01T00:00:00.000Z'),
        value: decimal(2),
      },
      {
        metricKey: 'm',
        label: 'M',
        valueMode: 'SUM',
        day: new Date('2026-08-08T00:00:00.000Z'),
        value: decimal(4),
      },
    ]);

    const result = await createService(repository).getWindow('org', 'integration', 7, new Date('2026-08-14T12:00:00.000Z'));

    expect(result.metrics[0]).toMatchObject({
      total: 4,
      trend: 100,
    });
    expect(result.metrics[0].points).toHaveLength(7);
    expect(result.metrics[0].points[1].value).toBe(0);
  });

  it('omits average and latest metrics when the current window has no observations', async () => {
    const repository = createRepository();
    repository.getDailyPoints.mockResolvedValue([
      {
        metricKey: 'engagement_rate',
        label: 'Engagement rate',
        valueMode: 'AVERAGE',
        day: new Date('2026-08-01T00:00:00.000Z'),
        value: decimal(4),
      },
      {
        metricKey: 'followers',
        label: 'Followers',
        valueMode: 'LATEST',
        day: new Date('2026-08-07T00:00:00.000Z'),
        value: decimal(100),
      },
      {
        metricKey: 'impressions',
        label: 'Impressions',
        valueMode: 'SUM',
        day: new Date('2026-08-01T00:00:00.000Z'),
        value: decimal(5),
      },
    ]);

    const result = await createService(repository).getWindow('org', 'integration', 7, new Date('2026-08-14T12:00:00.000Z'));

    expect(result.metrics.map((metric) => metric.metricKey)).toEqual([
      'impressions',
    ]);
  });

  it('does not emit average or latest trends without observations in both windows', async () => {
    const repository = createRepository();
    repository.getSyncState.mockResolvedValue({
      coverageStartDay: new Date('2026-08-01T00:00:00.000Z'),
      coverageEndDay: new Date('2026-08-14T00:00:00.000Z'),
    });
    repository.getDailyPoints.mockResolvedValue([
      {
        metricKey: 'engagement_rate',
        label: 'Engagement rate',
        valueMode: 'AVERAGE',
        day: new Date('2026-08-08T00:00:00.000Z'),
        value: decimal(6),
      },
      {
        metricKey: 'followers',
        label: 'Followers',
        valueMode: 'LATEST',
        day: new Date('2026-08-01T00:00:00.000Z'),
        value: decimal(90),
      },
      {
        metricKey: 'followers',
        label: 'Followers',
        valueMode: 'LATEST',
        day: new Date('2026-08-08T00:00:00.000Z'),
        value: decimal(120),
      },
    ]);

    const result = await createService(repository).getWindow('org', 'integration', 7, new Date('2026-08-14T12:00:00.000Z'));

    const engagement = result.metrics.find(
      (metric) => metric.metricKey === 'engagement_rate'
    );
    const followers = result.metrics.find(
      (metric) => metric.metricKey === 'followers'
    );
    expect(engagement).toMatchObject({ total: 6, trend: null });
    expect(followers).toMatchObject({ total: 120, trend: 33.33333333333333 });
  });


  it('persists post_lifetime accountPoints without coverage helpers', async () => {
    const repository = createRepository();
    const service = createService(repository);
    const snapshotAt = new Date('2026-08-15T12:00:00.000Z');
    await service.persistCapturePage('org', 'integration', snapshotAt, {
      kind: 'post_lifetime',
      points: [
        {
          externalPostId: 'tweet-1',
          metricKey: 'like_count',
          label: 'Likes',
          valueMode: 'sum',
          value: 3,
        },
      ],
      accountPoints: [
        {
          metricKey: 'followers',
          label: 'Followers',
          valueMode: 'latest',
          value: 1200,
          day: '2026-08-15',
        },
      ],
    });
    expect(repository.persistPostLifetimePage).toHaveBeenCalledWith(
      'org',
      'integration',
      snapshotAt,
      [expect.objectContaining({ externalPostId: 'tweet-1', metricKey: 'like_count' })]
    );
    expect(repository.persistAccountDailyPoints).toHaveBeenCalledWith(
      'org',
      'integration',
      [
        expect.objectContaining({
          metricKey: 'followers',
          valueMode: expect.anything(),
          day: new Date('2026-08-15T00:00:00.000Z'),
          value: 1200,
        }),
      ]
    );
    expect(repository.persistDailyPage).not.toHaveBeenCalled();
  });

  it('returns the latest followers point ignoring the dashboard window', async () => {
    const repository = createRepository();
    repository.getLatestDailyPoints.mockResolvedValue([
      {
        metricKey: 'followers',
        label: 'Followers',
        day: new Date('2026-07-01T00:00:00.000Z'),
        value: decimal(1500),
      },
    ]);

    await expect(
      createService(repository).getLatestAccountAudienceTotal('org', 'integration')
    ).resolves.toEqual({
      value: 1500,
      asOf: '2026-07-01',
      metricKey: 'followers',
      label: 'Followers',
    });
    expect(repository.getLatestDailyPoints).toHaveBeenCalledWith('org', 'integration', [
      'followers',
      'subscribers',
    ]);
  });

  it('prefers followers over subscribers when both are present', async () => {
    const repository = createRepository();
    repository.getLatestDailyPoints.mockResolvedValue([
      {
        metricKey: 'followers',
        label: 'Followers',
        day: new Date('2026-08-01T00:00:00.000Z'),
        value: decimal(10),
      },
      {
        metricKey: 'subscribers',
        label: 'Subscribers',
        day: new Date('2026-08-10T00:00:00.000Z'),
        value: decimal(99),
      },
    ]);

    await expect(
      createService(repository).getLatestAccountAudienceTotal('org', 'integration')
    ).resolves.toMatchObject({ metricKey: 'followers', value: 10 });
  });

  it('falls back to subscribers when followers is missing', async () => {
    const repository = createRepository();
    repository.getLatestDailyPoints.mockResolvedValue([
      {
        metricKey: 'subscribers',
        label: 'Subscribers',
        day: new Date('2026-08-10T00:00:00.000Z'),
        value: decimal(4242),
      },
    ]);

    await expect(
      createService(repository).getLatestAccountAudienceTotal('org', 'integration')
    ).resolves.toEqual({
      value: 4242,
      asOf: '2026-08-10',
      metricKey: 'subscribers',
      label: 'Subscribers',
    });
  });

});

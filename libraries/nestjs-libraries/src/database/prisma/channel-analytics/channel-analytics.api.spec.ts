jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
  socialIntegrationList: [],
}));

import { HttpException, NotFoundException } from '@nestjs/common';
import { ChannelAnalyticsService } from './channel-analytics.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

describe('ChannelAnalytics API shaping', () => {
  const createRepository = () => ({
    findOwnedIntegration: jest.fn(),
    getDailyPoints: jest.fn().mockResolvedValue([]),
    getSyncState: jest.fn().mockResolvedValue(null),
    scheduleImmediateCapture: jest.fn().mockResolvedValue({}),
    getMetricDayContributors: jest.fn(),
    getMetricDayPosts: jest.fn(),
  });

  const createTemporal = () => {
    const signal = jest.fn().mockResolvedValue(undefined);
    return {
      signal,
      service: {
        client: {
          getRawClient: () => ({
            workflow: {
              getHandle: jest.fn().mockReturnValue({ signal }),
            },
          }),
        },
      },
    };
  };

  const createService = (
    repository = createRepository(),
    temporal = createTemporal()
  ) =>
    new ChannelAnalyticsService(
      repository as any,
      {
        getAnalyticsSnapshotIntegrations: jest
          .fn()
          .mockReturnValue(['facebook', 'instagram']),
      } as any,
      temporal.service as any
    );

  beforeEach(() => {
    jest.clearAllMocks();
    (ioRedis.get as jest.Mock).mockResolvedValue(null);
    (ioRedis.set as jest.Mock).mockResolvedValue('OK');
  });

  it('scopes stored analytics to the requesting organization', async () => {
    const repository = createRepository();
    repository.findOwnedIntegration.mockResolvedValue(null);
    const service = createService(repository);

    await expect(
      service.getStoredAnalytics('org-a', 'integration-a', 7)
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.getDailyPoints).not.toHaveBeenCalled();
  });

  it('returns an empty array before the first capture', async () => {
    const repository = createRepository();
    repository.findOwnedIntegration.mockResolvedValue({
      id: 'integration-a',
      type: 'social',
    });
    const service = createService(repository);

    await expect(
      service.getStoredAnalytics('org-a', 'integration-a', 7)
    ).resolves.toEqual([]);
    expect(ioRedis.get).not.toHaveBeenCalled();
    expect(ioRedis.set).not.toHaveBeenCalled();
  });

  it('returns stored values with valueMode and optional trend fields', async () => {
    const repository = createRepository();
    repository.findOwnedIntegration.mockResolvedValue({
      id: 'integration-a',
      type: 'social',
    });
    repository.getDailyPoints.mockResolvedValue([
      {
        metricKey: 'impressions',
        label: 'Impressions',
        valueMode: 'SUM',
        day: new Date('2026-08-01T00:00:00.000Z'),
        value: { toNumber: () => 2 },
      },
      {
        metricKey: 'impressions',
        label: 'Impressions',
        valueMode: 'SUM',
        day: new Date('2026-08-08T00:00:00.000Z'),
        value: { toNumber: () => 4 },
      },
      {
        metricKey: 'engagement_rate',
        label: 'Engagement rate',
        valueMode: 'AVERAGE',
        day: new Date('2026-08-01T00:00:00.000Z'),
        value: { toNumber: () => 2 },
      },
      {
        metricKey: 'engagement_rate',
        label: 'Engagement rate',
        valueMode: 'AVERAGE',
        day: new Date('2026-08-08T00:00:00.000Z'),
        value: { toNumber: () => 6 },
      },
    ]);
    const service = createService(repository);

    await expect(
      service.getStoredAnalytics(
        'org-a',
        'integration-a',
        7,
        new Date('2026-08-14T12:00:00.000Z')
      )
    ).resolves.toEqual([
      {
        label: 'Impressions',
        metricKey: 'impressions',
        drilldownSlug: null,
        valueMode: 'sum',
        displayUnit: 'count',
        data: [{ date: '2026-08-08', total: 4 }],
      },
      {
        label: 'Engagement rate',
        metricKey: 'engagement_rate',
        drilldownSlug: null,
        valueMode: 'average',
        displayUnit: 'percentage',
        average: true,
        data: [{ date: '2026-08-08', total: 6 }],
      },
    ]);
    expect(ioRedis.get).not.toHaveBeenCalled();
  });

  it('returns resolved displayUnit for duration averages', async () => {
    const repository = createRepository();
    repository.findOwnedIntegration.mockResolvedValue({
      id: 'integration-a',
      type: 'social',
    });
    repository.getDailyPoints.mockResolvedValue([
      {
        metricKey: 'average_view_duration',
        label: 'Average View Duration',
        valueMode: 'AVERAGE',
        displayUnit: 'DURATION',
        day: new Date('2026-08-08T00:00:00.000Z'),
        value: { toNumber: () => 65 },
      },
    ]);
    const service = createService(repository);

    await expect(
      service.getStoredAnalytics(
        'org-a',
        'integration-a',
        7,
        new Date('2026-08-14T12:00:00.000Z')
      )
    ).resolves.toEqual([
      {
        label: 'Average View Duration',
        metricKey: 'average_view_duration',
        drilldownSlug: null,
        valueMode: 'average',
        displayUnit: 'duration',
        data: [{ date: '2026-08-08', total: 65 }],
      },
    ]);
  });

  it('rejects unsupported analytics windows', async () => {
    const service = createService();

    await expect(
      service.getStoredAnalytics('org-a', 'integration-a', 14 as 7)
    ).rejects.toThrow('Unsupported analytics window');
  });

  it('omits average metrics with no current-window observations from stored analytics', async () => {
    const repository = createRepository();
    repository.findOwnedIntegration.mockResolvedValue({
      id: 'integration-a',
      type: 'social',
    });
    repository.getDailyPoints.mockResolvedValue([
      {
        metricKey: 'engagement_rate',
        label: 'Engagement rate',
        valueMode: 'AVERAGE',
        day: new Date('2026-08-01T00:00:00.000Z'),
        value: { toNumber: () => 4 },
      },
      {
        metricKey: 'impressions',
        label: 'Impressions',
        valueMode: 'SUM',
        day: new Date('2026-08-08T00:00:00.000Z'),
        value: { toNumber: () => 3 },
      },
    ]);
    const service = createService(repository);

    await expect(
      service.getStoredAnalytics(
        'org-a',
        'integration-a',
        7,
        new Date('2026-08-14T12:00:00.000Z')
      )
    ).resolves.toEqual([
      {
        label: 'Impressions',
        metricKey: 'impressions',
        drilldownSlug: null,
        valueMode: 'sum',
        displayUnit: 'count',
        data: [{ date: '2026-08-08', total: 3 }],
      },
    ]);
  });

  it('marks channels unavailable when capture never succeeded after failure', () => {
    const service = createService();
    expect(
      service.isChannelUnavailable({
        failureCount: 2,
        lastSuccessfulSnapshotAt: null,
      })
    ).toBe(true);
    expect(
      service.isChannelUnavailable({
        failureCount: 2,
        lastSuccessfulSnapshotAt: new Date(),
      })
    ).toBe(false);
  });

  it('returns matched daily delta contributors without leaking unmatched IDs', async () => {
    const repository = createRepository();
    repository.findOwnedIntegration.mockResolvedValue({
      id: 'integration-a',
      type: 'social',
    });
    repository.getMetricDayContributors.mockResolvedValue({
      dailyPointTotal: 10,
      hasProvenance: true,
      contributors: [
        { externalPostId: 'missing', delta: { toNumber: () => 9 } },
        { externalPostId: 'post-a', delta: { toNumber: () => 2 } },
      ],
    });
    repository.getMetricDayPosts.mockResolvedValue([
      {
        id: 'post-a',
        releaseId: 'post-a',
        content: 'Published post',
        image: null,
        publishDate: new Date('2026-08-15T12:00:00.000Z'),
        releaseURL: null,
      },
    ]);

    await expect(
      createService(repository).getMetricDayAnalytics(
        'org-a',
        'integration-a',
        'likes',
        '2026-08-15',
        0,
        50
      )
    ).resolves.toEqual(
      expect.objectContaining({
        metricKey: 'like_count',
        total: 1,
        matchedPostDeltaTotal: 2,
        unmatchedContributorCount: 1,
        posts: [
          expect.objectContaining({
            id: 'post-a',
            delta: 2,
          }),
        ],
      })
    );
    expect(repository.getMetricDayPosts).toHaveBeenCalledWith(
      'org-a',
      'integration-a',
      ['missing', 'post-a']
    );
  });

  it('returns an explicit empty state when snapshot provenance is unavailable', async () => {
    const repository = createRepository();
    repository.findOwnedIntegration.mockResolvedValue({
      id: 'integration-a',
      type: 'social',
    });
    repository.getMetricDayContributors.mockResolvedValue({
      dailyPointTotal: 4,
      hasProvenance: false,
      contributors: [],
    });

    await expect(
      createService(repository).getMetricDayAnalytics(
        'org-a',
        'integration-a',
        'likes',
        '2026-08-15',
        0,
        50
      )
    ).resolves.toMatchObject({
      reason: 'no_post_lifetime_provenance',
      dailyPointTotal: 4,
      posts: [],
    });
    expect(repository.getMetricDayPosts).not.toHaveBeenCalled();
  });

  it('rejects capture requests for unknown integrations', async () => {
    const repository = createRepository();
    repository.findOwnedIntegration.mockResolvedValue(null);
    const service = createService(repository);

    await expect(
      service.requestCapture('org-a', 'integration-a')
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.scheduleImmediateCapture).not.toHaveBeenCalled();
  });

  it('rejects capture for providers without snapshot support', async () => {
    const repository = createRepository();
    repository.findOwnedIntegration.mockResolvedValue({
      id: 'integration-a',
      type: 'social',
      disabled: false,
      deletedAt: null,
      providerIdentifier: 'discord',
    });
    const service = createService(repository);

    await expect(
      service.requestCapture('org-a', 'integration-a')
    ).rejects.toThrow('Analytics capture is unavailable');
    expect(repository.scheduleImmediateCapture).not.toHaveBeenCalled();
  });

  it('enforces a one-hour capture cooldown', async () => {
    const repository = createRepository();
    repository.findOwnedIntegration.mockResolvedValue({
      id: 'integration-a',
      type: 'social',
      disabled: false,
      deletedAt: null,
      providerIdentifier: 'facebook',
    });
    (ioRedis.set as jest.Mock).mockResolvedValue(null);
    const service = createService(repository);

    await expect(
      service.requestCapture('org-a', 'integration-a')
    ).rejects.toBeInstanceOf(HttpException);
    expect(repository.scheduleImmediateCapture).not.toHaveBeenCalled();
  });

  it('queues capture and pokes the analytics snapshot workflow', async () => {
    const repository = createRepository();
    repository.findOwnedIntegration.mockResolvedValue({
      id: 'integration-a',
      type: 'social',
      disabled: false,
      deletedAt: null,
      providerIdentifier: 'facebook',
    });
    const temporal = createTemporal();
    const service = createService(repository, temporal);

    await expect(
      service.requestCapture('org-a', 'integration-a')
    ).resolves.toEqual({
      status: 'queued',
      message: 'Analytics collection started. This may take a few minutes.',
    });
    expect(ioRedis.set).toHaveBeenCalledWith(
      'analytics-capture-request:org-a:integration-a',
      '1',
      'EX',
      3600,
      'NX'
    );
    expect(repository.scheduleImmediateCapture).toHaveBeenCalledWith(
      'org-a',
      'integration-a',
      new Date(0)
    );
    expect(temporal.signal).toHaveBeenCalledWith('channelAnalyticsSnapshot');
  });
});

import {
  applyDashboardAnalyticsPreferences,
  buildDashboardAnalyticsPreferences,
  dashboardMetricIdentity,
  reorderVisibleKeys,
} from './dashboard.analytics.layout';

describe('dashboardMetricIdentity', () => {
  it('prefers metricKey when present', () => {
    expect(
      dashboardMetricIdentity({
        metricKey: 'impressions',
        label: 'Impressions',
      })
    ).toBe('impressions');
  });

  it('falls back to label when metricKey is missing', () => {
    expect(dashboardMetricIdentity({ label: 'Impressions' })).toBe(
      'Impressions'
    );
  });
});

describe('applyDashboardAnalyticsPreferences', () => {
  const metrics = [
    { metricKey: 'impressions', label: 'Impressions' },
    { metricKey: 'likes', label: 'Likes' },
    { metricKey: 'followers', label: 'Followers' },
  ];

  it('keeps provider order when there are no preferences', () => {
    expect(
      applyDashboardAnalyticsPreferences(metrics, [], 'integration-1')
    ).toEqual({
      visible: metrics,
      hidden: [],
    });
  });

  it('reorders visible metrics and separates hidden ones', () => {
    expect(
      applyDashboardAnalyticsPreferences(
        metrics,
        [
          {
            integrationId: 'integration-1',
            metricKey: 'followers',
            position: 0,
            hidden: false,
          },
          {
            integrationId: 'integration-1',
            metricKey: 'impressions',
            position: 1,
            hidden: false,
          },
          {
            integrationId: 'integration-1',
            metricKey: 'likes',
            position: 2,
            hidden: true,
          },
        ],
        'integration-1'
      )
    ).toEqual({
      visible: [
        { metricKey: 'followers', label: 'Followers' },
        { metricKey: 'impressions', label: 'Impressions' },
      ],
      hidden: [{ metricKey: 'likes', label: 'Likes' }],
    });
  });

  it('appends new metrics that are missing from preferences', () => {
    expect(
      applyDashboardAnalyticsPreferences(
        metrics,
        [
          {
            integrationId: 'integration-1',
            metricKey: 'likes',
            position: 0,
            hidden: false,
          },
        ],
        'integration-1'
      ).visible.map((metric) => metric.metricKey)
    ).toEqual(['likes', 'impressions', 'followers']);
  });
});

describe('buildDashboardAnalyticsPreferences', () => {
  it('builds ordered visible and hidden preferences', () => {
    expect(
      buildDashboardAnalyticsPreferences(
        'integration-1',
        ['followers', 'impressions'],
        ['likes']
      )
    ).toEqual([
      {
        integrationId: 'integration-1',
        metricKey: 'followers',
        position: 0,
        hidden: false,
      },
      {
        integrationId: 'integration-1',
        metricKey: 'impressions',
        position: 1,
        hidden: false,
      },
      {
        integrationId: 'integration-1',
        metricKey: 'likes',
        position: 2,
        hidden: true,
      },
    ]);
  });
});

describe('reorderVisibleKeys', () => {
  it('moves a key from one index to another', () => {
    expect(reorderVisibleKeys(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('returns the same list for invalid indexes', () => {
    expect(reorderVisibleKeys(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

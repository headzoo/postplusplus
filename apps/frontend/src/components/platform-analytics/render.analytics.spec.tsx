/**
 * @jest-environment ./jest.jsdom.environment.js
 */

jest.mock('chart.js/auto', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
  })),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ alt }: { alt?: string }) => <span>{alt}</span>,
}));

jest.mock('@gitroom/frontend/components/analytics/chart-social', () => {
  const actual = jest.requireActual(
    '@gitroom/frontend/components/analytics/chart-social'
  );
  return {
    ...actual,
    ChartSocial: ({
      clickable,
      onPointClick,
    }: {
      clickable?: boolean;
      onPointClick?: (point: { date: string; total: number }) => void;
    }) => (
      <button
        type="button"
        data-testid="chart-social"
        data-clickable={clickable ? 'true' : 'false'}
        onClick={() => onPointClick?.({ date: '2026-08-20', total: 42 })}
      />
    ),
  };
});

jest.mock('@gitroom/react/form/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: unknown;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children as never}
    </button>
  ),
}));

const usePlatformAnalytics = jest.fn();
const requestCapture = jest.fn();

jest.mock(
  '@gitroom/frontend/components/platform-analytics/use.request.analytics.capture',
  () => ({
    useRequestAnalyticsCapture: () => ({
      requestCapture,
      isRequesting: false,
    }),
  })
);

jest.mock(
  '@gitroom/frontend/components/platform-analytics/use.platform.analytics',
  () => ({
    usePlatformAnalytics: (...args: unknown[]) => usePlatformAnalytics(...args),
  })
);

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AnalyticsCard,
  analyticsTotal,
  buildMetricDayPath,
  formatAnalyticsValue,
  isMetricDrilldownEligible,
  RenderAnalytics,
  resolveDisplayUnit,
  resolveValueMode,
} from './render.analytics';
import { MetricDayPostList } from '@gitroom/frontend/components/analytics/metric-day/metric-day-post-list';

expect.extend({
  toBeInTheDocument(received: unknown) {
    const pass = received != null;
    return {
      pass,
      message: () =>
        pass
          ? 'expected element not to be in the document'
          : 'expected element to be in the document',
    };
  },
});

describe('resolveValueMode', () => {
  it('prefers valueMode over legacy average flag', () => {
    expect(
      resolveValueMode({
        label: 'Impressions',
        data: [],
        valueMode: 'latest',
        average: true,
      })
    ).toBe('latest');
  });

  it('falls back to average when only legacy average is present', () => {
    expect(
      resolveValueMode({
        label: 'Engagement',
        data: [],
        average: true,
      })
    ).toBe('average');
  });
});

describe('analyticsTotal', () => {
  it('sums points for sum mode', () => {
    expect(
      analyticsTotal({
        label: 'Impressions',
        valueMode: 'sum',
        data: [
          { date: '2026-08-01', total: 10 },
          { date: '2026-08-02', total: 15 },
        ],
      })
    ).toBe('25');
  });

  it('averages points for average percentage mode', () => {
    expect(
      analyticsTotal({
        label: 'Engagement rate',
        valueMode: 'average',
        displayUnit: 'percentage',
        data: [
          { date: '2026-08-01', total: 10 },
          { date: '2026-08-02', total: 20 },
        ],
      })
    ).toBe('15.00%');
  });

  it('averages duration metrics without a percent suffix', () => {
    expect(
      analyticsTotal({
        label: 'Average View Duration',
        valueMode: 'average',
        displayUnit: 'duration',
        data: [
          { date: '2026-08-01', total: 45 },
          { date: '2026-08-02', total: 75 },
        ],
      })
    ).toBe('1:00');
  });

  it('formats duration values as mm:ss or seconds', () => {
    expect(formatAnalyticsValue(45, 'duration')).toBe('45s');
    expect(formatAnalyticsValue(90, 'duration')).toBe('1:30');
  });

  it('uses the latest sorted point for latest mode', () => {
    expect(
      analyticsTotal({
        label: 'Followers',
        valueMode: 'latest',
        data: [
          { date: '2026-08-03', total: 99 },
          { date: '2026-08-01', total: 50 },
          { date: '2026-08-02', total: 75 },
        ],
      })
    ).toBe('99');
  });
});

describe('resolveDisplayUnit', () => {
  it('defaults average metrics to percentage without display metadata', () => {
    expect(
      resolveDisplayUnit({
        label: 'Engagement rate',
        data: [],
        valueMode: 'average',
      })
    ).toBe('percentage');
  });

  it('respects explicit duration display metadata', () => {
    expect(
      resolveDisplayUnit({
        label: 'Average View Duration',
        data: [],
        valueMode: 'average',
        displayUnit: 'duration',
      })
    ).toBe('duration');
  });
});

describe('isMetricDrilldownEligible', () => {
  const eligibleItem = {
    label: 'Impressions',
    valueMode: 'sum' as const,
    drilldownSlug: 'impressions',
    data: [{ date: '2026-08-20', total: 10 }],
  };

  it('allows exact daily sum metrics with a drilldown slug', () => {
    expect(isMetricDrilldownEligible(eligibleItem)).toBe(true);
    expect(
      buildMetricDayPath('integration-1', 'impressions', '2026-08-20')
    ).toBe('/analytics/integration-1/impressions/2026-08-20');
  });

  it('rejects downsampled windows with more than seven source points', () => {
    expect(
      isMetricDrilldownEligible({
        ...eligibleItem,
        data: Array.from({ length: 8 }, (_, index) => ({
          date: `2026-08-${String(index + 1).padStart(2, '0')}`,
          total: index + 1,
        })),
      })
    ).toBe(false);
  });

  it('rejects line metrics and metrics without drilldown slugs', () => {
    expect(
      isMetricDrilldownEligible({
        label: 'Engagement rate',
        valueMode: 'average',
        drilldownSlug: 'likes',
        data: [{ date: '2026-08-20', total: 1 }],
      })
    ).toBe(false);
    expect(
      isMetricDrilldownEligible({
        label: 'Views',
        valueMode: 'sum',
        data: [{ date: '2026-08-20', total: 1 }],
      })
    ).toBe(false);
  });
});

describe('AnalyticsCard drill-down navigation', () => {
  it('routes eligible bar clicks through the supplied callback', () => {
    const onBarClick = jest.fn();

    render(
      <AnalyticsCard
        index={0}
        total="42"
        integrationId="integration-1"
        onBarClick={onBarClick}
        item={{
          label: 'Impressions',
          valueMode: 'sum',
          drilldownSlug: 'impressions',
          data: [{ date: '2026-08-20', total: 42 }],
        }}
      />
    );

    expect(
      screen.getByTestId('chart-social').getAttribute('data-clickable')
    ).toBe('true');
    fireEvent.click(screen.getByTestId('chart-social'));
    expect(onBarClick).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      drilldownSlug: 'impressions',
      date: '2026-08-20',
    });
  });

  it('does not enable chart clicks for ineligible metrics', () => {
    render(
      <AnalyticsCard
        index={0}
        total="12.50%"
        integrationId="integration-1"
        onBarClick={jest.fn()}
        item={{
          label: 'Engagement rate',
          valueMode: 'average',
          displayUnit: 'percentage',
          data: [{ date: '2026-08-20', total: 12.5 }],
        }}
      />
    );

    expect(
      screen.getByTestId('chart-social').getAttribute('data-clickable')
    ).toBe('false');
  });
});

describe('MetricDayPostList ordering', () => {
  it('preserves API order regardless of publish dates', () => {
    render(
      <MetricDayPostList
        channelName="Demo"
        posts={[
          {
            id: 'post-1',
            content: 'Later publish',
            publishDate: '2026-08-21T12:00:00.000Z',
            releaseId: 'release-1',
            releaseURL: 'https://example.com/1',
            delta: 50,
          },
          {
            id: 'post-2',
            content: 'Earlier publish',
            publishDate: '2026-08-01T12:00:00.000Z',
            releaseId: 'release-2',
            releaseURL: 'https://example.com/2',
            delta: 10,
          },
        ]}
      />
    );

    const contributions = screen.getAllByText(/^\+/);
    expect(contributions[0].textContent).toBe('+50');
    expect(contributions[1].textContent).toBe('+10');
    expect(screen.getByText('Later publish')).toBeTruthy();
    expect(screen.getByText('Earlier publish')).toBeTruthy();
  });
});

describe('usePlatformAnalytics', () => {
  it('loads dashboard analytics for the selected integration', async () => {
    await jest.isolateModulesAsync(async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: async () => [
          {
            id: 'integration-1',
            analytics: [{ label: 'Impressions', data: [] }],
          },
        ],
      });

      jest.doMock('@gitroom/helpers/utils/custom.fetch', () => ({
        useFetch: () => fetchMock,
      }));

      const { renderHook, waitFor } = await import('@testing-library/react');
      const { usePlatformAnalytics } = await import('./use.platform.analytics');
      const { result } = renderHook(() =>
        usePlatformAnalytics({ id: 'integration-1' } as any, 7)
      );

      await waitFor(() => expect(result.current.data?.length).toBe(1));
      expect(fetchMock).toHaveBeenCalledWith(
        '/analytics/dashboard?date=7&integrationId=integration-1'
      );
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes('/analytics/integration-1?date=')
        )
      ).toBe(false);
    });
  });
});

describe('AnalyticsCard', () => {
  it('hides the trend indicator when percentageChange is omitted', () => {
    render(
      <AnalyticsCard
        index={0}
        total="42"
        item={{
          label: 'Impressions',
          valueMode: 'sum',
          data: [{ date: '2026-08-01', total: 42 }],
        }}
      />
    );

    expect(screen.queryByText('%')).not.toBeInTheDocument();
    expect(screen.queryByText('pp')).not.toBeInTheDocument();
  });

  it('shows percentage-point trends for average percentage metrics', () => {
    render(
      <AnalyticsCard
        index={0}
        total="12.50%"
        item={{
          label: 'Engagement rate',
          valueMode: 'average',
          displayUnit: 'percentage',
          percentageChange: 2.5,
          data: [{ date: '2026-08-01', total: 12.5 }],
        }}
      />
    );

    expect(screen.getByText('2.5pp')).toBeInTheDocument();
  });

  it('shows plain trends for average duration metrics', () => {
    render(
      <AnalyticsCard
        index={0}
        total="1:05"
        item={{
          label: 'Average View Duration',
          valueMode: 'average',
          displayUnit: 'duration',
          percentageChange: 3.2,
          data: [{ date: '2026-08-01', total: 65 }],
        }}
      />
    );

    expect(screen.getByText('3.2')).toBeInTheDocument();
    expect(screen.queryByText('pp')).not.toBeInTheDocument();
    expect(screen.queryByText('%')).not.toBeInTheDocument();
  });
});

describe('RenderAnalytics collecting state', () => {
  it('shows a collecting message instead of a reconnect prompt', () => {
    usePlatformAnalytics.mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(
      <RenderAnalytics
        integration={
          {
            id: 'integration-1',
            providerIdentifier: 'facebook',
          } as any
        }
        date={7}
      />
    );

    expect(
      screen.getByText(
        'Analytics history is still being collected. Metrics will appear after the first daily snapshots.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Collect analytics')).toBeTruthy();
    expect(screen.queryByText('Refresh Channel')).toBeNull();
  });

  it('requests an on-demand capture from the empty state', async () => {
    usePlatformAnalytics.mockReturnValue({
      data: [],
      isLoading: false,
    });
    requestCapture.mockResolvedValue({
      status: 'queued',
      message: 'Analytics collection started. This may take a few minutes.',
    });

    render(
      <RenderAnalytics
        integration={
          {
            id: 'integration-1',
            providerIdentifier: 'facebook',
          } as any
        }
        date={7}
      />
    );

    fireEvent.click(screen.getByText('Collect analytics'));
    await waitFor(() => expect(requestCapture).toHaveBeenCalled());
  });
});

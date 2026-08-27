'use client';

import { FC, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import {
  formatAnalyticsValue,
  resolveDisplayUnit,
} from '@gitroom/frontend/components/platform-analytics/render.analytics';
import {
  MetricDayAnalyticsPost,
  useMetricDayAnalytics,
} from '@gitroom/frontend/components/analytics/metric-day/use.metric.day.analytics';
import { MetricDayPostList } from '@gitroom/frontend/components/analytics/metric-day/metric-day-post-list';
import { Button } from '@gitroom/react/form/button';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';

const METRIC_LABELS: Record<string, string> = {
  impressions: 'Impressions',
  bookmarks: 'Bookmarks',
  likes: 'Likes',
  quotes: 'Quotes',
  replies: 'Replies',
  retweets: 'Retweets',
};

const METRIC_DAY_PAGE_SIZE = 50;

export const MetricDayAnalyticsComponent: FC = () => {
  const t = useT();
  const params = useParams<{
    integrationId: string;
    metric: string;
    date: string;
  }>();
  const integrationId = params.integrationId;
  const metric = params.metric;
  const date = params.date;
  const [page, setPage] = useState(0);
  const [accumulatedPosts, setAccumulatedPosts] = useState<
    MetricDayAnalyticsPost[]
  >([]);

  const { data: integrations = [], isLoading: integrationsLoading } =
    useIntegrationList();
  const integration = useMemo(
    () => integrations.find((item) => item.id === integrationId),
    [integrationId, integrations]
  );

  const { data, error, isLoading, isValidating } = useMetricDayAnalytics(
    integrationId,
    metric,
    date,
    page,
    METRIC_DAY_PAGE_SIZE
  );

  useEffect(() => {
    setPage(0);
    setAccumulatedPosts([]);
  }, [integrationId, metric, date]);

  useEffect(() => {
    if (!data?.posts) {
      return;
    }
    setAccumulatedPosts((current) =>
      page === 0 ? data.posts : [...current, ...data.posts]
    );
  }, [data?.posts, page]);

  const metricLabel = METRIC_LABELS[metric] || metric;
  const displayUnit = resolveDisplayUnit({
    label: metricLabel,
    data: [],
    valueMode: 'sum',
  });
  const barTotal =
    data?.dailyPointTotal == null
      ? null
      : formatAnalyticsValue(data.dailyPointTotal, displayUnit);
  const matchedTotal =
    data == null
      ? null
      : formatAnalyticsValue(data.matchedPostDeltaTotal, displayUnit);
  const hasMore = !!data && (page + 1) * METRIC_DAY_PAGE_SIZE < data.total;
  const loading = integrationsLoading || (isLoading && page === 0);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-newBgColorInner p-[20px]">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-[20px] bg-newBgColorInner p-[20px]">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-[20px]">
        <div className="flex flex-wrap items-start justify-between gap-[12px]">
          <div className="min-w-0">
            <Link
              href="/analytics"
              className="text-[13px] text-newTableText hover:underline"
            >
              {t('back_to_analytics', 'Back to analytics')}
            </Link>
            <div className="mt-[12px] flex items-center gap-[10px]">
              {integration && (
                <ImageWithFallback
                  fallbackSrc="/no-picture.jpg"
                  src={integration.picture || '/no-picture.jpg'}
                  className="rounded-[8px]"
                  alt={integration.identifier}
                  width={40}
                  height={40}
                />
              )}
              <div className="min-w-0">
                <h1 className="truncate text-[22px] font-[600] text-newTableText">
                  {metricLabel}
                </h1>
                <p className="truncate text-[14px] text-newTableText/70">
                  {integration?.name || integration?.display || integrationId}
                </p>
                <p className="text-[13px] text-newTableText/70">
                  {t('utc_day', 'UTC day')}: {date}
                </p>
              </div>
            </div>
          </div>
          {barTotal != null && (
            <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader px-[16px] py-[12px] text-end">
              <div className="text-[12px] uppercase tracking-wide text-newTableText/70">
                {t('daily_bar_total', 'Daily bar total')}
              </div>
              <div className="text-[28px] font-semibold text-newTableText">
                {barTotal}
              </div>
              {matchedTotal != null && data && data.total > 0 && (
                <div className="mt-[4px] text-[12px] text-newTableText/70">
                  {t('matched_posts_total', 'Matched posts total')}:{' '}
                  {matchedTotal}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-[12px] border border-red-500/40 bg-newTableHeader px-[16px] py-[20px] text-[14px] text-newTableText">
            {t(
              'metric_day_load_error',
              'Unable to load metric details. Please try again.'
            )}
          </div>
        )}

        {!error && data?.reason === 'no_post_lifetime_provenance' && (
          <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader px-[16px] py-[24px] text-center text-[14px] text-newTableText">
            {t(
              'metric_day_no_provenance',
              'Contribution details are unavailable because post-lifetime snapshots are missing for this day.'
            )}
          </div>
        )}

        {!error &&
          data &&
          !data.reason &&
          data.total === 0 &&
          accumulatedPosts.length === 0 && (
            <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader px-[16px] py-[24px] text-center text-[14px] text-newTableText">
              {t(
                'metric_day_no_contributors',
                'No posts contributed to this daily metric change.'
              )}
            </div>
          )}

        {!error && !!data?.unmatchedContributorCount && (
          <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader px-[16px] py-[14px] text-[13px] text-newTableText">
            {t(
              'metric_day_unmatched_contributors',
              '{{count}} contributor(s) could not be matched to local posts.',
              { count: data.unmatchedContributorCount }
            )}
          </div>
        )}

        {!error && accumulatedPosts.length > 0 && (
          <MetricDayPostList
            posts={accumulatedPosts}
            channelName={integration?.name}
            channelPicture={integration?.picture}
            channelIdentifier={integration?.identifier}
          />
        )}

        {!error && hasMore && (
          <div className="flex justify-center">
            <Button
              loading={isValidating}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('load_more', 'Load more')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Integration } from '@prisma/client';
import {
  AnalyticsValueMode,
  ChartSocial,
  sortAnalyticsPoints,
} from '@gitroom/frontend/components/analytics/chart-social';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { usePlatformAnalytics } from '@gitroom/frontend/components/platform-analytics/use.platform.analytics';
import { useRequestAnalyticsCapture } from '@gitroom/frontend/components/platform-analytics/use.request.analytics.capture';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useRouter } from 'next/navigation';
import { CloseIconSmall } from '@gitroom/frontend/components/ui/icons';
import clsx from 'clsx';

export type AnalyticsDisplayUnit =
  | 'count'
  | 'percentage'
  | 'duration'
  | 'decimal';

export interface AnalyticsDataItem {
  label: string;
  metricKey?: string;
  drilldownSlug?: string | null;
  data: Array<{ total: number; date: string }>;
  valueMode?: AnalyticsValueMode;
  displayUnit?: AnalyticsDisplayUnit;
  average?: boolean;
  percentageChange?: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isExactIsoDate = (date: string) => ISO_DATE_RE.test(date);

export const isMetricDrilldownEligible = (item: AnalyticsDataItem) => {
  if (resolveValueMode(item) !== 'sum') {
    return false;
  }
  if (!item.drilldownSlug) {
    return false;
  }
  const sorted = sortAnalyticsPoints(item.data);
  if (!sorted.length || sorted.length > 7) {
    return false;
  }
  return sorted.every((point) => isExactIsoDate(point.date));
};

export const buildMetricDayPath = (
  integrationId: string,
  drilldownSlug: string,
  date: string
) => `/analytics/${integrationId}/${drilldownSlug}/${date}`;

export type MetricDayBarClick = {
  integrationId: string;
  drilldownSlug: string;
  date: string;
};

export const resolveValueMode = (
  item: AnalyticsDataItem
): AnalyticsValueMode => {
  if (item.valueMode) {
    return item.valueMode;
  }

  if (item.average) {
    return 'average';
  }

  return 'sum';
};

export const resolveDisplayUnit = (
  item: AnalyticsDataItem
): AnalyticsDisplayUnit => {
  if (item.displayUnit) {
    return item.displayUnit;
  }

  const mode = resolveValueMode(item);
  if (mode === 'average') {
    return 'percentage';
  }

  return 'count';
};

export const formatDuration = (seconds: number): string => {
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }

  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export const formatAnalyticsValue = (
  value: number,
  displayUnit: AnalyticsDisplayUnit
): string => {
  switch (displayUnit) {
    case 'percentage':
      return `${value.toFixed(2)}%`;
    case 'duration':
      return formatDuration(value);
    case 'decimal':
      return value.toFixed(2);
    default:
      return new Intl.NumberFormat().format(Math.round(value));
  }
};

export const analyticsTotal = (item: AnalyticsDataItem) => {
  const sorted = sortAnalyticsPoints(item.data);
  const mode = resolveValueMode(item);
  const displayUnit = resolveDisplayUnit(item);

  if (sorted.length === 0) {
    return formatAnalyticsValue(0, displayUnit);
  }

  let value: number;
  if (mode === 'sum') {
    value = sorted.reduce((acc, curr) => acc + curr.total, 0);
  } else if (mode === 'average') {
    value = sorted.reduce((acc, curr) => acc + curr.total, 0) / sorted.length;
  } else {
    value = sorted[sorted.length - 1].total;
  }

  return formatAnalyticsValue(value, displayUnit);
};

const TrendIndicator: FC<{
  value: number;
  valueMode: AnalyticsValueMode;
  displayUnit: AnalyticsDisplayUnit;
}> = ({ value, valueMode, displayUnit }) => {
  if (value === 0) return null;

  const isPositive = value > 0;
  const displayValue = Math.abs(value).toFixed(1);
  const suffix =
    valueMode === 'average' && displayUnit === 'percentage'
      ? 'pp'
      : valueMode === 'average'
      ? ''
      : '%';

  return (
    <div
      className={`flex items-center gap-[4px] text-[13px] font-medium ${
        isPositive ? 'text-[#32d583]' : 'text-[#f97066]'
      }`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className={isPositive ? '' : 'rotate-180'}
      >
        <path d="M6 2.5L10 7.5H2L6 2.5Z" fill="currentColor" />
      </svg>
      <span>
        {displayValue}
        {suffix}
      </span>
    </div>
  );
};

export const AnalyticsCard: FC<{
  item: AnalyticsDataItem;
  total: string | number;
  index: number;
  integrationId?: string;
  onBarClick?: (params: MetricDayBarClick) => void;
  onRemove?: () => void;
  isDragging?: boolean;
  dragHandleRef?: (node: HTMLDivElement | null) => void;
}> = ({
  item,
  total,
  index,
  integrationId,
  onBarClick,
  onRemove,
  isDragging,
  dragHandleRef,
}) => {
  const t = useT();
  const colorVariants = ['purple', 'green', 'blue'] as const;
  const color = colorVariants[index % colorVariants.length];
  const valueMode = resolveValueMode(item);
  const displayUnit = resolveDisplayUnit(item);
  const chartData = sortAnalyticsPoints(item.data);
  const hasDataPoints = chartData.length >= 1;
  const drilldownEligible = isMetricDrilldownEligible(item);
  const handlePointClick = useCallback(
    (point: { date: string }) => {
      if (!drilldownEligible || !integrationId || !item.drilldownSlug) {
        return;
      }
      if (!isExactIsoDate(point.date)) {
        return;
      }
      onBarClick?.({
        integrationId,
        drilldownSlug: item.drilldownSlug,
        date: point.date,
      });
    },
    [drilldownEligible, integrationId, item.drilldownSlug, onBarClick]
  );

  return (
    <div className={clsx('group relative', isDragging && 'opacity-40')}>
      <div
        className={`
          flex flex-col h-full
          bg-newTableHeader
          border border-newTableBorder
          rounded-[12px]
          overflow-hidden
          transition-all duration-200
          hover:border-[#eb3825]/50
        `}
      >
        <div className="flex items-center justify-between px-[16px] pt-[14px] pb-[8px] gap-[8px]">
          <div
            ref={dragHandleRef}
            className={clsx(
              'flex min-w-0 items-center gap-[10px]',
              dragHandleRef && 'cursor-grab active:cursor-grabbing'
            )}
            aria-label={
              dragHandleRef
                ? t('drag_to_reorder_stat', 'Drag to reorder stat')
                : undefined
            }
          >
            <div
              className={`
                w-[8px] h-[8px] rounded-full shrink-0
                ${color === 'purple' ? 'bg-[#eb3825]' : ''}
                ${color === 'green' ? 'bg-[#32d583]' : ''}
                ${color === 'blue' ? 'bg-[#1d9bf0]' : ''}
              `}
            />
            <span className="text-[15px] font-medium text-newTableText truncate">
              {item.label}
            </span>
          </div>
          <div className="flex items-center gap-[8px] shrink-0">
            {item.percentageChange !== undefined && (
              <TrendIndicator
                value={item.percentageChange}
                valueMode={valueMode}
                displayUnit={displayUnit}
              />
            )}
            {onRemove && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove();
                }}
                className="inline-flex h-[24px] w-[24px] items-center justify-center rounded-[6px] text-newTableText hover:bg-newBgColorInner hover:text-newTextColor"
                aria-label={t('remove_stat', 'Remove stat')}
              >
                <CloseIconSmall size={10} />
              </button>
            )}
          </div>
        </div>

        {hasDataPoints ? (
          <>
            <div className="flex-1 px-[12px] py-[8px]">
              <div className="h-[120px] relative">
                <ChartSocial
                  data={chartData}
                  color={color}
                  valueMode={valueMode}
                  clickable={
                    drilldownEligible && !!integrationId && !!onBarClick
                  }
                  onPointClick={handlePointClick}
                  key={`chart-${index}`}
                />
              </div>
            </div>

            <div className="px-[16px] pb-[14px]">
              <div className="text-[36px] leading-[42px] font-semibold tracking-tight">
                {total}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-[32px] px-[16px]">
            <div className="text-[48px] leading-[56px] font-semibold tracking-tight">
              {total}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ANALYTICS_POLL_INTERVAL_MS = 15_000;
const ANALYTICS_POLL_DURATION_MS = 5 * 60 * 1000;

export const CollectAnalyticsButton: FC<{
  integrationId: string;
  providerIdentifier?: string;
  disabled?: boolean;
  onQueued?: () => void;
}> = ({ integrationId, providerIdentifier, disabled, onQueued }) => {
  const t = useT();
  const toaster = useToaster();
  const { requestCapture, isRequesting } =
    useRequestAnalyticsCapture(integrationId);

  const collect = async () => {
    try {
      const result = await requestCapture();
      toaster.show(
        result.message ||
          t(
            'analytics_collection_started',
            'Analytics collection started. This may take a few minutes.'
          ),
        'success'
      );
      onQueued?.();
    } catch (error) {
      toaster.show(
        error instanceof Error
          ? error.message
          : t(
              'analytics_collection_failed',
              'Unable to start analytics collection'
            ),
        'warning'
      );
    }
  };

  return (
    <div className="mt-[16px] flex flex-col items-center gap-[8px]">
      <Button
        onClick={collect}
        loading={isRequesting}
        disabled={disabled || isRequesting}
      >
        {t('collect_analytics', 'Collect analytics')}
      </Button>
      {providerIdentifier === 'x' && (
        <p className="text-[13px] text-newTableText text-center max-w-[420px]">
          {t(
            'analytics_x_two_collections',
            'X analytics may require two collections before charts appear.'
          )}
        </p>
      )}
    </div>
  );
};

const EmptyState: FC<{
  integrationId: string;
  providerIdentifier?: string;
  collecting?: boolean;
  onCollect?: () => void;
}> = ({ integrationId, providerIdentifier, collecting, onCollect }) => {
  const t = useT();

  return (
    <div className="col-span-full flex flex-col items-center justify-center py-[48px] px-[24px] bg-newTableHeader border border-newTableBorder rounded-[12px]">
      <div className="w-[48px] h-[48px] mb-[16px] rounded-full bg-[#eb3825]/10 flex items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-[#eb3825]"
        >
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path d="M12 8v4l2 2" />
        </svg>
      </div>
      <p className="text-[15px] text-newTableText text-center">
        {collecting
          ? t(
              'analytics_collection_in_progress',
              'Analytics collection started. This may take a few minutes.'
            )
          : t(
              'analytics_collecting_history',
              'Analytics history is still being collected. Metrics will appear after the first daily snapshots.'
            )}
      </p>
      <CollectAnalyticsButton
        integrationId={integrationId}
        providerIdentifier={providerIdentifier}
        disabled={collecting}
        onQueued={onCollect}
      />
    </div>
  );
};

export const RenderAnalytics: FC<{
  integration: Integration;
  date: number;
}> = (props) => {
  const { integration, date } = props;
  const router = useRouter();
  const [polling, setPolling] = useState(false);
  const { data, isLoading } = usePlatformAnalytics(
    integration,
    date,
    polling ? ANALYTICS_POLL_INTERVAL_MS : 0
  );
  const handleBarClick = useCallback(
    ({ integrationId, drilldownSlug, date: day }: MetricDayBarClick) => {
      router.push(buildMetricDayPath(integrationId, drilldownSlug, day));
    },
    [router]
  );

  useEffect(() => {
    if (data?.length) {
      setPolling(false);
    }
  }, [data]);

  useEffect(() => {
    if (!polling) {
      return;
    }
    const timeout = setTimeout(
      () => setPolling(false),
      ANALYTICS_POLL_DURATION_MS
    );
    timeout.unref?.();
    return () => clearTimeout(timeout);
  }, [polling]);

  const totals = useMemo(() => {
    return data?.map((item: AnalyticsDataItem) => analyticsTotal(item));
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[48px]">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[16px]">
      {data?.length === 0 && (
        <EmptyState
          integrationId={integration.id}
          providerIdentifier={integration.providerIdentifier}
          collecting={polling}
          onCollect={() => setPolling(true)}
        />
      )}
      {data?.map((item: AnalyticsDataItem, index: number) => (
        <AnalyticsCard
          key={`analytics-${index}`}
          item={item}
          total={totals?.[index] ?? analyticsTotal(item)}
          index={index}
          integrationId={integration.id}
          onBarClick={handleBarClick}
        />
      ))}
    </div>
  );
};

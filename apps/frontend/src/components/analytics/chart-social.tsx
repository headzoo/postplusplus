'use client';

import { FC, useEffect, useMemo, useRef } from 'react';
import DrawChart from 'chart.js/auto';
import type { ChartEvent, ActiveElement } from 'chart.js';
import { TotalList } from '@gitroom/frontend/components/analytics/stars.and.forks.interface';
import useCookie from 'react-use-cookie';

export type AnalyticsValueMode = 'sum' | 'average' | 'latest';

const colorSchemes = {
  purple: {
    start: 'rgba(97, 43, 211, 0.8)',
    end: 'rgba(97, 43, 211, 0.1)',
    border: 'rgb(97, 43, 211)',
  },
  green: {
    start: 'rgba(50, 213, 131, 0.8)',
    end: 'rgba(50, 213, 131, 0.1)',
    border: 'rgb(50, 213, 131)',
  },
  blue: {
    start: 'rgba(29, 155, 240, 0.8)',
    end: 'rgba(29, 155, 240, 0.1)',
    border: 'rgb(29, 155, 240)',
  },
};

export const sortAnalyticsPoints = (data: TotalList[]): TotalList[] =>
  [...data].sort((a, b) => a.date.localeCompare(b.date));

export const downsampleAnalyticsPoints = (
  data: TotalList[],
  valueMode: AnalyticsValueMode,
  maxBuckets = 7
): TotalList[] => {
  const sorted = sortAnalyticsPoints(data);
  if (sorted.length <= maxBuckets) {
    return sorted;
  }

  const chunkSize = Math.ceil(sorted.length / maxBuckets);
  const buckets: TotalList[] = [];

  for (let index = 0; index < sorted.length; index += chunkSize) {
    const row = sorted.slice(index, index + chunkSize);
    const first = row[0];
    const last = row[row.length - 1];
    const date = row.length === 1 ? first.date : `${first.date} - ${last.date}`;

    let total: number;
    if (valueMode === 'sum') {
      total = row.reduce((acc, curr) => acc + curr.total, 0);
    } else if (valueMode === 'average') {
      total = row.reduce((acc, curr) => acc + curr.total, 0) / row.length;
    } else {
      total = last.total;
    }

    buckets.push({ date, total });
  }

  return buckets;
};

export const ChartSocial: FC<{
  data: TotalList[];
  color?: 'purple' | 'green' | 'blue';
  valueMode?: AnalyticsValueMode;
  clickable?: boolean;
  onPointClick?: (point: TotalList) => void;
}> = (props) => {
  const {
    data,
    color = 'purple',
    valueMode = 'sum',
    clickable = false,
    onPointClick,
  } = props;
  const [mode] = useCookie('mode', 'dark');

  const list = useMemo(
    () => downsampleAnalyticsPoints(data, valueMode),
    [data, valueMode]
  );

  const hasNegativeValues = useMemo(
    () => list.some((row) => row.total < 0),
    [list]
  );

  const isSinglePoint = list.length === 1;
  const chartType = valueMode === 'sum' ? 'bar' : 'line';
  const isInteractive = clickable && !!onPointClick;

  const ref = useRef<HTMLCanvasElement | null>(null);
  const chart = useRef<DrawChart | null>(null);
  const listRef = useRef(list);
  const onPointClickRef = useRef(onPointClick);

  listRef.current = list;
  onPointClickRef.current = onPointClick;

  const colors = colorSchemes[color];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    canvas.style.cursor = isInteractive ? 'pointer' : '';

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, colors.start);
    gradient.addColorStop(1, colors.end);

    chart.current = new DrawChart(canvas, {
      type: chartType,
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: {
          duration: 750,
          easing: 'easeOutQuart',
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        onClick: isInteractive
          ? (_event: ChartEvent, elements: ActiveElement[]) => {
              if (!elements.length || !chart.current) {
                return;
              }
              const point = listRef.current[elements[0].index];
              if (point) {
                onPointClickRef.current?.(point);
              }
            }
          : undefined,
        layout: {
          padding: {
            left: 0,
            right: 0,
            top: 4,
            bottom: 0,
          },
        },
        scales: {
          y: {
            beginAtZero: !hasNegativeValues,
            display: false,
          },
          x: {
            display: false,
            ticks: {
              stepSize: 10,
              maxTicksLimit: 7,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            enabled: true,
            backgroundColor: mode === 'dark' ? '#1e1d1d' : '#fff',
            titleColor: mode === 'dark' ? '#fff' : '#000',
            bodyColor: mode === 'dark' ? '#9c9c9c' : '#777',
            borderColor: mode === 'dark' ? '#2b2b2b' : '#e7e9eb',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            titleFont: {
              size: 12,
              weight: 'normal',
            },
            bodyFont: {
              size: 14,
              weight: 'bold',
            },
          },
        },
      },
      data: {
        labels: list.map((row) => row.date),
        datasets: [
          {
            borderColor: colors.border,
            borderWidth: chartType === 'line' ? 2 : 0,
            label: 'Total',
            backgroundColor: chartType === 'line' ? gradient : colors.start,
            fill: chartType === 'line',
            data: list.map((row) => row.total),
            tension: 0.4,
            pointRadius: isSinglePoint ? 4 : 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: colors.border,
            pointHoverBorderColor: mode === 'dark' ? '#1e1d1d' : '#fff',
            pointHoverBorderWidth: 2,
          },
        ],
      },
    });

    return () => {
      chart.current?.destroy();
    };
  }, [
    chartType,
    colors,
    hasNegativeValues,
    isInteractive,
    isSinglePoint,
    list,
    mode,
  ]);

  return <canvas className="w-full h-full" ref={ref} />;
};

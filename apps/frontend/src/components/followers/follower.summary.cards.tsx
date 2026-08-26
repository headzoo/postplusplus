'use client';

import { FC } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  FOLLOWER_SEGMENT_COLOR_CLASSES,
  FOLLOWER_SUMMARY_SEGMENTS,
  categoryCount,
  formatSegmentCount,
} from '@gitroom/frontend/components/followers/follower.segments';
import { FollowerAudienceSummary } from '@gitroom/frontend/components/followers/use.followers';

export const FollowerSummaryCards: FC<{
  summary?: FollowerAudienceSummary;
  isLoading?: boolean;
  buildHref: (slug?: string) => string;
  isVisible?: (slug: (typeof FOLLOWER_SUMMARY_SEGMENTS)[number]['slug']) => boolean;
}> = ({ summary, isLoading, buildHref, isVisible = () => true }) => {
  const t = useT();

  return (
    <div
      className="grid grid-cols-2 gap-[12px] sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10"
      data-testid="followers-summary-cards"
    >
      {FOLLOWER_SUMMARY_SEGMENTS.map((segment) => {
        if (!isVisible(segment.slug)) {
          return null;
        }
        const colors = FOLLOWER_SEGMENT_COLOR_CLASSES[segment.color];
        const Icon = segment.icon;
        const count =
          segment.slug === 'all'
            ? summary?.total ?? null
            : segment.isBot
              ? categoryCount(summary?.categories, 'bots')
              : categoryCount(
                  summary?.categories,
                  segment.categoryKey || segment.slug
                );
        const href = buildHref(
          segment.slug === 'all' ? undefined : segment.slug
        );

        return (
          <Link
            key={segment.slug}
            href={href}
            scroll={false}
            className={clsx(
              'flex flex-col gap-[10px] rounded-[8px] border border-newTableBorder bg-newTableHeader p-[14px] transition-colors hover:border-newTextColor/20',
              isLoading && 'animate-pulse'
            )}
            data-summary-segment={segment.slug}
          >
            <div className="flex items-center gap-[8px]">
              <span
                className={clsx(
                  'inline-flex h-[28px] w-[28px] items-center justify-center rounded-[8px]',
                  colors.iconBg,
                  colors.text
                )}
              >
                <Icon size={16} />
              </span>
              <span className="text-[13px] text-textItemBlur">
                {t(segment.key, segment.defaultLabel)}
              </span>
            </div>
            <span className="text-[24px] font-[600] leading-none text-newTextColor">
              {isLoading ? '…' : formatSegmentCount(count)}
            </span>
          </Link>
        );
      })}
    </div>
  );
};

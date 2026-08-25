'use client';

import { FC, KeyboardEvent } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  FOLLOWER_BOARD_SEGMENTS,
  FOLLOWER_SEGMENT_COLOR_CLASSES,
  FollowerSegmentDefinition,
  formatSegmentCount,
} from '@gitroom/frontend/components/followers/follower.segments';
import { Follower } from '@gitroom/frontend/components/followers/use.followers';

const formatCompactCount = (value: number) => {
  const count = Math.abs(Math.round(value));
  if (count < 10000) {
    return count.toLocaleString('en-US');
  }
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(count);
};

export const FollowerBoardRow: FC<{
  follower: Follower;
  color: FollowerSegmentDefinition['color'];
  onOpen: () => void;
}> = ({ follower, color, onOpen }) => {
  const t = useT();
  const colors = FOLLOWER_SEGMENT_COLOR_CLASSES[color];
  const handle = follower.username
    ? follower.username.startsWith('@')
      ? follower.username
      : `@${follower.username}`
    : null;
  const interactions = Number.isFinite(follower.interactionCount)
    ? formatCompactCount(follower.interactionCount!)
    : null;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className="flex w-full items-center gap-[10px] rounded-[10px] px-[6px] py-[8px] text-start transition-colors hover:bg-newTableHeader"
      data-testid="followers-board-row"
    >
      <div className="h-[36px] w-[36px] shrink-0 overflow-hidden rounded-full bg-newTableHeader">
        {follower.picture ? (
          <ImageWithFallback
            fallbackSrc="/no-picture.jpg"
            src={follower.picture}
            alt=""
            width={36}
            height={36}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[12px] text-textItemBlur">
            {(follower.name || follower.username || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-newTextColor">
          {follower.name || handle || t('followers_unknown', 'Unknown')}
        </p>
        {handle && (
          <p className="truncate text-[12px] text-textItemBlur">{handle}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-[6px] text-[12px] text-textItemBlur">
        {interactions != null && (
          <span>
            {interactions}{' '}
            {t('followers_interaction_count', 'Interactions')}
          </span>
        )}
        <span
          className={clsx('h-[7px] w-[7px] rounded-full', colors.statusDot)}
          aria-hidden="true"
        />
      </div>
    </button>
  );
};

export const FollowerBoardColumn: FC<{
  segment: FollowerSegmentDefinition;
  items: Follower[];
  total: number | null;
  isLoading?: boolean;
  viewAllHref: string;
  onOpenFollower: (follower: Follower) => void;
}> = ({
  segment,
  items,
  total,
  isLoading,
  viewAllHref,
  onOpenFollower,
}) => {
  const t = useT();
  const colors = FOLLOWER_SEGMENT_COLOR_CLASSES[segment.color];
  const Icon = segment.icon;
  const countLabel = formatSegmentCount(total);
  const preview = items.slice(0, 3);

  return (
    <div
      className="flex min-w-[240px] flex-1 flex-col gap-[12px] rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[14px]"
      data-testid="followers-board-column"
      data-board-segment={segment.slug}
    >
      <div className="flex items-start gap-[10px]">
        <span
          className={clsx(
            'inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px]',
            colors.iconBg,
            colors.text
          )}
        >
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-[8px]">
            <h3 className="text-[15px] font-medium text-newTextColor">
              {t(segment.key, segment.defaultLabel)}
            </h3>
            <span className="text-[12px] text-textItemBlur">
              {`${countLabel} ${t('followers_board_users_label', 'users')}`}
            </span>
          </div>
          <p className="mt-[4px] text-[12px] leading-[1.4] text-textItemBlur">
            {t(segment.descriptionKey, segment.defaultDescription)}
          </p>
        </div>
      </div>

      <div className="flex min-h-[156px] flex-col gap-[2px]">
        {isLoading &&
          Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-[52px] animate-pulse rounded-[10px] bg-newTableHeader"
            />
          ))}
        {!isLoading &&
          preview.map((follower) => (
            <FollowerBoardRow
              key={follower.id}
              follower={follower}
              color={segment.color}
              onOpen={() => onOpenFollower(follower)}
            />
          ))}
        {!isLoading && preview.length === 0 && (
          <p className="px-[6px] py-[16px] text-[12px] text-textItemBlur">
            {t('followers_board_empty', 'No people in this segment yet.')}
          </p>
        )}
      </div>

      <Link
        href={viewAllHref}
        scroll={false}
        className={clsx(
          'mt-auto inline-flex items-center justify-center rounded-[10px] border px-[12px] py-[8px] text-[13px] transition-colors',
          colors.outlineButton
        )}
        data-testid="followers-board-view-all"
      >
        {`${t('followers_board_view_all_label', 'View all')} (${countLabel})`}
      </Link>
    </div>
  );
};

export const FollowerBoard: FC<{
  columns: Array<{
    segment: FollowerSegmentDefinition;
    items: Follower[];
    total: number | null;
    isLoading?: boolean;
    viewAllHref: string;
  }>;
  onOpenFollower: (follower: Follower) => void;
}> = ({ columns, onOpenFollower }) => {
  return (
    <div
      className="flex gap-[12px] overflow-x-auto pb-[4px]"
      data-testid="followers-board"
    >
      {columns.map((column) => (
        <FollowerBoardColumn
          key={column.segment.slug}
          segment={column.segment}
          items={column.items}
          total={column.total}
          isLoading={column.isLoading}
          viewAllHref={column.viewAllHref}
          onOpenFollower={onOpenFollower}
        />
      ))}
    </div>
  );
};

export { FOLLOWER_BOARD_SEGMENTS };

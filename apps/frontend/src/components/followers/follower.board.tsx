'use client';

import { FC, KeyboardEvent, MouseEvent, useCallback } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  FOLLOWER_BOARD_LIST_MIN_HEIGHT_PX,
  FOLLOWER_BOARD_PREVIEW_LIMIT,
  FOLLOWER_BOARD_SEGMENTS,
  FOLLOWER_BOARD_VISIBLE_ROWS,
  FOLLOWER_SEGMENT_COLOR_CLASSES,
  FollowerSegmentColor,
  FollowerSegmentDefinition,
  formatSegmentCount,
  getFollowerBoardColumnAction,
} from '@gitroom/frontend/components/followers/follower.segments';
import { CustomScrollArea } from '@gitroom/frontend/components/ui/custom.scroll.area';
import {
  HelpIcon,
  MoreIcon,
  TagIcon,
} from '@gitroom/frontend/components/ui/icons';
import {
  DismissTriageOptions,
  useRelationshipTriageDismiss,
} from '@gitroom/frontend/components/followers/follower.card';
import { useUnfollowConfirmModal } from '@gitroom/frontend/components/followers/unfollow.confirm.modal';
import {
  DismissibleTriage,
  Follower,
  FollowerList,
  getProfileLinkAutoSnoozeTriages,
  useFollowers,
} from '@gitroom/frontend/components/followers/use.followers';
import { LeadFitDismissReason } from '@gitroom/nestjs-libraries/dtos/integrations/lead-fit-feedback.types';

dayjs.extend(relativeTime);

const CONVERSION_TYPE_LABELS: Record<string, string> = {
  follower_gained: 'Follower gained',
  website_goal: 'Website goal',
  amplification_threshold: 'Amplification',
  support_sla_hit: 'Support SLA',
  support_issue_resolved: 'Support resolved',
};

const formatConversionTypeLabel = (conversionType: string) =>
  CONVERSION_TYPE_LABELS[conversionType] ??
  conversionType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const BOARD_GRID_CLASS =
  'grid grid-cols-1 gap-[12px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

const boardListAreaStyle = {
  height: FOLLOWER_BOARD_LIST_MIN_HEIGHT_PX,
  minHeight: FOLLOWER_BOARD_LIST_MIN_HEIGHT_PX,
  maxHeight: FOLLOWER_BOARD_LIST_MIN_HEIGHT_PX,
};

export const FollowerBoardRow: FC<{
  follower: Follower;
  segment: FollowerSegmentDefinition;
  canFollow?: boolean;
  canUnfollow?: boolean;
  lists?: FollowerList[];
  onOpen: () => void;
  onDismissTriage?: (
    triage: DismissibleTriage,
    reasons?: LeadFitDismissReason[],
    options?: DismissTriageOptions
  ) => Promise<void> | void;
  onUnfollow?: () => Promise<void> | void;
}> = ({
  follower,
  segment,
  canFollow = false,
  canUnfollow = false,
  lists = [],
  onOpen,
  onDismissTriage,
  onUnfollow,
}) => {
    const t = useT();
    const columnAction = getFollowerBoardColumnAction(segment.slug);
    const triage =
      columnAction?.type === 'triage' ? columnAction.triage : undefined;
    const { dismiss: dismissTriage } = useRelationshipTriageDismiss({
      triage: triage ?? 'lead',
      canFollow,
      lists,
      onRemove: triage ? onDismissTriage : undefined,
    });
    const unfollowConfirm = useUnfollowConfirmModal();
    const showMenu =
      columnAction?.type === 'unfollow'
        ? canUnfollow && !!onUnfollow
        : !!triage && !!onDismissTriage;

    const handle = follower.username
      ? follower.username.startsWith('@')
        ? follower.username
        : `@${follower.username}`
      : null;
    const displayName =
      follower.name || handle || t('followers_unknown', 'Unknown');
    const conversionSubtitle =
      segment.slug === 'conversions' &&
        follower.latestConversionType &&
        follower.lastConvertedAt
        ? t('followers_board_conversion_subtitle', '{{type}} · {{when}}', {
          type: formatConversionTypeLabel(follower.latestConversionType),
          when: dayjs(follower.lastConvertedAt).fromNow(),
        })
        : null;

    const handleRowClick = () => {
      onOpen();
    };

    const handleRowKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.closest('a[href]') || event.target.closest('button'))
      ) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpen();
      }
    };

    const handleProfileLinkClick = async (
      event: MouseEvent<HTMLAnchorElement>
    ) => {
      event.stopPropagation();
      if (!onDismissTriage) {
        return;
      }
      const triages = getProfileLinkAutoSnoozeTriages(follower);
      for (const item of triages) {
        await onDismissTriage(item, undefined, { snooze: true });
      }
    };

    const stopNestedAction = (event: MouseEvent | KeyboardEvent) => {
      event.stopPropagation();
    };

    const handleMenuClick = useCallback(
      async (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        event.preventDefault();
        if (!columnAction) {
          return;
        }
        if (columnAction.type === 'unfollow') {
          if (!onUnfollow) {
            return;
          }
          const action = await unfollowConfirm.open();
          if (action !== 'unfollow') {
            return;
          }
          await onUnfollow();
          return;
        }
        await dismissTriage();
      },
      [columnAction, dismissTriage, onUnfollow, unfollowConfirm]
    );

    const avatar = follower.picture ? (
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
        {displayName.slice(0, 1).toUpperCase()}
      </div>
    );

    return (
      <article
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
        className={clsx(
          'flex w-full cursor-pointer items-center gap-[10px] rounded-[8px] border border-newTableBorder bg-newTableHeader px-[6px] py-[8px] text-start transition-colors hover:border-newTextColor/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-newTextColor/30'
        )}
        data-testid="followers-board-row"
      >
        <div className="h-[36px] w-[36px] shrink-0 overflow-hidden rounded-full bg-newBgColorInner">
          {follower.profileUrl ? (
            <a
              href={follower.profileUrl}
              target="_blank"
              rel="noreferrer noopener"
              onClick={handleProfileLinkClick}
              onKeyDown={stopNestedAction}
              className="block h-full w-full hover:opacity-80"
              aria-label={t(
                'followers_view_profile_for',
                'View profile for {{name}}',
                { name: displayName }
              )}
            >
              {avatar}
            </a>
          ) : (
            avatar
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-newTextColor">
            {displayName}
          </p>
          {handle &&
            (follower.profileUrl ? (
              <a
                href={follower.profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                onClick={handleProfileLinkClick}
                onKeyDown={stopNestedAction}
                className="block truncate text-[12px] text-textItemBlur hover:underline hover:opacity-80"
              >
                {handle}
              </a>
            ) : (
              <p className="truncate text-[12px] text-textItemBlur">{handle}</p>
            ))}
          {conversionSubtitle && (
            <p className="truncate text-[11px] text-textItemBlur">
              {conversionSubtitle}
            </p>
          )}
        </div>
        {showMenu && (
          <button
            type="button"
            onClick={handleMenuClick}
            onKeyDown={stopNestedAction}
            className={clsx(
              'inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border',
              'border-newTableBorder text-textItemBlur hover:border-newTextColor/40 hover:text-newTextColor'
            )}
            aria-label={t('followers_board_row_actions', 'Follower actions')}
            data-testid="followers-board-row-menu"
          >
            <MoreIcon size={12} />
          </button>
        )}
      </article>
    );
  };

const FollowerBoardColumnListArea: FC<{
  isLoading: boolean;
  items: Follower[];
  segment: FollowerSegmentDefinition;
  canFollow?: boolean;
  canUnfollow?: boolean;
  lists?: FollowerList[];
  onOpenFollower: (follower: Follower) => void;
  onDismissTriage?: (
    follower: Follower,
    triage: DismissibleTriage,
    reasons?: LeadFitDismissReason[],
    options?: DismissTriageOptions
  ) => Promise<void> | void;
  onUnfollow?: (follower: Follower) => Promise<void> | void;
}> = ({
  isLoading,
  items,
  segment,
  canFollow,
  canUnfollow,
  lists,
  onOpenFollower,
  onDismissTriage,
  onUnfollow,
}) => {
    const t = useT();
    const skeletonCount = FOLLOWER_BOARD_VISIBLE_ROWS;
    const hasScrollableContent = isLoading || items.length > 0;

    return (
      <div
        className="flex shrink-0 flex-col overflow-hidden"
        style={boardListAreaStyle}
        data-testid="followers-board-column-list"
      >
        {hasScrollableContent ? (
          <div
            className="flex h-full min-h-0 flex-col"
            data-testid="followers-board-column-scroll"
          >
            <CustomScrollArea
              className="h-full min-h-0 w-full"
              maxHeight={FOLLOWER_BOARD_LIST_MIN_HEIGHT_PX}
              contentClassName="flex flex-col gap-[6px]"
            >
              {isLoading &&
                Array.from({ length: skeletonCount }).map((_, index) => (
                  <div
                    key={index}
                    className="h-[52px] animate-pulse rounded-[8px] bg-newTableHeader"
                  />
                ))}
              {!isLoading &&
                items.map((follower) => (
                  <FollowerBoardRow
                    key={follower.id}
                    follower={follower}
                    segment={segment}
                    canFollow={canFollow}
                    canUnfollow={canUnfollow}
                    lists={lists}
                    onOpen={() => onOpenFollower(follower)}
                    onDismissTriage={
                      onDismissTriage
                        ? (triage, reasons, options) =>
                          onDismissTriage(follower, triage, reasons, options)
                        : undefined
                    }
                    onUnfollow={
                      onUnfollow ? () => onUnfollow(follower) : undefined
                    }
                  />
                ))}
            </CustomScrollArea>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="px-[6px] text-center text-[12px] text-textItemBlur">
              {t('followers_board_empty', 'No people in this segment yet.')}
            </p>
          </div>
        )}
      </div>
    );
  };

export const FollowerBoardColumn: FC<{
  segment: FollowerSegmentDefinition;
  items: Follower[];
  total: number | null;
  isLoading?: boolean;
  viewAllHref: string;
  canFollow?: boolean;
  canUnfollow?: boolean;
  lists?: FollowerList[];
  onOpenFollower: (follower: Follower) => void;
  onDismissTriage?: (
    follower: Follower,
    triage: DismissibleTriage,
    reasons?: LeadFitDismissReason[],
    options?: DismissTriageOptions
  ) => Promise<void> | void;
  onUnfollow?: (follower: Follower) => Promise<void> | void;
}> = ({
  segment,
  items,
  total,
  isLoading = false,
  viewAllHref,
  canFollow,
  canUnfollow,
  lists,
  onOpenFollower,
  onDismissTriage,
  onUnfollow,
}) => {
    const t = useT();
    const colors = FOLLOWER_SEGMENT_COLOR_CLASSES[segment.color];
    const Icon = segment.icon;
    const countLabel = formatSegmentCount(total);
    const segmentLabel = t(segment.key, segment.defaultLabel);
    const segmentDescription = t(
      segment.descriptionKey,
      segment.defaultDescription
    );

    return (
      <div
        className="flex flex-col gap-[12px] overflow-hidden rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[14px]"
        data-testid="followers-board-column"
        data-board-segment={segment.slug}
      >
        <div className="flex shrink-0 items-center justify-between gap-[8px]">
          <div className="flex min-w-0 flex-1 items-center gap-[10px]">
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
                  {segmentLabel}
                </h3>
                <span className="text-[12px] text-textItemBlur">
                  {`${countLabel} ${t('followers_board_users_label', 'users')}`}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 text-textItemBlur hover:text-newTextColor cursor-help"
            aria-label={t('followers_board_column_help', 'About {{segment}}', {
              segment: segmentLabel,
            })}
            data-testid="followers-board-column-help"
            data-tooltip-id="tooltip"
            data-tooltip-content={segmentDescription}
            data-tooltip-events={['hover', 'click']}
            data-tooltip-place="top"
          >
            <HelpIcon size={16} />
          </button>
        </div>

        <FollowerBoardColumnListArea
          isLoading={isLoading}
          items={items}
          segment={segment}
          canFollow={canFollow}
          canUnfollow={canUnfollow}
          lists={lists}
          onOpenFollower={onOpenFollower}
          onDismissTriage={onDismissTriage}
          onUnfollow={onUnfollow}
        />

        <Link
          href={viewAllHref}
          scroll={false}
          className={clsx(
            'inline-flex shrink-0 items-center justify-center rounded-[10px] border px-[12px] py-[8px] text-[13px] transition-colors',
            colors.outlineButton
          )}
          data-testid="followers-board-view-all"
        >
          {`${t('followers_board_view_all_label', 'View all')} (${countLabel})`}
        </Link>
      </div>
    );
  };

const listRowSegment = (list: FollowerList): FollowerSegmentDefinition => ({
  slug: 'all',
  key: 'followers_custom_list',
  defaultLabel: list.name,
  descriptionKey: 'followers_custom_list_description',
  defaultDescription: 'Custom list members.',
  color: (list.color as FollowerSegmentColor | null | undefined) ?? 'neutral',
  icon: TagIcon,
});

export const FollowerBoardListColumn: FC<{
  list: FollowerList;
  integrationId: string;
  total: number | null;
  viewAllHref: string;
  onOpenFollower: (follower: Follower) => void;
}> = ({ list, integrationId, total, viewAllHref, onOpenFollower }) => {
  const t = useT();
  const segment = listRowSegment(list);
  const colors = FOLLOWER_SEGMENT_COLOR_CLASSES[segment.color];
  const countLabel = formatSegmentCount(total);

  const { data, isLoading } = useFollowers({
    integrationId,
    listId: list.id,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
  });

  return (
    <div
      className="flex flex-col gap-[12px] overflow-hidden rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[14px]"
      data-testid="followers-board-column"
      data-board-list={list.id}
    >
      <div className="flex shrink-0 items-center gap-[10px]">
        <span
          className={clsx(
            'inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px]',
            colors.iconBg,
            colors.text
          )}
        >
          <TagIcon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-[8px]">
            <h3 className="truncate text-[15px] font-medium text-newTextColor">
              {list.name}
            </h3>
            <span className="shrink-0 text-[12px] text-textItemBlur">
              {`${countLabel} ${t('followers_board_users_label', 'users')}`}
            </span>
          </div>
        </div>
      </div>

      <FollowerBoardColumnListArea
        isLoading={isLoading}
        items={data?.items ?? []}
        segment={segment}
        onOpenFollower={onOpenFollower}
      />

      <Link
        href={viewAllHref}
        scroll={false}
        className={clsx(
          'inline-flex shrink-0 items-center justify-center rounded-[10px] border px-[12px] py-[8px] text-[13px] transition-colors',
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
  listColumns?: Array<{
    list: FollowerList;
    total: number | null;
    viewAllHref: string;
  }>;
  integrationId?: string;
  canFollow?: boolean;
  canUnfollow?: boolean;
  lists?: FollowerList[];
  onOpenFollower: (follower: Follower) => void;
  onDismissTriage?: (
    follower: Follower,
    triage: DismissibleTriage,
    reasons?: LeadFitDismissReason[],
    options?: DismissTriageOptions
  ) => Promise<void> | void;
  onUnfollow?: (follower: Follower) => Promise<void> | void;
}> = ({
  columns,
  listColumns = [],
  integrationId,
  canFollow,
  canUnfollow,
  lists,
  onOpenFollower,
  onDismissTriage,
  onUnfollow,
}) => {
    return (
      <div className={BOARD_GRID_CLASS} data-testid="followers-board">
        {columns.map((column) => (
          <FollowerBoardColumn
            key={column.segment.slug}
            segment={column.segment}
            items={column.items}
            total={column.total}
            isLoading={column.isLoading}
            viewAllHref={column.viewAllHref}
            canFollow={canFollow}
            canUnfollow={canUnfollow}
            lists={lists}
            onOpenFollower={onOpenFollower}
            onDismissTriage={onDismissTriage}
            onUnfollow={onUnfollow}
          />
        ))}
        {integrationId &&
          listColumns.map((column) => (
            <FollowerBoardListColumn
              key={column.list.id}
              list={column.list}
              integrationId={integrationId}
              total={column.total}
              viewAllHref={column.viewAllHref}
              onOpenFollower={onOpenFollower}
            />
          ))}
      </div>
    );
  };

export { FOLLOWER_BOARD_SEGMENTS };

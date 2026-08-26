'use client';

import { FC, KeyboardEvent, MouseEvent, useCallback } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  FOLLOWER_BOARD_SEGMENTS,
  FOLLOWER_BOARD_VISIBLE_ROWS,
  FOLLOWER_SEGMENT_COLOR_CLASSES,
  FollowerSegmentDefinition,
  formatSegmentCount,
  getFollowerBoardColumnAction,
} from '@gitroom/frontend/components/followers/follower.segments';
import { CustomScrollArea } from '@gitroom/frontend/components/ui/custom.scroll.area';
import { HelpIcon, MoreIcon } from '@gitroom/frontend/components/ui/icons';
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
} from '@gitroom/frontend/components/followers/use.followers';
import { LeadFitDismissReason } from '@gitroom/nestjs-libraries/dtos/integrations/lead-fit-feedback.types';

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
  isLoading,
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
    const preview = items;
    const hasScrollableContent = isLoading || preview.length > 0;
    const skeletonCount = FOLLOWER_BOARD_VISIBLE_ROWS;
    const segmentLabel = t(segment.key, segment.defaultLabel);
    const segmentDescription = t(segment.descriptionKey, segment.defaultDescription);

    return (
      <div
        className="flex h-full min-h-0 min-w-[240px] flex-1 flex-col gap-[12px] overflow-hidden rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[14px]"
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
            aria-label={t(
              'followers_board_column_help',
              'About {{segment}}',
              { segment: segmentLabel }
            )}
            data-testid="followers-board-column-help"
            data-tooltip-id="tooltip"
            data-tooltip-content={segmentDescription}
            data-tooltip-events={['hover', 'click']}
            data-tooltip-place="top"
          >
            <HelpIcon size={16} />
          </button>
        </div>

        {hasScrollableContent ? (
          <div
            className="flex min-h-0 flex-1 flex-col"
            data-testid="followers-board-column-scroll"
          >
            <CustomScrollArea
              className="min-h-0 w-full flex-1"
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
                preview.map((follower) => (
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
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="px-[6px] py-[16px] text-[12px] text-textItemBlur">
              {t('followers_board_empty', 'No people in this segment yet.')}
            </p>
          </div>
        )}

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
  canFollow,
  canUnfollow,
  lists,
  onOpenFollower,
  onDismissTriage,
  onUnfollow,
}) => {
  return (
    <CustomScrollArea
      direction="horizontal"
      className="flex h-full min-h-0 flex-1"
      contentClassName="flex h-full items-stretch gap-[12px] pb-[4px]"
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
          canFollow={canFollow}
          canUnfollow={canUnfollow}
          lists={lists}
          onOpenFollower={onOpenFollower}
          onDismissTriage={onDismissTriage}
          onUnfollow={onUnfollow}
        />
      ))}
    </CustomScrollArea>
  );
};

export { FOLLOWER_BOARD_SEGMENTS };

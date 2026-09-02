'use client';

import {
  FC,
  KeyboardEvent,
  memo,
  MouseEvent,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { useDrag, useDrop } from 'react-dnd';
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
  canFollowerBoardAcceptCardDrop,
  formatSegmentCount,
  getFollowerBoardColumnAction,
} from '@gitroom/frontend/components/followers/follower.segments';
import {
  columnKeyForList,
  columnKeyForSegment,
} from '@gitroom/frontend/components/followers/follower.board.layout';
import { CustomScrollArea } from '@gitroom/frontend/components/ui/custom.scroll.area';
import { MoreIcon, TagIcon } from '@gitroom/frontend/components/ui/icons';
import {
  DismissTriageOptions,
  useRelationshipTriageDismiss,
} from '@gitroom/frontend/components/followers/follower.card';
import { FollowerBoardColumnMenu } from '@gitroom/frontend/components/followers/follower.board.column.menu';
import { useUnfollowConfirmModal } from '@gitroom/frontend/components/followers/unfollow.confirm.modal';
import {
  DismissibleTriage,
  Follower,
  FollowerBoardMoveColumnRef,
  FollowerList,
  getProfileLinkAutoSnoozeTriages,
  useFollowers,
} from '@gitroom/frontend/components/followers/use.followers';
import { LeadFitDismissReason } from '@gitroom/nestjs-libraries/dtos/integrations/lead-fit-feedback.types';

const followerBoardColumnDragType = 'follower-board-column';
const followerBoardCardDragType = 'follower-board-card';

export type { FollowerBoardMoveColumnRef };

export type FollowerBoardCardDragItem = {
  follower: Follower;
  fromColumnKey: string;
  from: FollowerBoardMoveColumnRef;
  didDrop?: boolean;
};

export type FollowerBoardSegmentColumn = {
  kind: 'segment';
  columnKey: string;
  segment: FollowerSegmentDefinition;
  items: Follower[];
  total: number | null;
  isLoading?: boolean;
  viewAllHref: string;
};

export type FollowerBoardListColumnData = {
  kind: 'list';
  columnKey: string;
  list: FollowerList;
  total: number | null;
  viewAllHref: string;
};

export type FollowerBoardOrderedColumn =
  | FollowerBoardSegmentColumn
  | FollowerBoardListColumnData;

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
  columnKey: string;
  columnRef: FollowerBoardMoveColumnRef;
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
  columnKey,
  columnRef,
  canFollow = false,
  canUnfollow = false,
  lists = [],
  onOpen,
  onDismissTriage,
  onUnfollow,
}) => {
    const t = useT();
    const suppressClickRef = useRef(false);
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

    const [{ isDragging }, drag] = useDrag(
      () => ({
        type: followerBoardCardDragType,
        item: (): FollowerBoardCardDragItem => ({
          follower,
          fromColumnKey: columnKey,
          from: columnRef,
        }),
        end: (_item, monitor) => {
          if (monitor.didDrop()) {
            suppressClickRef.current = true;
          }
        },
        collect: (monitor) => ({ isDragging: monitor.isDragging() }),
      }),
      [columnKey, columnRef, follower]
    );

    const handle = follower.username
      ? follower.username.startsWith('@')
        ? follower.username
        : `@${follower.username}`
      : null;
    const displayName =
      follower.name || handle || t('followers_unknown', 'Unknown');

    const handleRowClick = () => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
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
        // @ts-ignore react-dnd connector type
        ref={(node) => {
          drag(node);
        }}
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
        className={clsx(
          'flex w-full cursor-grab items-center gap-[10px] rounded-[8px] border border-newTableBorder bg-newTableHeader px-[6px] py-[8px] text-start transition-colors hover:border-newTextColor/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-newTextColor/30 active:cursor-grabbing',
          isDragging && 'opacity-40'
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
                className="inline-block w-fit max-w-full truncate text-[12px] text-textItemBlur hover:underline hover:opacity-80"
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

const FollowerBoardColumnListArea: FC<{
  isLoading: boolean;
  items: Follower[];
  segment: FollowerSegmentDefinition;
  columnKey: string;
  columnRef: FollowerBoardMoveColumnRef;
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
  columnKey,
  columnRef,
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
                    columnKey={columnKey}
                    columnRef={columnRef}
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

const FollowerBoardColumnHeader: FC<{
  color: FollowerSegmentColor;
  icon: ReactNode;
  title: string;
  countLabel: string;
  titleTruncate?: boolean;
  segment?: FollowerSegmentDefinition;
  onAddLead?: () => void;
  dragHandleRef?: (node: HTMLElement | null) => void;
}> = ({
  color,
  icon,
  title,
  countLabel,
  titleTruncate = false,
  segment,
  onAddLead,
  dragHandleRef,
}) => {
    const t = useT();
    const colors = FOLLOWER_SEGMENT_COLOR_CLASSES[color];

    return (
      <div className="flex shrink-0 items-center justify-between gap-[8px]">
        <div
          // @ts-ignore react-dnd connector type
          ref={(node) => {
            dragHandleRef?.(node);
          }}
          className={clsx(
            'flex min-w-0 flex-1 items-center gap-[10px]',
            dragHandleRef && 'cursor-grab active:cursor-grabbing'
          )}
          data-testid="followers-board-column-drag-handle"
        >
          <span
            className={clsx(
              'inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px]',
              colors.iconBg,
              colors.text
            )}
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-[8px]">
              <h3
                className={clsx(
                  'text-[15px] font-medium text-newTextColor',
                  titleTruncate && 'truncate'
                )}
              >
                {title}
              </h3>
              <span
                className={clsx(
                  'text-[12px] text-textItemBlur',
                  titleTruncate && 'shrink-0'
                )}
              >
                {`${countLabel} ${t('followers_board_users_label', 'users')}`}
              </span>
            </div>
          </div>
        </div>
        {segment ? (
          <FollowerBoardColumnMenu segment={segment} onAdd={onAddLead} />
        ) : null}
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
  isDragging?: boolean;
  isCardOver?: boolean;
  canAcceptCard?: boolean;
  dragHandleRef?: (node: HTMLElement | null) => void;
  dropRef?: (node: HTMLElement | null) => void;
  onOpenFollower: (follower: Follower) => void;
  onAddLead?: () => void;
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
  isDragging = false,
  isCardOver = false,
  canAcceptCard = false,
  dragHandleRef,
  dropRef,
  onOpenFollower,
  onAddLead,
  onDismissTriage,
  onUnfollow,
}) => {
    const t = useT();
    const colors = FOLLOWER_SEGMENT_COLOR_CLASSES[segment.color];
    const Icon = segment.icon;
    const countLabel = formatSegmentCount(total);
    const segmentLabel = t(segment.key, segment.defaultLabel);
    const columnKey = columnKeyForSegment(segment.slug);
    const columnRef: FollowerBoardMoveColumnRef = {
      kind: 'segment',
      slug: segment.slug,
    };

    return (
      <div
        // @ts-ignore react-dnd connector type
        ref={(node) => {
          dropRef?.(node);
        }}
        className={clsx(
          'flex flex-col gap-[12px] overflow-hidden rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[14px]',
          isDragging && 'opacity-50',
          isCardOver &&
          canAcceptCard &&
          'border-orange-500 ring-2 ring-orange-500/30',
          isCardOver && !canAcceptCard && 'cursor-not-allowed opacity-70'
        )}
        data-testid="followers-board-column"
        data-board-segment={segment.slug}
        data-can-accept-card={canAcceptCard ? 'true' : 'false'}
      >
        <FollowerBoardColumnHeader
          color={segment.color}
          icon={<Icon size={16} />}
          title={segmentLabel}
          countLabel={countLabel}
          segment={segment}
          onAddLead={onAddLead}
          dragHandleRef={dragHandleRef}
        />

        <FollowerBoardColumnListArea
          isLoading={isLoading}
          items={items}
          segment={segment}
          columnKey={columnKey}
          columnRef={columnRef}
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
  isDragging?: boolean;
  isCardOver?: boolean;
  canAcceptCard?: boolean;
  dragHandleRef?: (node: HTMLElement | null) => void;
  dropRef?: (node: HTMLElement | null) => void;
  onOpenFollower: (follower: Follower) => void;
}> = ({
  list,
  integrationId,
  total,
  viewAllHref,
  isDragging = false,
  isCardOver = false,
  canAcceptCard = false,
  dragHandleRef,
  dropRef,
  onOpenFollower,
}) => {
    const t = useT();
    const segment = listRowSegment(list);
    const colors = FOLLOWER_SEGMENT_COLOR_CLASSES[segment.color];
    const countLabel = formatSegmentCount(total);
    const columnKey = columnKeyForList(list.id);
    const columnRef: FollowerBoardMoveColumnRef = {
      kind: 'list',
      listId: list.id,
    };

    const { data, isLoading } = useFollowers({
      integrationId,
      listId: list.id,
      limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    });

    return (
      <div
        // @ts-ignore react-dnd connector type
        ref={(node) => {
          dropRef?.(node);
        }}
        className={clsx(
          'flex flex-col gap-[12px] overflow-hidden rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[14px]',
          isDragging && 'opacity-50',
          isCardOver &&
          canAcceptCard &&
          'border-orange-500 ring-2 ring-orange-500/30',
          isCardOver && !canAcceptCard && 'cursor-not-allowed opacity-70'
        )}
        data-testid="followers-board-column"
        data-board-list={list.id}
        data-can-accept-card={canAcceptCard ? 'true' : 'false'}
      >
        <FollowerBoardColumnHeader
          color={segment.color}
          icon={<TagIcon size={16} />}
          title={list.name}
          countLabel={countLabel}
          titleTruncate
          dragHandleRef={dragHandleRef}
        />

        <FollowerBoardColumnListArea
          isLoading={isLoading}
          items={data?.items ?? []}
          segment={segment}
          columnKey={columnKey}
          columnRef={columnRef}
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

const sortableFollowerBoardColumnPropsAreEqual = (
  prev: {
    column: FollowerBoardOrderedColumn;
    index: number;
    integrationId?: string;
    canFollow?: boolean;
    canUnfollow?: boolean;
    lists?: FollowerList[];
    onReorderLocal: (from: number, to: number) => void;
    onDragEnd: () => void;
    onOpenFollower: (follower: Follower) => void;
    onAddLead?: () => void;
    onDismissTriage?: (
      follower: Follower,
      triage: DismissibleTriage,
      reasons?: LeadFitDismissReason[],
      options?: DismissTriageOptions
    ) => Promise<void> | void;
    onUnfollow?: (follower: Follower) => Promise<void> | void;
    onMoveFollower?: (
      follower: Follower,
      from: FollowerBoardMoveColumnRef,
      to: FollowerBoardMoveColumnRef
    ) => Promise<void> | void;
  },
  next: {
    column: FollowerBoardOrderedColumn;
    index: number;
    integrationId?: string;
    canFollow?: boolean;
    canUnfollow?: boolean;
    lists?: FollowerList[];
    onReorderLocal: (from: number, to: number) => void;
    onDragEnd: () => void;
    onOpenFollower: (follower: Follower) => void;
    onAddLead?: () => void;
    onDismissTriage?: (
      follower: Follower,
      triage: DismissibleTriage,
      reasons?: LeadFitDismissReason[],
      options?: DismissTriageOptions
    ) => Promise<void> | void;
    onUnfollow?: (follower: Follower) => Promise<void> | void;
    onMoveFollower?: (
      follower: Follower,
      from: FollowerBoardMoveColumnRef,
      to: FollowerBoardMoveColumnRef
    ) => Promise<void> | void;
  }
) => {
  if (
    prev.index !== next.index ||
    prev.integrationId !== next.integrationId ||
    prev.canFollow !== next.canFollow ||
    prev.canUnfollow !== next.canUnfollow ||
    prev.lists !== next.lists ||
    prev.onReorderLocal !== next.onReorderLocal ||
    prev.onDragEnd !== next.onDragEnd ||
    prev.onOpenFollower !== next.onOpenFollower ||
    prev.onAddLead !== next.onAddLead ||
    prev.onDismissTriage !== next.onDismissTriage ||
    prev.onUnfollow !== next.onUnfollow ||
    prev.onMoveFollower !== next.onMoveFollower
  ) {
    return false;
  }
  const a = prev.column;
  const b = next.column;
  if (
    a.columnKey !== b.columnKey ||
    a.kind !== b.kind ||
    a.total !== b.total ||
    a.viewAllHref !== b.viewAllHref
  ) {
    return false;
  }
  if (a.kind === 'segment' && b.kind === 'segment') {
    return (
      a.isLoading === b.isLoading &&
      a.items === b.items &&
      a.segment === b.segment
    );
  }
  if (a.kind === 'list' && b.kind === 'list') {
    return a.list === b.list;
  }
  return false;
};

const SortableFollowerBoardColumn = memo(function SortableFollowerBoardColumn({
  column,
  index,
  integrationId,
  canFollow,
  canUnfollow,
  lists,
  onReorderLocal,
  onDragEnd,
  onOpenFollower,
  onAddLead,
  onDismissTriage,
  onUnfollow,
  onMoveFollower,
}: {
  column: FollowerBoardOrderedColumn;
  index: number;
  integrationId?: string;
  canFollow?: boolean;
  canUnfollow?: boolean;
  lists?: FollowerList[];
  onReorderLocal: (from: number, to: number) => void;
  onDragEnd: () => void;
  onOpenFollower: (follower: Follower) => void;
  onAddLead?: () => void;
  onDismissTriage?: (
    follower: Follower,
    triage: DismissibleTriage,
    reasons?: LeadFitDismissReason[],
    options?: DismissTriageOptions
  ) => Promise<void> | void;
  onUnfollow?: (follower: Follower) => Promise<void> | void;
  onMoveFollower?: (
    follower: Follower,
    from: FollowerBoardMoveColumnRef,
    to: FollowerBoardMoveColumnRef
  ) => Promise<void> | void;
}) {
  const canAcceptCard =
    column.kind === 'list'
      ? canFollowerBoardAcceptCardDrop({ kind: 'list' })
      : canFollowerBoardAcceptCardDrop({
        kind: 'segment',
        slug: column.segment.slug,
      });

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: followerBoardColumnDragType,
      item: { id: column.columnKey, index },
      end: () => {
        onDragEnd();
      },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [column.columnKey, index, onDragEnd]
  );

  const [{ isCardOver }, drop] = useDrop(
    () => ({
      accept: [followerBoardColumnDragType, followerBoardCardDragType],
      canDrop: (item: unknown, monitor) => {
        if (monitor.getItemType() === followerBoardCardDragType) {
          const card = item as FollowerBoardCardDragItem;
          if (card.fromColumnKey === column.columnKey) {
            return false;
          }
          return canAcceptCard;
        }
        return true;
      },
      hover: (item: unknown, monitor) => {
        if (monitor.getItemType() !== followerBoardColumnDragType) {
          return;
        }
        const dragged = item as {
          id: string;
          index: number;
          lastTargetId?: string;
        };
        if (
          dragged.id === column.columnKey ||
          dragged.lastTargetId === column.columnKey
        ) {
          return;
        }
        if (dragged.index !== index) {
          onReorderLocal(dragged.index, index);
          dragged.index = index;
        }
        dragged.lastTargetId = column.columnKey;
      },
      drop: (item: unknown, monitor) => {
        if (monitor.getItemType() === followerBoardCardDragType) {
          const card = item as FollowerBoardCardDragItem;
          if (!canAcceptCard || card.fromColumnKey === column.columnKey) {
            return;
          }
          const target: FollowerBoardMoveColumnRef =
            column.kind === 'segment'
              ? { kind: 'segment', slug: column.segment.slug }
              : { kind: 'list', listId: column.list.id };
          void onMoveFollower?.(card.follower, card.from, target);
          return;
        }
        onDragEnd();
      },
      collect: (monitor) => ({
        isCardOver:
          monitor.isOver({ shallow: true }) &&
          monitor.getItemType() === followerBoardCardDragType,
      }),
    }),
    [canAcceptCard, column, index, onDragEnd, onMoveFollower, onReorderLocal]
  );

  const dragHandleRef = (node: HTMLElement | null) => {
    drag(node);
  };
  const dropRef = (node: HTMLElement | null) => {
    drop(node);
  };

  if (column.kind === 'segment') {
    return (
      <FollowerBoardColumn
        segment={column.segment}
        items={column.items}
        total={column.total}
        isLoading={column.isLoading}
        viewAllHref={column.viewAllHref}
        canFollow={canFollow}
        canUnfollow={canUnfollow}
        lists={lists}
        isDragging={isDragging}
        isCardOver={isCardOver}
        canAcceptCard={canAcceptCard}
        dragHandleRef={dragHandleRef}
        dropRef={dropRef}
        onOpenFollower={onOpenFollower}
        onAddLead={onAddLead}
        onDismissTriage={onDismissTriage}
        onUnfollow={onUnfollow}
      />
    );
  }

  if (!integrationId) {
    return null;
  }

  return (
    <FollowerBoardListColumn
      list={column.list}
      integrationId={integrationId}
      total={column.total}
      viewAllHref={column.viewAllHref}
      isDragging={isDragging}
      isCardOver={isCardOver}
      canAcceptCard={canAcceptCard}
      dragHandleRef={dragHandleRef}
      dropRef={dropRef}
      onOpenFollower={onOpenFollower}
    />
  );
},
  sortableFollowerBoardColumnPropsAreEqual);

export const FollowerBoard: FC<{
  orderedColumns: FollowerBoardOrderedColumn[];
  integrationId?: string;
  canFollow?: boolean;
  canUnfollow?: boolean;
  lists?: FollowerList[];
  onReorderLocal?: (from: number, to: number) => void;
  onDragEnd?: () => void;
  onOpenFollower: (follower: Follower) => void;
  onAddLead?: () => void;
  onDismissTriage?: (
    follower: Follower,
    triage: DismissibleTriage,
    reasons?: LeadFitDismissReason[],
    options?: DismissTriageOptions
  ) => Promise<void> | void;
  onUnfollow?: (follower: Follower) => Promise<void> | void;
  onMoveFollower?: (
    follower: Follower,
    from: FollowerBoardMoveColumnRef,
    to: FollowerBoardMoveColumnRef
  ) => Promise<void> | void;
}> = ({
  orderedColumns,
  integrationId,
  canFollow,
  canUnfollow,
  lists,
  onReorderLocal,
  onDragEnd,
  onOpenFollower,
  onAddLead,
  onDismissTriage,
  onUnfollow,
  onMoveFollower,
}) => {
    const sortable = !!onReorderLocal && !!onDragEnd;

    return (
      <div className={BOARD_GRID_CLASS} data-testid="followers-board">
        {orderedColumns.map((column, index) =>
          sortable ? (
            <SortableFollowerBoardColumn
              key={column.columnKey}
              column={column}
              index={index}
              integrationId={integrationId}
              canFollow={canFollow}
              canUnfollow={canUnfollow}
              lists={lists}
              onReorderLocal={onReorderLocal}
              onDragEnd={onDragEnd}
              onOpenFollower={onOpenFollower}
              onAddLead={onAddLead}
              onDismissTriage={onDismissTriage}
              onUnfollow={onUnfollow}
              onMoveFollower={onMoveFollower}
            />
          ) : column.kind === 'segment' ? (
            <FollowerBoardColumn
              key={column.columnKey}
              segment={column.segment}
              items={column.items}
              total={column.total}
              isLoading={column.isLoading}
              viewAllHref={column.viewAllHref}
              canFollow={canFollow}
              canUnfollow={canUnfollow}
              lists={lists}
              onOpenFollower={onOpenFollower}
              onAddLead={onAddLead}
              onDismissTriage={onDismissTriage}
              onUnfollow={onUnfollow}
            />
          ) : integrationId ? (
            <FollowerBoardListColumn
              key={column.columnKey}
              list={column.list}
              integrationId={integrationId}
              total={column.total}
              viewAllHref={column.viewAllHref}
              onOpenFollower={onOpenFollower}
            />
          ) : null
        )}
      </div>
    );
  };

export { FOLLOWER_BOARD_SEGMENTS, columnKeyForList, columnKeyForSegment };

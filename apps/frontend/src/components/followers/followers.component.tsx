'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useDebounce } from 'use-debounce';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCopilotReadable } from '@copilotkit/react-core';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import {
  DismissTriageOptions,
  FollowerCard,
} from '@gitroom/frontend/components/followers/follower.card';
import { FollowerDetailModal } from '@gitroom/frontend/components/followers/follower.detail.modal';
import { FollowerListCreateModal } from '@gitroom/frontend/components/followers/follower.list.create.modal';
import { FollowerListAddModal } from '@gitroom/frontend/components/followers/follower.list.add.modal';
import { FollowerListColorPicker } from '@gitroom/frontend/components/followers/follower.list.color.picker';
import { FollowerTriageTip } from '@gitroom/frontend/components/followers/follower.triage.tip';
import {
  FollowerBoard,
  FollowerBoardOrderedColumn,
} from '@gitroom/frontend/components/followers/follower.board';
import { FollowerFiltersMenu } from '@gitroom/frontend/components/followers/follower.filters.menu';
import { FollowerTriageVisibilityMenu } from '@gitroom/frontend/components/followers/follower.triage.visibility.menu';
import {
  FOLLOWER_BOARD_SEGMENTS,
  FOLLOWER_BOARD_PREVIEW_LIMIT,
  FOLLOWER_SEGMENT_COLOR_CLASSES,
  FOLLOWER_TAB_SEGMENTS,
  FollowerSegmentColor,
  FollowerSegmentSlug,
  categoryCount,
  isFollowerSegmentVisible,
} from '@gitroom/frontend/components/followers/follower.segments';
import {
  applyFollowerBoardColumnPreferences,
  buildFollowerBoardColumnPreferences,
  columnKeyForList,
  columnKeyForSegment,
  reorderVisibleKeys,
} from '@gitroom/frontend/components/followers/follower.board.layout';
import { useFollowerBoardColumnPreferences } from '@gitroom/frontend/components/followers/use.follower.board.column.preferences';
import { useFollowerTriageVisibility } from '@gitroom/frontend/components/followers/use.follower.triage.visibility';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import { useCopilotFollowerPageProperties } from '@gitroom/frontend/components/followers/use.copilot.follower.page';
import {
  useDecisionModal,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import {
  MinusIcon,
  PlusIcon,
  SearchIcon,
} from '@gitroom/frontend/components/ui/icons';
import {
  ChannelMenu,
  ChannelsSidebar,
  groupChannelsByCustomer,
} from '@gitroom/frontend/components/launches/channels.sidebar';
import {
  resolveChannelId,
  setLastChannelId,
} from '@gitroom/frontend/components/launches/helpers/last-channel';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import {
  FOLLOWER_CATEGORY_DESCRIPTIONS,
  formatFollowerPageContext,
  normalizeFollowerSearch,
} from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';
import {
  ChannelInteractionKindCoverage,
  ChannelInteractionWindow,
  DEFAULT_FOLLOWER_INTERACTION_WINDOW,
  DismissibleTriage,
  FollowerChannel,
  FollowerPageTracking,
  FollowerStrategyMetadata,
  FollowerSortDirection,
  FollowerTriageFilter,
  Follower,
  applyFollowToFollowerPage,
  applyIgnoreToFollowerPage,
  applyTriageIgnoreToFollowerPage,
  buildFollowerDetailHref,
  buildFollowerTimelineHref,
  useFollowerAudienceSummary,
  useFollowerChannels,
  useFollowerDetail,
  useFollowerListMutations,
  useFollowerLists,
  useFollowers,
} from '@gitroom/frontend/components/followers/use.followers';
import { LeadFitDismissReason } from '@gitroom/nestjs-libraries/dtos/integrations/lead-fit-feedback.types';

const FOLLOWER_VIEW_BY_SLUG: Record<
  string,
  {
    triage?: FollowerTriageFilter;
    audience?:
      | 'lead'
      | 'followed'
      | 'unfollowed'
      | 'ignored'
      | 'cultivate'
      | 'hot'
      | 'converted';
    isBot?: true;
  }
> = {
  all: {},
  // Legacy bookmark slug; canonicalize to /followers/hot.
  engaged: { audience: 'hot' },
  hot: { audience: 'hot' },
  mutual: { triage: 'mutual' },
  costly: { triage: 'over_invested' },
  quiet: { triage: 'quiet' },
  cultivate: { audience: 'cultivate' },
  leads: { audience: 'lead' },
  // Legacy bookmark slug; canonicalize to /followers/leads.
  lead: { audience: 'lead' },
  conversions: { audience: 'converted' },
  followed: { audience: 'followed' },
  unfollowed: { audience: 'unfollowed' },
  ignored: { audience: 'ignored' },
  bots: { isBot: true },
};

type FollowerFilterOption = {
  slug?: string;
  value?: FollowerTriageFilter;
  audience?:
    | 'lead'
    | 'followed'
    | 'unfollowed'
    | 'cultivate'
    | 'ignored'
    | 'hot'
    | 'converted';
  isBot?: true;
  key: string;
  defaultLabel: string;
};

const TRIAGE_FILTER_OPTIONS: FollowerFilterOption[] = FOLLOWER_TAB_SEGMENTS.map(
  (tab) => ({
    slug: tab.slug,
    value: tab.triage,
    audience: tab.audience,
    isBot: tab.isBot,
    key: tab.key,
    defaultLabel: tab.defaultLabel,
  })
);

const FILTER_CHIP_BASE =
  'rounded-full border px-[12px] py-[6px] text-[13px] transition-colors bg-newBgColorInner';

const getTabChipClasses = (
  color: FollowerSegmentColor,
  isSelected: boolean
) => {
  const colors = FOLLOWER_SEGMENT_COLOR_CLASSES[color];
  if (isSelected) {
    return colors.borderSelected;
  }
  return `${colors.border} text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor`;
};

const decodeFollowerPathSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export type FollowerListPath = {
  type: 'list';
  slug?: string;
  triage?: FollowerTriageFilter;
  audience?:
    | 'lead'
    | 'followed'
    | 'unfollowed'
    | 'ignored'
    | 'cultivate'
    | 'hot'
    | 'converted';
  isBot?: true;
};

export type FollowerDetailPath = {
  type: 'follower';
  integrationId: string;
  username: string;
};

export type FollowerPath = FollowerListPath | FollowerDetailPath;

export const parseFollowerPath = (pathname: string): FollowerPath => {
  const match = pathname.match(/^\/followers(?:\/([^/]+))?(?:\/([^/]+))?\/?$/);
  if (!match) {
    return { type: 'list' };
  }
  const [, first, second] = match;
  if (first && second) {
    const integrationId = decodeFollowerPathSegment(first);
    const rawHandle = decodeFollowerPathSegment(second);
    const username = normalizeFollowerSearch(rawHandle);
    if (integrationId && username && rawHandle.startsWith('@')) {
      return { type: 'follower', integrationId, username };
    }
    return { type: 'list' };
  }
  if (!first) {
    return { type: 'list' };
  }
  const view = FOLLOWER_VIEW_BY_SLUG[first];
  if (!view) {
    return { type: 'list' };
  }
  return {
    type: 'list',
    slug: first,
    triage: view.triage,
    audience: view.audience,
    isBot: view.isBot,
  };
};

export const parseFollowerViewPath = (pathname: string) => {
  const parsed = parseFollowerPath(pathname);
  if (parsed.type === 'follower') {
    return {
      slug: undefined,
      triage: undefined,
      audience: undefined,
      isBot: undefined,
    };
  }
  return {
    slug: parsed.slug,
    triage: parsed.triage,
    audience: parsed.audience,
    isBot: parsed.isBot,
  };
};

export const buildFollowersPageHref = ({
  slug,
  search,
  sort,
  direction,
  listId,
}: {
  slug?: string;
  search?: string;
  sort?: string;
  direction?: FollowerSortDirection;
  listId?: string;
}) => {
  const path = slug ? `/followers/${slug}` : '/followers';
  const params = new URLSearchParams();
  if (search) {
    params.set('search', search);
  }
  if (sort) {
    params.set('sort', sort);
  }
  if (direction) {
    params.set('direction', direction);
  }
  if (listId) {
    params.set('listId', listId);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

export type FollowerStrategyDefaultsInput = {
  pathname: string;
  search?: string;
  listId?: string;
  sort?: string;
  direction?: string;
  strategy?: FollowerStrategyMetadata;
  sorts?: FollowerChannel['sorts'];
};

export type FollowerStrategyDefaults = {
  slug?: string;
  sort?: string;
  direction?: FollowerSortDirection;
};

export const resolveFollowerStrategyDefaults = ({
  pathname,
  search,
  listId,
  sort,
  direction,
  strategy,
  sorts,
}: FollowerStrategyDefaultsInput): FollowerStrategyDefaults | undefined => {
  if (
    pathname !== '/followers' ||
    !!search ||
    !!listId ||
    !!sort ||
    !!direction ||
    !strategy
  ) {
    return undefined;
  }

  const slug =
    strategy.ui.defaultFilter !== 'all' &&
    FOLLOWER_VIEW_BY_SLUG[strategy.ui.defaultFilter]
      ? strategy.ui.defaultFilter
      : undefined;
  // Fit is the lead endpoint's established ordering, rather than a generic sort.
  if (strategy.ui.defaultSort === 'fit') {
    return { slug: slug === 'leads' ? 'leads' : undefined };
  }
  if (strategy.ui.defaultSort === 'recent') {
    return { slug };
  }
  const sortOption = sorts?.find(
    (candidate) => candidate.key === strategy.ui.defaultSort
  );
  return {
    slug,
    ...(sortOption
      ? {
          sort: sortOption.key,
          direction: sortOption.defaultDirection,
        }
      : {}),
  };
};

const pathnameFromHref = (href: string) => {
  try {
    return new URL(href, globalThis.location?.origin || 'http://localhost')
      .pathname;
  } catch {
    return href.split('?')[0] || '/followers';
  }
};

const currentWindowPathname = () =>
  globalThis.location?.pathname || '/followers';

const browserHistory = () => globalThis.history;

export { buildFollowerDetailHref };

const INTERACTION_KIND_LABELS: Record<
  string,
  { key: string; defaultLabel: string }
> = {
  like: { key: 'followers_interaction_kind_like', defaultLabel: 'Likes' },
  reply: { key: 'followers_interaction_kind_reply', defaultLabel: 'Replies' },
  repost: { key: 'followers_interaction_kind_repost', defaultLabel: 'Reposts' },
  follow: { key: 'followers_interaction_kind_follow', defaultLabel: 'Follows' },
  mention: {
    key: 'followers_interaction_kind_mention',
    defaultLabel: 'Mentions',
  },
};

const getPartialCoverageItems = (coverage?: ChannelInteractionKindCoverage[]) =>
  coverage?.filter(
    (item) => item.inbound === 'partial' || item.outbound === 'partial'
  ) ?? [];

const formatTrackingTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const trackingUnavailableMessage = (
  category: FollowerPageTracking['failureCategory'],
  reason: string | undefined,
  t: ReturnType<typeof useT>
) => {
  if (reason) {
    return reason;
  }
  const messages = {
    configuration: [
      'followers_tracking_configuration',
      'Interaction tracking needs channel configuration before it can start.',
    ],
    authentication: [
      'followers_tracking_authentication',
      'Interaction tracking needs authentication. Reconnecting the channel may help.',
    ],
    authorization: [
      'followers_tracking_authorization',
      'Interaction tracking does not have the required channel permissions.',
    ],
    entitlement: [
      'followers_tracking_entitlement',
      'Your provider plan does not include this interaction tracking feature.',
    ],
    quota: [
      'followers_tracking_quota',
      'The provider tracking quota has been reached. Tracking will resume when capacity is available.',
    ],
    transient: [
      'followers_tracking_transient',
      'The provider is temporarily unavailable. We will retry tracking setup.',
    ],
    unknown: [
      'followers_tracking_unknown',
      'Interaction tracking could not be set up right now.',
    ],
  } as const;
  const message = messages[category || 'unknown'];
  return t(message[0], message[1]);
};

const FollowerCardSkeleton: FC = () => (
  <div
    className={clsx(
      'h-[220px] rounded-[12px] border border-newTableBorder bg-newTableHeader',
      'animate-pulse'
    )}
  />
);

const TrackingNotice: FC<{
  tracking?: FollowerPageTracking;
  showFreshness?: boolean;
}> = ({ tracking, showFreshness = false }) => {
  const t = useT();

  if (!tracking) {
    return null;
  }

  const partialCoverage = getPartialCoverageItems(tracking.coverage);
  const freshness = tracking.computedAt
    ? formatTrackingTimestamp(tracking.computedAt)
    : null;
  const isProvisioning = tracking.availability === 'provisioning';
  const isUnavailable = tracking.availability === 'unavailable';
  const showPartialNotice =
    tracking.state === 'partial' || partialCoverage.length > 0;
  const trackingStartedAt = tracking.trackingStartedAt
    ? formatTrackingTimestamp(tracking.trackingStartedAt)
    : null;

  if (
    !isProvisioning &&
    !isUnavailable &&
    !showPartialNotice &&
    !(showFreshness && freshness)
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[8px]">
      {isProvisioning && (
        <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-[14px] py-[10px] text-[13px] text-amber-400">
          {t(
            'followers_tracking_provisioning',
            'Interaction tracking is still being set up for this channel. Rankings begin after tracking and the first follower sync complete.'
          )}
        </div>
      )}
      {isUnavailable && (
        <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-[14px] py-[10px] text-[13px] text-amber-400">
          {t(
            'followers_tracking_unavailable',
            trackingUnavailableMessage(
              tracking.failureCategory,
              tracking.reason,
              t
            )
          )}
        </div>
      )}
      {showPartialNotice && (
        <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-[14px] py-[10px] text-[13px] text-amber-400">
          <p>
            {t(
              'followers_tracking_partial',
              'Some interaction types have limited coverage. Rankings may be incomplete.'
            )}
          </p>
          {partialCoverage.length > 0 && (
            <ul className="mt-[6px] list-disc ps-[18px]">
              {partialCoverage.map((item) => {
                const label = INTERACTION_KIND_LABELS[item.kind];
                return (
                  <li key={item.kind}>
                    {item.reason ||
                      t(
                        label?.key || 'followers_interaction_kind_unknown',
                        label?.defaultLabel || item.kind
                      )}
                  </li>
                );
              })}
            </ul>
          )}
          {tracking.failedSubscriptions &&
            tracking.failedSubscriptions.length > 0 && (
              <ul className="mt-[6px] list-disc ps-[18px]">
                {tracking.failedSubscriptions.map((subscription) => (
                  <li
                    key={`${subscription.eventKey}:${subscription.direction}`}
                  >
                    {subscription.eventKey} · {subscription.direction}
                    {subscription.reason ? `: ${subscription.reason}` : ''}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
      {showFreshness && freshness && (
        <p className="text-[13px] text-textItemBlur">
          {t(
            'followers_tracking_freshness',
            'Ranking summary computed {{date}}',
            {
              date: freshness,
            }
          )}
        </p>
      )}
      {tracking.noBackfill && (
        <p className="text-[13px] text-textItemBlur">
          {trackingStartedAt
            ? t(
                'followers_tracking_no_backfill_since',
                'Rankings include events received after tracking began on {{date}}. Earlier provider activity is not backfilled.',
                { date: trackingStartedAt }
              )
            : t(
                'followers_tracking_no_backfill',
                'Rankings include only events received after tracking begins. Earlier provider activity is not backfilled.'
              )}
        </p>
      )}
    </div>
  );
};

export const FollowersComponent: FC = () => {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const modal = useModals();
  const decision = useDecisionModal();
  const [historyPath, setHistoryPath] = useState(pathname || '/followers');
  const followerPath = useMemo(
    () => parseFollowerPath(historyPath || '/followers'),
    [historyPath]
  );
  const {
    slug,
    triage,
    audience,
    isBot: pathIsBot,
  } = followerPath.type === 'follower'
    ? {
        slug: undefined,
        triage: undefined,
        audience: undefined,
        isBot: undefined,
      }
    : followerPath;
  const urlSearch = searchParams.get('search') ?? '';
  const urlListId = searchParams.get('listId') || undefined;
  const urlSort = searchParams.get('sort') || undefined;
  const urlDirectionParam = searchParams.get('direction');
  const urlIsBot = pathIsBot === true;
  const urlDirection: FollowerSortDirection | undefined =
    urlDirectionParam === 'asc' || urlDirectionParam === 'desc'
      ? urlDirectionParam
      : undefined;
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>();
  const [sort, setSort] = useState<string | undefined>(urlSort);
  const [direction, setDirection] = useState<FollowerSortDirection | undefined>(
    urlDirection
  );
  const [window, setWindow] = useState<ChannelInteractionWindow>(
    DEFAULT_FOLLOWER_INTERACTION_WINDOW
  );
  const [limit, setLimit] = useState<number>(24);
  const [search, setSearch] = useState(urlSearch);
  const [debouncedSearch] = useDebounce(search, 300);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const trimmedSearch = debouncedSearch.trim();
  const lastSyncedSearchRef = useRef(urlSearch);
  const openedFollowerKeyRef = useRef<string | null>(null);
  const followerModalFromUrlRef = useRef(false);
  const pushedFollowerHistoryRef = useRef(false);
  const listHrefRef = useRef('/followers');
  const followerMetadataLoadRef = useRef<string | undefined>(undefined);
  const appliedStrategyDefaultChannelRef = useRef(new Set<string>());

  useEffect(() => {
    if (parseFollowerPath(currentWindowPathname()).type === 'follower') {
      setHistoryPath(currentWindowPathname());
      return;
    }
    setHistoryPath(pathname || '/followers');
  }, [pathname]);

  useEffect(() => {
    if (typeof globalThis.addEventListener !== 'function') {
      return;
    }
    const onPopState = () => {
      setHistoryPath(currentWindowPathname());
    };
    globalThis.addEventListener('popstate', onPopState);
    return () => globalThis.removeEventListener('popstate', onPopState);
  }, []);

  const {
    data: channels = [],
    isLoading: isLoadingChannels,
    error: channelsError,
    mutate: mutateChannels,
  } = useFollowerChannels();
  const { data: integrations = [], isLoading: isLoadingIntegrations } =
    useIntegrationList();
  const followerIntegrations = useMemo(() => {
    const followerIds = new Set(channels.map((channel) => channel.id));
    return integrations.filter((integration) =>
      followerIds.has(integration.id)
    );
  }, [channels, integrations]);
  const groupedFollowerIntegrations = useMemo(
    () => groupChannelsByCustomer(followerIntegrations),
    [followerIntegrations]
  );

  useEffect(() => {
    const eligibleIds = channels.map((channel) => channel.id);
    const preferredId =
      followerPath.type === 'follower' &&
      eligibleIds.includes(followerPath.integrationId)
        ? followerPath.integrationId
        : selectedIntegrationId;
    const nextId = resolveChannelId({
      eligibleIds,
      currentId: preferredId,
      fallbackId:
        groupedFollowerIntegrations[0]?.values[0]?.id || channels[0]?.id,
    });
    if (nextId === selectedIntegrationId) {
      return;
    }

    if (
      nextId &&
      (historyPath !== '/followers' ||
        !!urlSearch ||
        !!urlListId ||
        !!urlSort ||
        !!urlDirectionParam)
    ) {
      appliedStrategyDefaultChannelRef.current.add(nextId);
    }
    setSelectedIntegrationId(nextId);
    if (
      nextId &&
      followerPath.type === 'follower' &&
      nextId === followerPath.integrationId
    ) {
      setLastChannelId(nextId);
    }
    setWindow(DEFAULT_FOLLOWER_INTERACTION_WINDOW);
    setCursorHistory([]);
    setPageNumber(1);
  }, [
    channels,
    groupedFollowerIntegrations,
    historyPath,
    selectedIntegrationId,
    followerPath,
    urlDirectionParam,
    urlListId,
    urlSearch,
    urlSort,
  ]);

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedIntegrationId),
    [channels, selectedIntegrationId]
  );
  const { hiddenSlugs, toggleVisibility } = useFollowerTriageVisibility(
    selectedIntegrationId
  );
  const {
    data: boardColumnPreferences = [],
    savePreferences: saveBoardColumnPreferences,
  } = useFollowerBoardColumnPreferences(selectedIntegrationId);
  const [localBoardColumnKeys, setLocalBoardColumnKeys] = useState<
    string[] | null
  >(null);
  const boardColumnKeysRef = useRef<string[]>([]);
  const boardDraggingRef = useRef(false);

  const strategyDefaults =
    selectedIntegrationId &&
    !appliedStrategyDefaultChannelRef.current.has(selectedIntegrationId)
      ? resolveFollowerStrategyDefaults({
          pathname: historyPath || '/followers',
          search: urlSearch,
          listId: urlListId,
          sort: urlSort,
          direction: urlDirectionParam || undefined,
          strategy: selectedChannel?.strategy,
          sorts: selectedChannel?.sorts,
        })
      : undefined;
  const strategyDefaultView = strategyDefaults?.slug
    ? FOLLOWER_VIEW_BY_SLUG[strategyDefaults.slug]
    : undefined;
  const resolvedTriage = triage ?? strategyDefaultView?.triage;
  const resolvedAudience = audience ?? strategyDefaultView?.audience;

  const requestedSort = urlSort ?? sort ?? strategyDefaults?.sort;
  const effectiveSort = selectedChannel?.sorts.some(
    (item) => item.key === requestedSort
  )
    ? requestedSort
    : selectedChannel?.sorts[0]?.key;

  const activeSort = useMemo(
    () => selectedChannel?.sorts.find((item) => item.key === effectiveSort),
    [selectedChannel, effectiveSort]
  );

  const requiresWindow = !!activeSort?.requiresWindow;
  const isInteractionsSort = activeSort?.key === 'interactions';
  const isNotesSort = activeSort?.key === 'notes';

  const resetPagination = useCallback(() => {
    setCursorHistory([]);
    setPageNumber(1);
  }, []);

  const handleChannelSelect = useCallback(
    (channel: FollowerChannel) => {
      setLastChannelId(channel.id);
      setSelectedIntegrationId(channel.id);
      setWindow(DEFAULT_FOLLOWER_INTERACTION_WINDOW);
      resetPagination();
      if (followerPath.type === 'follower') {
        if (openedFollowerKeyRef.current) {
          modal.closeById(openedFollowerKeyRef.current);
          openedFollowerKeyRef.current = null;
        }
        followerModalFromUrlRef.current = false;
        pushedFollowerHistoryRef.current = false;
        browserHistory()?.replaceState(null, '', '/followers');
        setHistoryPath('/followers');
      }
    },
    [followerPath, modal, resetPagination]
  );

  const handleSortChange = useCallback(
    (value: string) => {
      const sortOption = selectedChannel?.sorts.find(
        (item) => item.key === value
      );
      setSort(value);
      setDirection(sortOption?.defaultDirection);
      resetPagination();
    },
    [resetPagination, selectedChannel]
  );

  const handleDirectionChange = useCallback(
    (value: FollowerSortDirection) => {
      setSort(effectiveSort);
      setDirection(value);
      resetPagination();
    },
    [effectiveSort, resetPagination]
  );

  const handleWindowChange = useCallback(
    (value: ChannelInteractionWindow) => {
      setWindow(value);
      resetPagination();
    },
    [resetPagination]
  );

  const handleLimitChange = useCallback(
    (value: number) => {
      setLimit(value);
      resetPagination();
    },
    [resetPagination]
  );

  useEffect(() => {
    if (urlSearch === lastSyncedSearchRef.current) {
      return;
    }
    lastSyncedSearchRef.current = urlSearch;
    setSearch(urlSearch);
  }, [urlSearch]);

  const previousSearch = useRef(trimmedSearch);
  const previousSlug = useRef(slug);
  const previousListId = useRef(urlListId);
  useEffect(() => {
    if (
      previousSearch.current === trimmedSearch &&
      previousSlug.current === slug &&
      previousListId.current === urlListId
    ) {
      return;
    }
    previousSearch.current = trimmedSearch;
    previousSlug.current = slug;
    previousListId.current = urlListId;
    resetPagination();
  }, [trimmedSearch, slug, urlListId, resetPagination]);

  const querySort = sort || urlSort;
  const queryDirection = direction || urlDirection;
  const listHref = buildFollowersPageHref({
    slug,
    search: trimmedSearch || undefined,
    sort: querySort || undefined,
    direction: querySort && queryDirection ? queryDirection : undefined,
    listId: urlListId,
  });

  useEffect(() => {
    if (followerPath.type === 'follower') {
      return;
    }
    listHrefRef.current = listHref;
  }, [followerPath, listHref]);

  useEffect(() => {
    if (
      followerPath.type === 'follower' ||
      !selectedIntegrationId ||
      !strategyDefaults
    ) {
      return;
    }
    appliedStrategyDefaultChannelRef.current.add(selectedIntegrationId);
    const href = buildFollowersPageHref(strategyDefaults);
    if (href !== listHref) {
      router.replace(href);
    }
  }, [followerPath, listHref, router, selectedIntegrationId, strategyDefaults]);

  const closeFollowerDetailUrl = useCallback(() => {
    if (pushedFollowerHistoryRef.current) {
      pushedFollowerHistoryRef.current = false;
      browserHistory()?.back();
      setHistoryPath(currentWindowPathname());
      return;
    }
    if (parseFollowerPath(currentWindowPathname()).type !== 'follower') {
      return;
    }
    browserHistory()?.replaceState(null, '', listHrefRef.current);
    setHistoryPath(pathnameFromHref(listHrefRef.current));
  }, []);

  useEffect(() => {
    if (followerPath.type === 'follower') {
      return;
    }
    // Legacy bookmarks used ?isBot=true; canonicalize to /followers/bots.
    if (searchParams.get('isBot') === 'true' && slug !== 'bots') {
      const legacyParams = new URLSearchParams(searchParams.toString());
      legacyParams.delete('isBot');
      const legacyQuery = legacyParams.toString();
      router.replace(
        legacyQuery ? `/followers/bots?${legacyQuery}` : '/followers/bots'
      );
      return;
    }
    // Legacy bookmarks used /followers/lead; canonicalize to /followers/leads.
    if (slug === 'lead') {
      const legacyParams = new URLSearchParams(searchParams.toString());
      const legacyQuery = legacyParams.toString();
      router.replace(
        legacyQuery ? `/followers/leads?${legacyQuery}` : '/followers/leads'
      );
      return;
    }
    // Legacy bookmarks used /followers/engaged; Engaged merged into Hot.
    if (slug === 'engaged') {
      const legacyParams = new URLSearchParams(searchParams.toString());
      const legacyQuery = legacyParams.toString();
      router.replace(
        legacyQuery ? `/followers/hot?${legacyQuery}` : '/followers/hot'
      );
      return;
    }
    const nextSearch = trimmedSearch || '';
    const nextSort = querySort || '';
    const nextDirection = querySort && queryDirection ? queryDirection : '';
    if (
      urlSearch === nextSearch &&
      (urlSort || '') === nextSort &&
      (urlDirection || '') === nextDirection &&
      (searchParams.get('listId') || undefined) === urlListId &&
      !searchParams.has('isBot')
    ) {
      return;
    }
    if (lastSyncedSearchRef.current === urlSearch && nextSearch !== urlSearch) {
      return;
    }
    lastSyncedSearchRef.current = nextSearch;
    router.replace(listHref);
  }, [
    followerPath,
    listHref,
    trimmedSearch,
    querySort,
    queryDirection,
    urlSearch,
    urlSort,
    urlDirection,
    urlListId,
    slug,
    router,
    searchParams,
  ]);

  const currentCursor = cursorHistory[cursorHistory.length - 1];
  const requestedDirection =
    urlDirection ?? direction ?? strategyDefaults?.direction;
  const effectiveDirection = activeSort
    ? requestedDirection && activeSort.directions.includes(requestedDirection)
      ? requestedDirection
      : activeSort.defaultDirection
    : undefined;

  const showBoard =
    !urlListId &&
    !urlIsBot &&
    !trimmedSearch &&
    !resolvedTriage &&
    !resolvedAudience &&
    !slug;

  const {
    data: followersPage,
    isLoading: isLoadingFollowers,
    error: followersError,
    mutate: mutateFollowers,
  } = useFollowers({
    integrationId: showBoard ? undefined : selectedIntegrationId,
    cursor: currentCursor,
    limit,
    sort:
      resolvedAudience === 'hot' || resolvedAudience === 'converted'
        ? undefined
        : effectiveSort,
    direction:
      resolvedAudience === 'hot' || resolvedAudience === 'converted'
        ? undefined
        : effectiveDirection,
    window:
      resolvedAudience === 'hot' || resolvedAudience === 'converted'
        ? undefined
        : requiresWindow
        ? window
        : undefined,
    search: trimmedSearch || undefined,
    triage: urlListId ? undefined : resolvedTriage,
    audience: urlListId ? undefined : resolvedAudience,
    listId: urlListId,
    isBot: urlIsBot || undefined,
  });

  const boardIntegrationId = showBoard ? selectedIntegrationId : undefined;
  const leadsPreview = useFollowers({
    integrationId: boardIntegrationId,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    audience: 'lead',
  });
  const hotPreview = useFollowers({
    integrationId: boardIntegrationId,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    audience: 'hot',
  });
  const mutualPreview = useFollowers({
    integrationId: boardIntegrationId,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    triage: 'mutual',
  });
  const cultivatePreview = useFollowers({
    integrationId: boardIntegrationId,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    audience: 'cultivate',
  });
  const quietPreview = useFollowers({
    integrationId: boardIntegrationId,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    triage: 'quiet',
  });
  const followedPreview = useFollowers({
    integrationId: boardIntegrationId,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    audience: 'followed',
  });
  const conversionsPreview = useFollowers({
    integrationId: boardIntegrationId,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    audience: 'converted',
  });
  const costlyPreview = useFollowers({
    integrationId: boardIntegrationId,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    triage: 'over_invested',
  });
  const ignoredPreview = useFollowers({
    integrationId: boardIntegrationId,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    audience: 'ignored',
  });
  const unfollowedPreview = useFollowers({
    integrationId: boardIntegrationId,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    audience: 'unfollowed',
  });
  const botsPreview = useFollowers({
    integrationId: boardIntegrationId,
    limit: FOLLOWER_BOARD_PREVIEW_LIMIT,
    isBot: true,
  });

  const { data: audienceSummary } = useFollowerAudienceSummary(
    selectedIntegrationId
  );

  const boardPreviewBySlug = {
    leads: leadsPreview,
    hot: hotPreview,
    mutual: mutualPreview,
    cultivate: cultivatePreview,
    followed: followedPreview,
    conversions: conversionsPreview,
    quiet: quietPreview,
    costly: costlyPreview,
    ignored: ignoredPreview,
    unfollowed: unfollowedPreview,
    bots: botsPreview,
  } as const;

  useEffect(() => {
    if (!followersPage || !selectedIntegrationId) {
      return;
    }
    const pageKey = `${selectedIntegrationId}:${currentCursor || 'first'}`;
    if (followerMetadataLoadRef.current === pageKey) {
      return;
    }
    followerMetadataLoadRef.current = pageKey;
    void mutateChannels();
  }, [currentCursor, followersPage, mutateChannels, selectedIntegrationId]);

  const { data: followerLists = [] } = useFollowerLists(selectedIntegrationId);
  const {
    createList,
    deleteList,
    updateList,
    addMember,
    importMemberFromUrl,
    importLeadFromUrl,
    removeMember,
    ignoreTriage,
    followMember,
    unfollowMember,
    ignoreFollower,
    unignoreFollower,
  } = useFollowerListMutations(selectedIntegrationId);
  const toast = useToaster();
  const canFollowAudienceMember = !!selectedChannel?.canFollowAudienceMember;

  const handleDismissTriage = useCallback(
    async (
      follower: Follower,
      triageValue: DismissibleTriage,
      reasons?: LeadFitDismissReason[],
      options?: DismissTriageOptions
    ) => {
      if (triageValue === 'lead' && options?.follow) {
        try {
          await followMember(follower.id);
          if (resolvedAudience === 'lead') {
            await mutateFollowers(
              (page) =>
                applyFollowToFollowerPage(
                  page,
                  follower.id,
                  new Date().toISOString(),
                  {
                    removeFromPage: true,
                  }
                ),
              { revalidate: false }
            );
          }
        } catch (error) {
          toast.show(
            error instanceof Error
              ? error.message
              : t(
                  'followers_lead_follow_error',
                  'Could not follow this profile'
                ),
            'warning'
          );
        }
        return;
      }
      if (triageValue === 'lead' && options?.moveToListId) {
        await addMember(options.moveToListId, follower.id);
        if (resolvedAudience === 'lead') {
          await mutateFollowers(
            (page) =>
              applyIgnoreToFollowerPage(page, follower.id, {
                removeFromPage: true,
              }),
            { revalidate: false }
          );
        }
        return;
      }
      await ignoreTriage(follower.id, triageValue, reasons, options);
      const shouldRemoveFromPage =
        resolvedTriage === triageValue ||
        (resolvedAudience === 'lead' && triageValue === 'lead') ||
        (resolvedAudience === 'cultivate' && triageValue === 'cultivate') ||
        (resolvedAudience === 'hot' && triageValue === 'hot_lead');
      if (shouldRemoveFromPage) {
        await mutateFollowers(
          (page) =>
            applyTriageIgnoreToFollowerPage(page, follower.id, {
              removeFromPage: true,
              triage: triageValue,
            }),
          { revalidate: false }
        );
      }
    },
    [
      addMember,
      followMember,
      ignoreTriage,
      mutateFollowers,
      resolvedAudience,
      resolvedTriage,
      t,
      toast,
    ]
  );

  const handleUnfollowFollower = useCallback(
    async (follower: Follower) => {
      try {
        await unfollowMember(follower.id);
      } catch (error) {
        toast.show(
          error instanceof Error
            ? error.message
            : t('followers_unfollow_error', 'Could not unfollow this profile'),
          'warning'
        );
      }
    },
    [t, toast, unfollowMember]
  );

  const activeCategory = !urlListId
    ? resolvedTriage || resolvedAudience
    : undefined;
  const activeList = useMemo(
    () => followerLists.find((list) => list.id === urlListId),
    [followerLists, urlListId]
  );

  const deepLinkIdentity =
    followerPath.type === 'follower'
      ? { username: followerPath.username }
      : undefined;
  const { data: deepLinkDetail } = useFollowerDetail(
    followerPath.type === 'follower' ? followerPath.integrationId : undefined,
    deepLinkIdentity
  );

  const followerPageContext = useMemo(() => {
    const selectedFollower =
      followerPath.type === 'follower' ? deepLinkDetail?.follower : undefined;
    const categoryLabel =
      TRIAGE_FILTER_OPTIONS.find(
        (option) =>
          option.value === activeCategory || option.audience === activeCategory
      )?.defaultLabel || (activeCategory === 'ignored' ? 'Ignored' : undefined);
    const tracking = followersPage?.tracking || selectedChannel?.tracking;

    return formatFollowerPageContext({
      kind: followerPath.type === 'follower' ? 'detail' : 'list',
      route: historyPath || '/followers',
      channel: {
        id:
          selectedIntegrationId ||
          (followerPath.type === 'follower' ? followerPath.integrationId : ''),
        name: selectedChannel?.name,
        platform: selectedChannel?.identifier,
        display: selectedChannel?.display,
      },
      strategy: selectedChannel?.strategy
        ? {
            id: selectedChannel.strategy.id,
            version: selectedChannel.strategy.version,
            summary: selectedChannel.strategy.summary.defaultValue,
          }
        : undefined,
      follower:
        followerPath.type === 'follower'
          ? {
              id: selectedFollower?.id,
              username: selectedFollower?.username || followerPath.username,
              name: selectedFollower?.name,
            }
          : undefined,
      category: activeCategory
        ? {
            key: activeCategory,
            label: categoryLabel,
            meaning: FOLLOWER_CATEGORY_DESCRIPTIONS[activeCategory],
          }
        : undefined,
      search: normalizeFollowerSearch(trimmedSearch),
      list: urlListId
        ? {
            id: urlListId,
            name: activeList?.name,
            status: activeList ? 'current' : 'unknown_or_deleted',
          }
        : undefined,
      availableLists: followerLists.map((list) => ({
        id: list.id,
        name: list.name,
      })),
      sort:
        activeSort && effectiveDirection
          ? {
              key: activeSort.key,
              label: activeSort.label,
              scope: activeSort.scope || 'native',
              direction: effectiveDirection,
              caveat:
                activeSort.scope === 'page'
                  ? 'Sorting applies only to the currently loaded page.'
                  : undefined,
            }
          : undefined,
      interactionWindow: requiresWindow ? window : undefined,
      pagination: { size: limit, number: pageNumber },
      tracking: tracking
        ? {
            availability: tracking.availability,
            state: tracking.state,
            computedAt: tracking.computedAt,
            followerSnapshotAt: tracking.followerSnapshotAt,
          }
        : undefined,
    });
  }, [
    activeCategory,
    activeList,
    activeSort,
    deepLinkDetail?.follower,
    effectiveDirection,
    followerLists,
    followerPath,
    followersPage?.tracking,
    historyPath,
    limit,
    pageNumber,
    requiresWindow,
    selectedChannel,
    selectedIntegrationId,
    trimmedSearch,
    urlListId,
    window,
  ]);

  useCopilotReadable({
    description: 'followerPage',
    value: followerPageContext,
  });
  useCopilotFollowerPageProperties(followerPageContext);

  const openFollowerDetailModal = useCallback(
    ({
      integrationId,
      externalId,
      username,
    }: {
      integrationId: string;
      externalId?: string;
      username?: string;
    }) => {
      const modalId = `follower-detail-${integrationId}-${
        username || externalId
      }`;
      openedFollowerKeyRef.current = modalId;
      modal.openModal({
        id: modalId,
        title: t('followers_detail_title', 'Follower details'),
        size: 'calc(100vw - 24px)',
        maxSize: '960px',
        height: 'min(820px, calc(100dvh - 24px))',
        withCloseButton: true,
        classNames: {
          modal: 'text-textColor',
        },
        onClose: username ? closeFollowerDetailUrl : undefined,
        children: (close) => (
          <FollowerDetailModal
            integrationId={integrationId}
            externalId={externalId}
            username={username}
            close={close}
          />
        ),
      });
    },
    [closeFollowerDetailUrl, modal, t]
  );

  const handleNext = useCallback(() => {
    if (!followersPage?.nextCursor) {
      return;
    }
    setCursorHistory((previous) => [...previous, followersPage.nextCursor!]);
    setPageNumber((previous) => previous + 1);
  }, [followersPage?.nextCursor]);

  const handlePrevious = useCallback(() => {
    if (!cursorHistory.length) {
      return;
    }
    setCursorHistory((previous) => previous.slice(0, -1));
    setPageNumber((previous) => Math.max(1, previous - 1));
  }, [cursorHistory.length]);

  const openFollowerDetail = useCallback(
    (follower: Follower) => {
      if (!selectedIntegrationId) {
        return;
      }
      const username = follower.username
        ? normalizeFollowerSearch(follower.username)
        : undefined;
      if (username) {
        const href = buildFollowerDetailHref(selectedIntegrationId, username);
        browserHistory()?.pushState({ followerDetail: true }, '', href);
        setHistoryPath(pathnameFromHref(href));
        pushedFollowerHistoryRef.current = true;
      }
      openFollowerDetailModal({
        integrationId: selectedIntegrationId,
        externalId: follower.id,
        username,
      });
    },
    [openFollowerDetailModal, selectedIntegrationId]
  );

  useEffect(() => {
    if (followerPath.type !== 'follower') {
      if (followerModalFromUrlRef.current && openedFollowerKeyRef.current) {
        modal.closeById(openedFollowerKeyRef.current);
        openedFollowerKeyRef.current = null;
      }
      followerModalFromUrlRef.current = false;
      return;
    }
    if (
      !selectedIntegrationId ||
      selectedIntegrationId !== followerPath.integrationId
    ) {
      return;
    }
    if (!deepLinkDetail) {
      return;
    }
    const modalId = `follower-detail-${followerPath.integrationId}-${followerPath.username}`;
    followerModalFromUrlRef.current = true;
    if (openedFollowerKeyRef.current === modalId) {
      return;
    }
    if (openedFollowerKeyRef.current) {
      modal.closeById(openedFollowerKeyRef.current);
    }
    openFollowerDetailModal({
      integrationId: followerPath.integrationId,
      username: followerPath.username,
    });
  }, [
    deepLinkDetail,
    followerPath,
    modal,
    openFollowerDetailModal,
    selectedIntegrationId,
  ]);

  const openCreateListModal = useCallback(() => {
    modal.openModal({
      title: t('followers_create_list_title', 'Create list'),
      children: (close) => (
        <FollowerListCreateModal
          close={close}
          onCreate={async (name) => {
            await createList(name);
          }}
        />
      ),
    });
  }, [createList, modal, t]);

  const openAddToListModal = useCallback(() => {
    if (!urlListId) {
      return;
    }
    modal.openModal({
      title: t('followers_list_add_title', 'Add to list'),
      children: (close) => (
        <FollowerListAddModal
          close={close}
          listName={activeList?.name}
          onImport={async (url) => {
            await importMemberFromUrl(urlListId, url);
          }}
        />
      ),
    });
  }, [activeList?.name, importMemberFromUrl, modal, t, urlListId]);

  const openAddLeadModal = useCallback(() => {
    modal.openModal({
      title: t('followers_lead_add_title', 'Add lead'),
      children: (close) => (
        <FollowerListAddModal
          close={close}
          description={t(
            'followers_lead_add_description',
            'Paste a profile URL to add someone to Leads.'
          )}
          errorFallback={t(
            'followers_lead_add_error',
            'We could not add this profile as a lead.'
          )}
          onImport={async (url) => {
            await importLeadFromUrl(url);
          }}
        />
      ),
    });
  }, [importLeadFromUrl, modal, t]);

  const removeSelectedList = useCallback(async () => {
    if (!urlListId) {
      return;
    }
    const listName = activeList?.name;
    const approved = await decision.open({
      title: t('followers_list_remove_title', 'Remove this list?'),
      description: listName
        ? t(
            'followers_list_remove_description_named',
            '"{{name}}" will be deleted. People in it stay as followers.',
            { name: listName }
          )
        : t(
            'followers_list_remove_description',
            'This list will be deleted. People in it stay as followers.'
          ),
      approveLabel: t('yes', 'Yes'),
      cancelLabel: t('cancel', 'Cancel'),
    });
    if (!approved) {
      return;
    }
    await deleteList(urlListId);
    router.push(
      buildFollowersPageHref({
        search: trimmedSearch || undefined,
        sort: querySort,
        direction: querySort ? queryDirection : undefined,
      })
    );
  }, [
    activeList?.name,
    decision,
    deleteList,
    queryDirection,
    querySort,
    router,
    t,
    trimmedSearch,
    urlListId,
  ]);

  const defaultBoardColumns = useMemo((): FollowerBoardOrderedColumn[] => {
    if (!showBoard) {
      return [];
    }
    const segmentColumns: FollowerBoardOrderedColumn[] =
      FOLLOWER_BOARD_SEGMENTS.filter((segment) =>
        isFollowerSegmentVisible(segment.slug, hiddenSlugs)
      ).map((segment) => {
        const preview =
          boardPreviewBySlug[segment.slug as keyof typeof boardPreviewBySlug];
        const countKey = segment.isBot
          ? 'bots'
          : segment.categoryKey || segment.slug;
        return {
          kind: 'segment' as const,
          columnKey: columnKeyForSegment(segment.slug),
          segment,
          items: preview?.data?.items ?? [],
          total: categoryCount(audienceSummary?.categories, countKey),
          isLoading: !!preview?.isLoading,
          viewAllHref: buildFollowersPageHref({
            slug: segment.slug,
            sort: querySort,
            direction: querySort ? queryDirection : undefined,
          }),
        };
      });

    const totalsByListId = new Map(
      (audienceSummary?.lists ?? []).map((list) => [list.id, list.total])
    );
    const listColumns: FollowerBoardOrderedColumn[] = followerLists.map(
      (list) => ({
        kind: 'list' as const,
        columnKey: columnKeyForList(list.id),
        list,
        total: totalsByListId.get(list.id) ?? null,
        viewAllHref: buildFollowersPageHref({
          listId: list.id,
          sort: querySort,
          direction: querySort ? queryDirection : undefined,
        }),
      })
    );

    return [...segmentColumns, ...listColumns];
  }, [
    audienceSummary?.categories,
    audienceSummary?.lists,
    boardPreviewBySlug,
    followerLists,
    hiddenSlugs,
    queryDirection,
    querySort,
    showBoard,
  ]);

  const orderedBoardColumns = useMemo((): FollowerBoardOrderedColumn[] => {
    if (!selectedIntegrationId || !defaultBoardColumns.length) {
      return defaultBoardColumns;
    }

    const preferred = applyFollowerBoardColumnPreferences(
      defaultBoardColumns,
      boardColumnPreferences,
      selectedIntegrationId
    );

    if (!localBoardColumnKeys) {
      return preferred;
    }

    const byKey = new Map(
      preferred.map((column) => [column.columnKey, column])
    );
    const ordered = localBoardColumnKeys
      .map((key) => byKey.get(key))
      .filter((column): column is FollowerBoardOrderedColumn => !!column);
    const seen = new Set(ordered.map((column) => column.columnKey));
    for (const column of preferred) {
      if (!seen.has(column.columnKey)) {
        ordered.push(column);
      }
    }
    return ordered;
  }, [
    boardColumnPreferences,
    defaultBoardColumns,
    localBoardColumnKeys,
    selectedIntegrationId,
  ]);

  useEffect(() => {
    boardColumnKeysRef.current = orderedBoardColumns.map(
      (column) => column.columnKey
    );
  }, [orderedBoardColumns]);

  useEffect(() => {
    setLocalBoardColumnKeys(null);
    boardDraggingRef.current = false;
  }, [selectedIntegrationId]);

  const onBoardReorderLocal = useCallback((from: number, to: number) => {
    boardDraggingRef.current = true;
    setLocalBoardColumnKeys((current) => {
      const keys = current || boardColumnKeysRef.current;
      const next = reorderVisibleKeys(keys, from, to);
      boardColumnKeysRef.current = next;
      return next;
    });
  }, []);

  const onBoardDragEnd = useCallback(() => {
    if (!boardDraggingRef.current || !selectedIntegrationId) {
      return;
    }
    boardDraggingRef.current = false;
    const keys = boardColumnKeysRef.current;
    void saveBoardColumnPreferences(
      buildFollowerBoardColumnPreferences(selectedIntegrationId, keys)
    );
  }, [saveBoardColumnPreferences, selectedIntegrationId]);

  useEffect(() => {
    if (
      followerPath.type === 'follower' ||
      !slug ||
      isFollowerSegmentVisible(slug as FollowerSegmentSlug, hiddenSlugs)
    ) {
      return;
    }
    router.replace(
      buildFollowersPageHref({
        search: trimmedSearch || undefined,
        sort: querySort,
        direction: querySort ? queryDirection : undefined,
        listId: urlListId,
      })
    );
  }, [
    followerPath,
    hiddenSlugs,
    queryDirection,
    querySort,
    router,
    slug,
    trimmedSearch,
    urlListId,
  ]);

  if (isLoadingChannels || isLoadingIntegrations) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  if (channelsError) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center text-center">
        <p className="text-[18px] text-newTextColor">
          {t(
            'followers_channels_error',
            'We could not load follower channels right now.'
          )}
        </p>
        <Button onClick={() => mutateChannels()}>
          {t('followers_retry', 'Retry')}
        </Button>
      </div>
    );
  }

  if (!channels.length) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-col gap-[15px] transition-all flex-1 justify-center items-center text-center">
        <div>
          <img src="/peoplemarketplace.svg" alt="" />
        </div>
        <div className="text-[32px] md:text-[48px] text-newTextColor">
          {t('followers_no_channels_title', 'No follower channels yet')}
        </div>
        <div className="text-[16px] md:text-[20px] text-textItemBlur max-w-[720px]">
          {t(
            'followers_no_channels_description',
            'Connect a channel that exposes follower identities through its API. Some channels may require reconnecting after new permissions are added.'
          )}
        </div>
        <Button onClick={() => router.push('/calendar')}>
          {t(
            'go_to_the_calendar_to_add_channels',
            'Go to the calendar to add channels'
          )}
        </Button>
      </div>
    );
  }

  const showSortSelector = (selectedChannel?.sorts.length ?? 0) > 1;
  const showDirectionSelector = (activeSort?.directions.length ?? 0) > 1;
  const isPageScopedSort = activeSort?.scope === 'page';
  const canGoPrevious = cursorHistory.length > 0 && !isLoadingFollowers;
  const canGoNext = !!followersPage?.hasMore && !isLoadingFollowers;
  const tracking = followersPage?.tracking ?? selectedChannel?.tracking;
  const isTrackingProvisioning = tracking?.availability === 'provisioning';
  const isTrackingUnavailable = tracking?.availability === 'unavailable';
  const isTrackingReady = tracking?.availability === 'ready';

  const renderEmptyState = () => {
    if (trimmedSearch) {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t(
              'followers_search_empty_title',
              'No followers match this search'
            )}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_search_empty_description',
              'Try a different username or display name.'
            )}
          </p>
        </div>
      );
    }

    if (urlListId) {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t('followers_list_empty_title', 'No followers in this list')}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_list_empty_description',
              'Use + Add to paste a profile URL, or add people from their cards using the + button next to their triage label.'
            )}
          </p>
        </div>
      );
    }

    if (resolvedAudience === 'ignored') {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t('followers_ignored_empty_title', 'No ignored followers')}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_ignored_empty_description',
              'Ignored followers are hidden from all other views. Use the + menu on a follower card to ignore someone, or to restore them from this list.'
            )}
          </p>
        </div>
      );
    }

    if (resolvedAudience === 'lead') {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t('followers_lead_empty_title', 'No leads on this channel')}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_lead_empty_description',
              'Leads are people who interacted with this channel but do not currently follow it, plus prospects discovered through warm followers’ networks.'
            )}
          </p>
        </div>
      );
    }

    if (resolvedAudience === 'followed') {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t('followers_followed_empty_title', 'No followed people yet')}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_followed_empty_description',
              'Follow leads from their badge to track people you followed who have not followed back yet.'
            )}
          </p>
        </div>
      );
    }

    if (resolvedAudience === 'converted') {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t('followers_converted_empty_title', 'No conversions yet')}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_converted_empty_description',
              'Converted people appear here after Post++ records a conversion tied to their profile, such as a new follower, website goal, amplification threshold, or support resolution.'
            )}
          </p>
        </div>
      );
    }

    if (resolvedAudience === 'unfollowed') {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t('followers_unfollowed_empty_title', 'No unfollowed people')}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_unfollowed_empty_description',
              'People you still follow who used to follow you and no longer do appear here.'
            )}
          </p>
        </div>
      );
    }

    if (resolvedAudience === 'hot') {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t('followers_hot_empty_title', 'No hot picks right now')}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_hot_empty_description',
              'Hot refreshes hourly with a bounded set of relationships that need reciprocation. New picks can take up to an hour to appear after activity changes.'
            )}
          </p>
        </div>
      );
    }

    if (resolvedAudience === 'cultivate') {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t(
              'followers_cultivate_empty_title',
              'No cultivate picks right now'
            )}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_cultivate_empty_description',
              'Cultivate surfaces warm relationships that have not received outbound attention recently. These are people to nurture, not new leads.'
            )}
          </p>
        </div>
      );
    }

    if (resolvedTriage) {
      const activeFilter = TRIAGE_FILTER_OPTIONS.find(
        (option) => option.value === resolvedTriage
      );
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t(
              'followers_triage_empty_title',
              'No followers match this triage filter'
            )}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_triage_empty_description',
              'No followers match the {{filter}} filter on this channel. Try another filter or clear it to see everyone.',
              {
                filter: activeFilter
                  ? t(activeFilter.key, activeFilter.defaultLabel)
                  : resolvedTriage,
              }
            )}
          </p>
        </div>
      );
    }

    if (isInteractionsSort && isTrackingProvisioning) {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t(
              'followers_interactions_provisioning_title',
              'Setting up interaction tracking'
            )}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_interactions_provisioning_description',
              'We are syncing followers and preparing interaction rankings for this channel. Check back shortly.'
            )}
          </p>
        </div>
      );
    }

    if (isInteractionsSort && isTrackingUnavailable) {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t(
              'followers_interactions_unavailable_title',
              'Interaction rankings unavailable'
            )}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_interactions_unavailable_description',
              'We could not load interaction rankings for this channel right now.'
            )}
          </p>
          <Button onClick={() => mutateFollowers()}>
            {t('followers_retry', 'Retry')}
          </Button>
        </div>
      );
    }

    if (isInteractionsSort && isTrackingReady) {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t(
              'followers_interactions_empty_title',
              'No interactions in this time window'
            )}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_interactions_empty_description',
              'No follower interactions were recorded during the selected period. Try a longer time window.'
            )}
          </p>
        </div>
      );
    }

    if (isNotesSort) {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t(
              'followers_notes_empty_title',
              'No synced followers to sort by notes yet'
            )}
          </p>
          <p className="text-[14px] text-textItemBlur max-w-[520px]">
            {t(
              'followers_notes_empty_description',
              'Once followers are synced for this channel, you can sort them by how many team notes they have.'
            )}
          </p>
        </div>
      );
    }

    if (selectedChannel?.strategy) {
      return (
        <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t(
              selectedChannel.strategy.ui.emptyState.key,
              selectedChannel.strategy.ui.emptyState.defaultValue
            )}
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[32px] text-center">
        <p className="text-[18px] text-newTextColor">
          {t('followers_empty_page', 'No followers on this page')}
        </p>
        <p className="text-[14px] text-textItemBlur max-w-[520px]">
          {t(
            'followers_reconnect_caveat',
            'If you recently connected this channel, you may need to reconnect so it can access follower data.'
          )}
        </p>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <ChannelsSidebar
        integrationCount={followerIntegrations.length}
        showAddProvider={false}
      >
        {(collapsed) => (
          <ChannelMenu
            collapsed={collapsed}
            integrations={followerIntegrations}
            selectedIds={selectedIntegrationId ? [selectedIntegrationId] : []}
            onSelect={(integration) => {
              const channel = channels.find(
                (item) => item.id === integration.id
              );
              if (channel) {
                handleChannelSelect(channel);
              }
            }}
          />
        )}
      </ChannelsSidebar>

      <div className="bg-newBgColorInner flex min-h-0 min-w-0 flex-1 flex-col gap-[16px] overflow-y-auto p-[20px]">
        <div className="flex flex-col gap-[16px]">
          <div
            className="flex flex-wrap items-center gap-[8px]"
            role="group"
            aria-label={t('followers_filter_group_lists', 'Custom lists')}
            data-testid="followers-filter-bar"
            data-filter-group="lists"
          >
            <Link
              href={buildFollowersPageHref({
                slug: 'all',
                search: trimmedSearch || undefined,
                sort: querySort,
                direction: querySort ? queryDirection : undefined,
              })}
              scroll={false}
              className={clsx(
                FILTER_CHIP_BASE,
                getTabChipClasses('blue', slug === 'all')
              )}
              aria-pressed={slug === 'all'}
              aria-current={slug === 'all' ? 'page' : undefined}
            >
              {t('followers_all_followers', 'All followers')}
            </Link>
            {followerLists.map((list) => {
              const isSelected = urlListId === list.id;
              const listColor =
                (list.color as FollowerSegmentColor | null | undefined) ??
                'neutral';
              return (
                <Link
                  key={list.id}
                  href={buildFollowersPageHref({
                    search: trimmedSearch || undefined,
                    sort: querySort,
                    direction: querySort ? queryDirection : undefined,
                    listId: list.id,
                  })}
                  scroll={false}
                  className={clsx(
                    FILTER_CHIP_BASE,
                    getTabChipClasses(listColor, isSelected)
                  )}
                  aria-pressed={isSelected}
                  aria-current={isSelected ? 'page' : undefined}
                >
                  {list.name}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={openCreateListModal}
              className={clsx(
                'inline-flex items-center justify-center',
                FILTER_CHIP_BASE,
                getTabChipClasses('neutral', false)
              )}
              aria-label={t('followers_create_list', 'Create list')}
            >
              <PlusIcon size={14} />
            </button>
          </div>

          <div className="flex flex-col gap-[12px] sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <SearchIcon
                size={16}
                className="pointer-events-none absolute start-[14px] top-1/2 -translate-y-1/2 text-textItemBlur"
              />
              <input
                name="followers-search"
                value={search}
                placeholder={t(
                  'followers_search_placeholder',
                  'Search followers or @username...'
                )}
                onChange={(event) => {
                  lastSyncedSearchRef.current = event.target.value.trim();
                  setSearch(event.target.value);
                }}
                className="h-[42px] w-full rounded-[10px] border border-newBorder bg-newBgColorInner pe-[14px] ps-[40px] text-[14px] text-newTextColor outline-none placeholder:text-textItemBlur focus:border-newTextColor/40"
                aria-label={t('followers_search', 'Search')}
                data-testid="followers-search-input"
              />
            </div>
            <div className="flex shrink-0 items-center gap-[8px]">
              <FollowerFiltersMenu
                sorts={selectedChannel?.sorts}
                sort={effectiveSort}
                direction={effectiveDirection}
                window={window}
                limit={limit}
                showSort={showSortSelector}
                showDirection={showDirectionSelector}
                showWindow={requiresWindow}
                onSortChange={handleSortChange}
                onDirectionChange={handleDirectionChange}
                onWindowChange={handleWindowChange}
                onLimitChange={handleLimitChange}
              />
              <FollowerTriageVisibilityMenu
                hiddenSlugs={hiddenSlugs}
                onToggle={toggleVisibility}
              />
            </div>
          </div>

          {isPageScopedSort && !showBoard && (
            <p className="text-[13px] text-textItemBlur">
              {t(
                'followers_page_sort_hint',
                'Sorting applies to the current page only. Use Recent for the channel’s native order across pages.'
              )}
            </p>
          )}

          <FollowerTriageTip slug={slug} hidden={!!urlListId} />

          {urlListId && (
            <div className="flex items-center gap-[8px]">
              <button
                type="button"
                onClick={openAddToListModal}
                className="inline-flex items-center gap-[6px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[10px] py-[6px] text-[13px] text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor"
              >
                <PlusIcon size={14} />
                {t('followers_list_add_button', 'Add')}
              </button>
              <button
                type="button"
                onClick={removeSelectedList}
                className="inline-flex items-center gap-[6px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[10px] py-[6px] text-[13px] text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor"
              >
                <MinusIcon size={14} />
                {t('followers_list_remove_button', 'Remove')}
              </button>
              {activeList && (
                <FollowerListColorPicker
                  color={activeList.color}
                  onChange={async (color) => {
                    await updateList(urlListId, {
                      name: activeList.name,
                      color,
                    });
                  }}
                />
              )}
            </div>
          )}

          {resolvedAudience === 'lead' && !urlListId && (
            <div className="flex items-center gap-[8px]">
              <button
                type="button"
                onClick={openAddLeadModal}
                className="inline-flex items-center gap-[6px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[10px] py-[6px] text-[13px] text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor"
                data-testid="followers-lead-add-button"
              >
                <PlusIcon size={14} />
                {t('followers_lead_add_button', 'Add')}
              </button>
            </div>
          )}
        </div>

        {showBoard && (
          <DNDProvider>
            <FollowerBoard
              orderedColumns={orderedBoardColumns}
              integrationId={selectedIntegrationId}
              canFollow={canFollowAudienceMember}
              canUnfollow={canFollowAudienceMember}
              lists={followerLists}
              onReorderLocal={onBoardReorderLocal}
              onDragEnd={onBoardDragEnd}
              onOpenFollower={openFollowerDetail}
              onAddLead={openAddLeadModal}
              onDismissTriage={async (
                follower,
                triageValue,
                reasons,
                options
              ) => {
                await handleDismissTriage(
                  follower,
                  triageValue,
                  reasons,
                  options
                );
              }}
              onUnfollow={handleUnfollowFollower}
            />
          </DNDProvider>
        )}

        {isInteractionsSort && !showBoard && (
          <TrackingNotice tracking={tracking} showFreshness={isTrackingReady} />
        )}
        {!showBoard && selectedChannel?.recomputing && (
          <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-[14px] py-[10px] text-[13px] text-amber-400">
            {t(
              'followers_strategy_recomputing',
              'Relationship grades are being recomputed for this strategy. Existing grades remain visible until the update finishes.'
            )}
          </div>
        )}

        {!showBoard && followersError && (
          <div className="flex flex-col items-center justify-center gap-[12px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[24px] text-center">
            <p className="text-[16px] text-newTextColor">
              {t(
                'followers_load_error',
                'We could not load followers for this channel right now.'
              )}
            </p>
            <Button onClick={() => mutateFollowers()}>
              {t('followers_retry', 'Retry')}
            </Button>
          </div>
        )}

        {!showBoard && !followersError && isLoadingFollowers && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[16px]">
            {Array.from({ length: limit > 12 ? 6 : 3 }).map((_, index) => (
              <FollowerCardSkeleton key={index} />
            ))}
          </div>
        )}

        {!showBoard &&
          !followersError &&
          !isLoadingFollowers &&
          !followersPage?.items.length &&
          renderEmptyState()}

        {!showBoard &&
          !followersError &&
          !isLoadingFollowers &&
          !!followersPage?.items.length && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[16px]">
                {followersPage.items.map((follower) => (
                  <FollowerCard
                    key={follower.id}
                    follower={
                      resolvedAudience === 'ignored'
                        ? { ...follower, isIgnored: true }
                        : follower
                    }
                    timelineHref={
                      follower.username && selectedIntegrationId
                        ? buildFollowerTimelineHref(
                            selectedIntegrationId,
                            follower.username,
                            follower.id
                          )
                        : undefined
                    }
                    lists={followerLists}
                    canFollow={canFollowAudienceMember}
                    onToggleList={async (list, assigned) => {
                      if (assigned) {
                        await removeMember(list.id, follower.id);
                        return;
                      }
                      await addMember(list.id, follower.id);
                      if (resolvedAudience === 'lead') {
                        await mutateFollowers(
                          (page) =>
                            applyIgnoreToFollowerPage(page, follower.id, {
                              removeFromPage: true,
                            }),
                          { revalidate: false }
                        );
                      }
                    }}
                    onToggleIgnored={async (ignored) => {
                      if (ignored) {
                        await ignoreFollower(follower.id);
                        if (resolvedAudience !== 'ignored') {
                          await mutateFollowers(
                            (page) =>
                              applyIgnoreToFollowerPage(page, follower.id, {
                                removeFromPage: true,
                                isIgnored: true,
                              }),
                            { revalidate: false }
                          );
                        }
                        return;
                      }
                      await unignoreFollower(follower.id);
                      if (resolvedAudience === 'ignored') {
                        await mutateFollowers(
                          (page) =>
                            applyIgnoreToFollowerPage(page, follower.id, {
                              removeFromPage: true,
                              isIgnored: false,
                            }),
                          { revalidate: false }
                        );
                      }
                    }}
                    onDismissTriage={async (triageValue, reasons, options) => {
                      await handleDismissTriage(
                        follower,
                        triageValue,
                        reasons,
                        options
                      );
                    }}
                    onOpen={() => openFollowerDetail(follower)}
                  />
                ))}
              </div>

              <div className="flex flex-col gap-[8px] items-center justify-center pt-[8px]">
                <div className="flex items-center gap-[12px]">
                  <button
                    type="button"
                    onClick={handlePrevious}
                    disabled={!canGoPrevious}
                    className={clsx(
                      'inline-flex items-center gap-[6px] rounded-[8px] border border-newTableBorder px-[14px] py-[8px] text-[14px] text-newTextColor hover:bg-newTableHeader transition-colors',
                      !canGoPrevious && 'opacity-30 pointer-events-none'
                    )}
                    aria-label={t('previous', 'Previous')}
                  >
                    <span>{t('previous', 'Previous')}</span>
                  </button>
                  <span className="text-[14px] text-textItemBlur">
                    {t('followers_page', 'Page {{number}}', {
                      number: pageNumber,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!canGoNext}
                    className={clsx(
                      'inline-flex items-center gap-[6px] rounded-[8px] border border-newTableBorder px-[14px] py-[8px] text-[14px] text-newTextColor hover:bg-newTableHeader transition-colors',
                      !canGoNext && 'opacity-30 pointer-events-none'
                    )}
                    aria-label={t('next', 'Next')}
                  >
                    <span>{t('next', 'Next')}</span>
                  </button>
                </div>
                {!followersPage.hasMore && (
                  <p className="text-[13px] text-textItemBlur">
                    {t('followers_end_of_list', 'End of list')}
                  </p>
                )}
              </div>
            </>
          )}
      </div>
    </div>
  );
};

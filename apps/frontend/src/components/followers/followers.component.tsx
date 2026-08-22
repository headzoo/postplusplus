'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useDebounce } from 'use-debounce';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCopilotReadable } from '@copilotkit/react-core';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { FollowerCard } from '@gitroom/frontend/components/followers/follower.card';
import { FollowerDetailModal } from '@gitroom/frontend/components/followers/follower.detail.modal';
import { FollowerListCreateModal } from '@gitroom/frontend/components/followers/follower.list.create.modal';
import { FollowerListAddModal } from '@gitroom/frontend/components/followers/follower.list.add.modal';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { PlusIcon } from '@gitroom/frontend/components/ui/icons';
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
  FOLLOWER_INTERACTION_WINDOWS,
  FollowerChannel,
  FollowerPageTracking,
  FollowerSortDirection,
  FollowerTriageFilter,
  Follower,
  applyIgnoreToFollowerPage,
  applyTriageIgnoreToFollowerPage,
  buildFollowerDetailHref,
  buildFollowerTimelineHref,
  useFollowerChannels,
  useFollowerDetail,
  useFollowerListMutations,
  useFollowerLists,
  useFollowers,
} from '@gitroom/frontend/components/followers/use.followers';

const PAGE_SIZE_OPTIONS = [12, 24, 48] as const;

const FOLLOWER_VIEW_BY_SLUG: Record<
  string,
  { triage?: FollowerTriageFilter; audience?: 'lead' | 'ignored' | 'cultivate'; isBot?: true }
> = {
  engaged: { triage: 'engaged_not_yet' },
  hot: { triage: 'hot_lead' },
  mutual: { triage: 'mutual' },
  costly: { triage: 'over_invested' },
  quiet: { triage: 'quiet' },
  cultivate: { audience: 'cultivate' },
  leads: { audience: 'lead' },
  // Legacy bookmark slug; canonicalize to /followers/leads.
  lead: { audience: 'lead' },
  ignored: { audience: 'ignored' },
  bots: { isBot: true },
};

const TRIAGE_FILTER_OPTIONS: {
  slug?: string;
  value?: FollowerTriageFilter;
  audience?: 'lead' | 'cultivate';
  key: string;
  defaultLabel: string;
}[] = [
    { key: 'followers_triage_filter_all', defaultLabel: 'All' },
    {
      slug: 'engaged',
      value: 'engaged_not_yet',
      key: 'followers_triage_filter_engaged_not_yet',
      defaultLabel: 'Engaged',
    },
    {
      slug: 'hot',
      value: 'hot_lead',
      key: 'followers_triage_hot_lead',
      defaultLabel: 'Hot',
    },
    {
      slug: 'mutual',
      value: 'mutual',
      key: 'followers_triage_mutual',
      defaultLabel: 'Mutual',
    },
    {
      slug: 'cultivate',
      audience: 'cultivate' as const,
      key: 'followers_audience_cultivate',
      defaultLabel: 'Cultivate',
    },
    {
      slug: 'costly',
      value: 'over_invested',
      key: 'followers_triage_over_invested',
      defaultLabel: 'Costly',
    },
    {
      slug: 'quiet',
      value: 'quiet',
      key: 'followers_triage_quiet',
      defaultLabel: 'Quiet',
    },
    {
      slug: 'leads',
      audience: 'lead' as const,
      key: 'followers_audience_leads',
      defaultLabel: 'Leads',
    },
  ];

const TRIAGE_DEFAULT_SORTS: Partial<
  Record<
    FollowerTriageFilter,
    { key: string; direction: FollowerSortDirection }
  >
> = {
  hot_lead: { key: 'net_gap', direction: 'desc' },
  engaged_not_yet: { key: 'their_effort', direction: 'desc' },
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
  audience?: 'lead' | 'ignored' | 'cultivate';
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

const pathnameFromHref = (href: string) => {
  try {
    return new URL(href, globalThis.location?.origin || 'http://localhost').pathname;
  } catch {
    return href.split('?')[0] || '/followers';
  }
};

const currentWindowPathname = () => globalThis.location?.pathname || '/followers';

const browserHistory = () => globalThis.history;

export { buildFollowerDetailHref };

const INTERACTION_KIND_LABELS: Record<string, { key: string; defaultLabel: string }> = {
  like: { key: 'followers_interaction_kind_like', defaultLabel: 'Likes' },
  reply: { key: 'followers_interaction_kind_reply', defaultLabel: 'Replies' },
  repost: { key: 'followers_interaction_kind_repost', defaultLabel: 'Reposts' },
  follow: { key: 'followers_interaction_kind_follow', defaultLabel: 'Follows' },
  mention: { key: 'followers_interaction_kind_mention', defaultLabel: 'Mentions' },
};

const getPartialCoverageItems = (
  coverage?: ChannelInteractionKindCoverage[]
) =>
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
          {tracking.failedSubscriptions && tracking.failedSubscriptions.length > 0 && (
            <ul className="mt-[6px] list-disc ps-[18px]">
              {tracking.failedSubscriptions.map((subscription) => (
                <li key={`${subscription.eventKey}:${subscription.direction}`}>
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
          {t('followers_tracking_freshness', 'Ranking summary computed {{date}}', {
            date: freshness,
          })}
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
  const [historyPath, setHistoryPath] = useState(pathname || '/followers');
  const followerPath = useMemo(
    () => parseFollowerPath(historyPath || '/followers'),
    [historyPath]
  );
  const { slug, triage, audience, isBot: pathIsBot } =
    followerPath.type === 'follower'
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
    return integrations.filter((integration) => followerIds.has(integration.id));
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
    selectedIntegrationId,
    followerPath,
  ]);

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedIntegrationId),
    [channels, selectedIntegrationId]
  );

  const triageDefaultSort =
    !urlSort && !sort && triage ? TRIAGE_DEFAULT_SORTS[triage] : undefined;
  const requestedSort = urlSort ?? sort ?? triageDefaultSort?.key;
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
      const sortOption = selectedChannel?.sorts.find((item) => item.key === value);
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
    if (
      searchParams.get('isBot') === 'true' &&
      slug !== 'bots'
    ) {
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
    if (
      lastSyncedSearchRef.current === urlSearch &&
      nextSearch !== urlSearch
    ) {
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
    urlDirection ?? direction ?? triageDefaultSort?.direction;
  const effectiveDirection = activeSort
    ? requestedDirection && activeSort.directions.includes(requestedDirection)
      ? requestedDirection
      : activeSort.defaultDirection
    : undefined;

  const {
    data: followersPage,
    isLoading: isLoadingFollowers,
    error: followersError,
    mutate: mutateFollowers,
  } = useFollowers({
    integrationId: selectedIntegrationId,
    cursor: currentCursor,
    limit,
    sort: effectiveSort,
    direction: effectiveDirection,
    window: requiresWindow ? window : undefined,
    search: trimmedSearch || undefined,
    triage: urlListId ? undefined : triage,
    audience: urlListId ? undefined : audience,
    listId: urlListId,
    isBot: urlIsBot || undefined,
  });

  const { data: followerLists = [] } = useFollowerLists(selectedIntegrationId);
  const {
    createList,
    addMember,
    importMemberFromUrl,
    removeMember,
    ignoreTriage,
    ignoreFollower,
    unignoreFollower,
  } = useFollowerListMutations(selectedIntegrationId);

  const activeCategory = !urlListId ? triage || audience : undefined;
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
      followerPath.type === 'follower'
        ? deepLinkDetail?.follower
        : undefined;
    const categoryLabel =
      TRIAGE_FILTER_OPTIONS.find(
        (option) => option.value === activeCategory || option.audience === activeCategory
      )?.defaultLabel ||
      (activeCategory === 'ignored' ? 'Ignored' : undefined);
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
      sort: activeSort && effectiveDirection
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
      const modalId = `follower-detail-${integrationId}-${username || externalId}`;
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
        children: (
          <FollowerDetailModal
            integrationId={integrationId}
            externalId={externalId}
            username={username}
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
            {t('followers_search_empty_title', 'No followers match this search')}
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
            {t(
              'followers_list_empty_title',
              'No followers in this list'
            )}
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

    if (audience === 'ignored') {
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

    if (audience === 'lead') {
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

    if (audience === 'cultivate') {
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

    if (triage) {
      const activeFilter = TRIAGE_FILTER_OPTIONS.find(
        (option) => option.value === triage
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
                  : triage,
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
    <>
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
              const channel = channels.find((item) => item.id === integration.id);
              if (channel) {
                handleChannelSelect(channel);
              }
            }}
          />
        )}
      </ChannelsSidebar>

      <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[16px] min-w-0">
        <div className="flex flex-col gap-[12px] md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-[20px] font-[600] text-newTextColor truncate">
              {selectedChannel?.name}
            </h2>
            {selectedChannel?.display && (
              <p className="text-[14px] text-textItemBlur truncate">
                {selectedChannel.display}
              </p>
            )}
            {Number.isFinite(followersPage?.total) && (
              <p className="text-[13px] text-textItemBlur">
                {t('followers_total', '{{count}} total', {
                  count: followersPage!.total!,
                })}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-[12px]">
            <div className="min-w-[220px] flex-1">
              <Input
                label={t('followers_search', 'Search')}
                name="followers-search"
                disableForm={true}
                removeError={true}
                value={search}
                placeholder={t(
                  'followers_search_placeholder',
                  'Search by username or name'
                )}
                onChange={(event) => {
                  lastSyncedSearchRef.current = event.target.value.trim();
                  setSearch(event.target.value);
                }}
              />
            </div>
            {showSortSelector && (
              <div className="min-w-[160px]">
                <Select
                  label={t('followers_sort_by', 'Sort by')}
                  name="followers-sort"
                  disableForm={true}
                  hideErrors={true}
                  value={effectiveSort ?? ''}
                  onChange={(event) => handleSortChange(event.target.value)}
                >
                  {selectedChannel?.sorts.map((sortOption) => (
                    <option key={sortOption.key} value={sortOption.key}>
                      {sortOption.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {requiresWindow && (
              <div className="min-w-[140px]">
                <Select
                  label={t('followers_time_window', 'Time window')}
                  name="followers-window"
                  disableForm={true}
                  hideErrors={true}
                  value={window}
                  onChange={(event) =>
                    handleWindowChange(
                      event.target.value as ChannelInteractionWindow
                    )
                  }
                >
                  {FOLLOWER_INTERACTION_WINDOWS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey, option.defaultLabel)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {showDirectionSelector && (
              <div className="min-w-[140px]">
                <Select
                  label={t('followers_direction', 'Direction')}
                  name="followers-direction"
                  disableForm={true}
                  hideErrors={true}
                  value={effectiveDirection ?? 'desc'}
                  onChange={(event) =>
                    handleDirectionChange(
                      event.target.value as FollowerSortDirection
                    )
                  }
                >
                  {activeSort?.directions.map((sortDirection) => (
                    <option key={sortDirection} value={sortDirection}>
                      {sortDirection === 'asc'
                        ? t('followers_direction_asc', 'Ascending')
                        : t('followers_direction_desc', 'Descending')}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="min-w-[120px]">
              <Select
                label={t('followers_page_size', 'Per page')}
                name="followers-limit"
                disableForm={true}
                hideErrors={true}
                value={String(limit)}
                onChange={(event) => handleLimitChange(Number(event.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {isPageScopedSort && (
          <p className="text-[13px] text-textItemBlur">
            {t(
              'followers_page_sort_hint',
              'Sorting applies to the current page only. Use Recent for the channel’s native order across pages.'
            )}
          </p>
        )}

        <div
          className="flex flex-wrap gap-[8px]"
          role="group"
          aria-label={t('followers_triage_filter_group', 'Triage filter')}
        >
          {TRIAGE_FILTER_OPTIONS.map((option) => {
            const isSelected = urlListId || urlIsBot
              ? false
              : option.audience
                ? audience === option.audience
                : !audience && triage === option.value;
            return (
              <Link
                key={option.key}
                href={buildFollowersPageHref({
                  slug: option.slug,
                  search: trimmedSearch || undefined,
                  sort: querySort,
                  direction: querySort ? queryDirection : undefined,
                })}
                scroll={false}
                className={clsx(
                  'rounded-[8px] border px-[10px] py-[6px] text-[13px] transition-colors',
                  isSelected
                    ? 'border-newTableText bg-newTableHeader text-newTextColor'
                    : 'border-newBorder bg-newBgColorInner text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor'
                )}
                aria-pressed={isSelected}
                aria-current={isSelected ? 'page' : undefined}
              >
                {t(option.key, option.defaultLabel)}
              </Link>
            );
          })}
          <Link
            href={buildFollowersPageHref({
              slug: urlIsBot ? undefined : 'bots',
              search: trimmedSearch || undefined,
              sort: querySort,
              direction: querySort ? queryDirection : undefined,
            })}
            scroll={false}
            className={clsx(
              'rounded-[8px] border px-[10px] py-[6px] text-[13px] transition-colors',
              urlIsBot
                ? 'border-newTableText bg-newTableHeader text-newTextColor'
                : 'border-newBorder bg-newBgColorInner text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor'
            )}
            aria-pressed={urlIsBot}
            aria-current={urlIsBot ? 'page' : undefined}
          >
            {t('followers_bot_filter', 'Bots')}
          </Link>
          <Link
            href={buildFollowersPageHref({
              slug: 'ignored',
              search: trimmedSearch || undefined,
              sort: querySort,
              direction: querySort ? queryDirection : undefined,
            })}
            scroll={false}
            className={clsx(
              'rounded-[8px] border border-dashed px-[10px] py-[6px] text-[13px] transition-colors',
              !urlListId && audience === 'ignored'
                ? 'border-newTableText bg-newTableHeader text-newTextColor'
                : 'border-newBorder bg-newBgColorInner text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor'
            )}
            aria-pressed={!urlListId && audience === 'ignored'}
            aria-current={!urlListId && audience === 'ignored' ? 'page' : undefined}
          >
            {t('followers_ignored_list', 'Ignored')}
          </Link>
          {followerLists.map((list) => {
            const isSelected = urlListId === list.id;
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
                  'rounded-[8px] border px-[10px] py-[6px] text-[13px] transition-colors',
                  isSelected
                    ? 'border-newTableText bg-newTableHeader text-newTextColor'
                    : 'border-newBorder bg-newBgColorInner text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor'
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
            className="inline-flex items-center justify-center rounded-[8px] border border-newBorder bg-newBgColorInner px-[10px] py-[6px] text-[13px] text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor"
            aria-label={t('followers_create_list', 'Create list')}
          >
            <PlusIcon size={14} />
          </button>
        </div>

        {urlListId && (
          <div>
            <button
              type="button"
              onClick={openAddToListModal}
              className="inline-flex items-center gap-[6px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[10px] py-[6px] text-[13px] text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor"
            >
              <PlusIcon size={14} />
              {t('followers_list_add_button', 'Add')}
            </button>
          </div>
        )}

        {isInteractionsSort && (
          <TrackingNotice tracking={tracking} showFreshness={isTrackingReady} />
        )}

        {followersError && (
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

        {!followersError && isLoadingFollowers && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[16px]">
            {Array.from({ length: limit > 12 ? 6 : 3 }).map((_, index) => (
              <FollowerCardSkeleton key={index} />
            ))}
          </div>
        )}

        {!followersError && !isLoadingFollowers && !followersPage?.items.length && (
          renderEmptyState()
        )}

        {!followersError && !isLoadingFollowers && !!followersPage?.items.length && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[16px]">
              {followersPage.items.map((follower) => (
                <FollowerCard
                  key={follower.id}
                  follower={
                    audience === 'ignored'
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
                  onToggleList={async (list, assigned) => {
                    if (assigned) {
                      await removeMember(list.id, follower.id);
                      return;
                    }
                    await addMember(list.id, follower.id);
                    if (audience === 'lead') {
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
                      if (audience !== 'ignored') {
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
                    if (audience === 'ignored') {
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
                  onDismissTriage={async (triageValue, reasons) => {
                    await ignoreTriage(follower.id, triageValue, reasons);
                    const shouldRemoveFromPage =
                      triage === triageValue ||
                      (audience === 'lead' && triageValue === 'lead') ||
                      (audience === 'cultivate' && triageValue === 'cultivate');
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
    </>
  );
};

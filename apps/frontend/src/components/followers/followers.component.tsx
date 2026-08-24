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
import { FollowerTriageTip } from '@gitroom/frontend/components/followers/follower.triage.tip';
import { useCopilotFollowerPageProperties } from '@gitroom/frontend/components/followers/use.copilot.follower.page';
import {
  useDecisionModal,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
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
  FollowerStrategyMetadata,
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

type FollowerFilterColor = 'neutral' | 'orange' | 'teal' | 'amber' | 'indigo';

type FollowerFilterOption = {
  slug?: string;
  value?: FollowerTriageFilter;
  audience?: 'lead' | 'cultivate' | 'ignored';
  isBot?: true;
  key: string;
  defaultLabel: string;
};

type FollowerFilterGroup = {
  id: string;
  color: FollowerFilterColor;
  labelKey: string;
  defaultLabel: string;
  items: FollowerFilterOption[];
};

const FOLLOWER_FILTER_GROUPS: FollowerFilterGroup[] = [
  {
    id: 'all',
    color: 'neutral',
    labelKey: 'followers_filter_group_all',
    defaultLabel: 'All',
    items: [{ key: 'followers_triage_filter_all', defaultLabel: 'All' }],
  },
  {
    id: 'opportunities',
    color: 'orange',
    labelKey: 'followers_filter_group_opportunities',
    defaultLabel: 'Opportunities',
    items: [
      {
        slug: 'leads',
        audience: 'lead',
        key: 'followers_audience_leads',
        defaultLabel: 'Leads',
      },
      {
        slug: 'hot',
        value: 'hot_lead',
        key: 'followers_triage_hot_lead',
        defaultLabel: 'Hot',
      },
      {
        slug: 'engaged',
        value: 'engaged_not_yet',
        key: 'followers_triage_filter_engaged_not_yet',
        defaultLabel: 'Engaged',
      },
    ],
  },
  {
    id: 'relationships',
    color: 'teal',
    labelKey: 'followers_filter_group_relationships',
    defaultLabel: 'Relationships',
    items: [
      {
        slug: 'cultivate',
        audience: 'cultivate',
        key: 'followers_audience_cultivate',
        defaultLabel: 'Cultivate',
      },
      {
        slug: 'mutual',
        value: 'mutual',
        key: 'followers_triage_mutual',
        defaultLabel: 'Mutual',
      },
      {
        slug: 'quiet',
        value: 'quiet',
        key: 'followers_triage_quiet',
        defaultLabel: 'Quiet',
      },
    ],
  },
  {
    id: 'exclusions',
    color: 'amber',
    labelKey: 'followers_filter_group_exclusions',
    defaultLabel: 'Exclusions',
    items: [
      {
        slug: 'costly',
        value: 'over_invested',
        key: 'followers_triage_over_invested',
        defaultLabel: 'Costly',
      },
      {
        slug: 'bots',
        isBot: true,
        key: 'followers_bot_filter',
        defaultLabel: 'Bots',
      },
      {
        slug: 'ignored',
        audience: 'ignored',
        key: 'followers_ignored_list',
        defaultLabel: 'Ignored',
      },
    ],
  },
];

const TRIAGE_FILTER_OPTIONS: FollowerFilterOption[] =
  FOLLOWER_FILTER_GROUPS.flatMap((group) => group.items);

const FILTER_CHIP_BASE =
  'rounded-[8px] border px-[10px] py-[6px] text-[13px] transition-colors bg-newBgColorInner';

const getFilterChipClasses = (
  color: FollowerFilterColor,
  isSelected: boolean
) => {
  if (color === 'neutral') {
    return isSelected
      ? 'border-newTableText bg-newTableHeader text-newTextColor'
      : 'border-newBorder text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor';
  }
  if (color === 'orange') {
    return isSelected
      ? 'border-orange-600 bg-orange-600/10 text-orange-400'
      : 'border-orange-600/50 text-textItemBlur hover:border-orange-600/70 hover:text-orange-400';
  }
  if (color === 'teal') {
    return isSelected
      ? 'border-teal-500 bg-teal-500/10 text-teal-400'
      : 'border-teal-500/40 text-textItemBlur hover:border-teal-500/60 hover:text-teal-400';
  }
  if (color === 'amber') {
    return isSelected
      ? 'border-amber-400 bg-amber-400/10 text-amber-300'
      : 'border-amber-400/50 text-textItemBlur hover:border-amber-400/70 hover:text-amber-300';
  }
  return isSelected
    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
    : 'border-indigo-500/40 text-textItemBlur hover:border-indigo-500/60 hover:text-indigo-400';
};

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

  const slug = FOLLOWER_VIEW_BY_SLUG[strategy.ui.defaultFilter]
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
  const decision = useDecisionModal();
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

  const triageDefaultSort =
    !urlSort && !sort && resolvedTriage
      ? TRIAGE_DEFAULT_SORTS[resolvedTriage]
      : undefined;
  const requestedSort =
    urlSort ?? sort ?? strategyDefaults?.sort ?? triageDefaultSort?.key;
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
  }, [
    followerPath,
    listHref,
    router,
    selectedIntegrationId,
    strategyDefaults,
  ]);

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
    urlDirection ??
    direction ??
    strategyDefaults?.direction ??
    triageDefaultSort?.direction;
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
    triage: urlListId ? undefined : resolvedTriage,
    audience: urlListId ? undefined : resolvedAudience,
    listId: urlListId,
    isBot: urlIsBot || undefined,
  });

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
    addMember,
    importMemberFromUrl,
    removeMember,
    ignoreTriage,
    ignoreFollower,
    unignoreFollower,
  } = useFollowerListMutations(selectedIntegrationId);

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

  const orderedFollowerFilterGroups = useMemo(() => {
    const priority = selectedChannel?.strategy?.ui.filterPriority || [];
    const rank = (slug?: string) => {
      const index = slug ? priority.indexOf(slug) : priority.indexOf('all');
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return FOLLOWER_FILTER_GROUPS.map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) => rank(left.slug) - rank(right.slug)),
    })).sort(
      (left, right) =>
        Math.min(...left.items.map((item) => rank(item.slug))) -
        Math.min(...right.items.map((item) => rank(item.slug)))
    );
  }, [selectedChannel?.strategy?.ui.filterPriority]);

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
        <div className="flex flex-col gap-[12px]">
          {selectedChannel?.strategy && (
            <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[4px] text-[13px]">
              <span className="font-medium text-newTextColor">
                {t(
                  selectedChannel.strategy.summary.key,
                  selectedChannel.strategy.summary.defaultValue
                )}
              </span>
              {Number.isFinite(followersPage?.total) && (
                <span className="text-textItemBlur">
                  {t('followers_total', '{{count}} total', {
                    count: followersPage!.total!,
                  })}
                </span>
              )}
            </div>
          )}
          {!selectedChannel?.strategy && Number.isFinite(followersPage?.total) && (
            <p className="text-[13px] text-textItemBlur">
              {t('followers_total', '{{count}} total', {
                count: followersPage!.total!,
              })}
            </p>
          )}

          <div className="flex flex-wrap items-end justify-start gap-[12px]">
            <div className="w-[220px] max-w-full">
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
              <div className="w-[160px] max-w-full">
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
              <div className="w-[140px] max-w-full">
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
              <div className="w-[140px] max-w-full">
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
            <div className="w-[120px] max-w-full">
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
          className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px]"
          role="group"
          aria-label={t('followers_triage_filter_group', 'Triage filter')}
          data-testid="followers-filter-bar"
        >
          {orderedFollowerFilterGroups.map((group) => (
            <div
              key={group.id}
              className="flex flex-wrap gap-[8px]"
              role="group"
              aria-label={t(group.labelKey, group.defaultLabel)}
              data-filter-group={group.id}
            >
              {group.items.map((option) => {
                const isSelected = option.isBot
                  ? urlIsBot
                  : urlListId || urlIsBot
                    ? false
                    : option.audience
                      ? resolvedAudience === option.audience
                      : !resolvedAudience && resolvedTriage === option.value;
                const hrefSlug = option.isBot
                  ? urlIsBot
                    ? undefined
                    : 'bots'
                  : option.slug;
                return (
                  <Link
                    key={option.key}
                    href={buildFollowersPageHref({
                      slug: hrefSlug,
                      search: trimmedSearch || undefined,
                      sort: querySort,
                      direction: querySort ? queryDirection : undefined,
                    })}
                    scroll={false}
                    className={clsx(
                      FILTER_CHIP_BASE,
                      getFilterChipClasses(group.color, isSelected),
                      selectedChannel?.strategy?.ui.filterEmphasis ===
                        (option.slug || 'all') &&
                        !isSelected &&
                        'ring-1 ring-current'
                    )}
                    aria-pressed={isSelected}
                    aria-current={isSelected ? 'page' : undefined}
                  >
                    {t(option.key, option.defaultLabel)}
                  </Link>
                );
              })}
            </div>
          ))}
          <div
            className="flex flex-wrap gap-[8px]"
            role="group"
            aria-label={t('followers_filter_group_lists', 'Custom lists')}
            data-filter-group="lists"
          >
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
                    FILTER_CHIP_BASE,
                    getFilterChipClasses('indigo', isSelected)
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
                getFilterChipClasses('indigo', false)
              )}
              aria-label={t('followers_create_list', 'Create list')}
            >
              <PlusIcon size={14} />
            </button>
          </div>
        </div>

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
              {t('followers_list_remove_button', 'Remove')}
            </button>
          </div>
        )}

        {isInteractionsSort && (
          <TrackingNotice tracking={tracking} showFreshness={isTrackingReady} />
        )}
        {selectedChannel?.recomputing && (
          <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-[14px] py-[10px] text-[13px] text-amber-400">
            {t(
              'followers_strategy_recomputing',
              'Relationship grades are being recomputed for this strategy. Existing grades remain visible until the update finishes.'
            )}
          </div>
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
                    await ignoreTriage(follower.id, triageValue, reasons, options);
                    const shouldRemoveFromPage =
                      resolvedTriage === triageValue ||
                      (resolvedAudience === 'lead' && triageValue === 'lead') ||
                      (resolvedAudience === 'cultivate' && triageValue === 'cultivate');
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

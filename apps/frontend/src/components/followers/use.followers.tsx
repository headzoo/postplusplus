'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { normalizeFollowerSearch } from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';

export type FollowerSortDirection = 'asc' | 'desc';

export type FollowerSortScope = 'native' | 'page' | 'database';

export type ChannelInteractionWindow = 'week' | 'month' | '90_day' | 'year';

export type ChannelInteractionTrackingState =
  | 'unconfigured'
  | 'provisioning'
  | 'active'
  | 'partial'
  | 'error'
  | 'unsupported';

export type ChannelInteractionCoverageLevel =
  | 'supported'
  | 'partial'
  | 'unsupported';

export type ChannelInteractionTrackingFailureCategory =
  | 'configuration'
  | 'authentication'
  | 'authorization'
  | 'entitlement'
  | 'quota'
  | 'transient'
  | 'unknown';

export type ChannelInteractionKind =
  | 'like'
  | 'reply'
  | 'repost'
  | 'follow'
  | 'mention';

export type RelationshipTriage =
  | 'quiet'
  | 'hot_lead'
  | 'over_invested'
  | 'mutual';

export type DismissibleTriage =
  | RelationshipTriage
  | 'lead'
  | 'engaged_not_yet'
  | 'cultivate';

export const PROFILE_LINK_AUTO_SNOOZE_TRIAGES = [
  'hot_lead',
  'cultivate',
] as const satisfies readonly DismissibleTriage[];

export type ProfileLinkAutoSnoozeTriage =
  (typeof PROFILE_LINK_AUTO_SNOOZE_TRIAGES)[number];

export type FollowerTriageFilter =
  | 'engaged_not_yet'
  | 'hot_lead'
  | 'mutual'
  | 'over_invested'
  | 'quiet';

export type ChannelInteractionKindCoverage = {
  kind: ChannelInteractionKind;
  inbound: ChannelInteractionCoverageLevel;
  outbound: ChannelInteractionCoverageLevel;
  reason?: string;
};

export type FollowerPageTracking = {
  state: ChannelInteractionTrackingState;
  availability?: 'ready' | 'provisioning' | 'unavailable';
  noBackfill: true;
  trackingStartedAt?: string;
  followerSnapshotAt?: string;
  computedAt?: string;
  failureCategory?: ChannelInteractionTrackingFailureCategory;
  reason?: string;
  failedSubscriptions?: {
    eventKey: string;
    direction: string;
    reason?: string;
  }[];
  coverage?: ChannelInteractionKindCoverage[];
};

export type FollowerSort = {
  key: string;
  label: string;
  directions: FollowerSortDirection[];
  defaultDirection: FollowerSortDirection;
  scope?: FollowerSortScope;
  requiresWindow?: boolean;
};

export type FollowerStrategyMetadata = {
  id: string;
  version: number;
  summary: {
    key: string;
    defaultValue: string;
  };
  ui: {
    defaultFilter: string;
    defaultSort: string;
    filterPriority: string[];
    filterEmphasis: string;
    compactMetrics: Array<{
      key: string;
      label: { key: string; defaultValue: string };
    }>;
    emptyState: { key: string; defaultValue: string };
    assistantInitialCopy: { key: string; defaultValue: string };
    suggestedQuestions: Array<{ key: string; defaultValue: string }>;
  };
};

export type FollowerChannel = {
  id: string;
  name: string;
  picture?: string;
  display?: string;
  identifier: string;
  sorts: FollowerSort[];
  strategy?: FollowerStrategyMetadata;
  recomputing?: boolean;
  tracking?: FollowerPageTracking;
};

export type Follower = {
  id: string;
  name: string;
  username?: string;
  picture?: string;
  profileUrl?: string;
  bio?: string;
  followersCount?: number;
  followingCount?: number;
  influenceScore?: number;
  followedAt?: string;
  accountCreatedAt?: string;
  interactionCount?: number;
  interactionScore?: number;
  lastInteractionAt?: string;
  noteCount?: number;
  likesCount?: number;
  relationshipGrade?: number | null;
  effortScore?: number | null;
  reciprocationScore?: number | null;
  netGap?: number | null;
  effortStars?: number | null;
  reciprocationStars?: number | null;
  relationshipTriage?: RelationshipTriage | null;
  relationshipFormulaVersion?: number | null;
  relationshipSnapshotAt?: string | null;
  myGrade?: number | null;
  adjustedGrade?: number | null;
  botGrade?: number | null;
  isBot?: boolean | null;
  botConfidence?: number | null;
  botFormulaVersion?: number | null;
  botGradedAt?: string | null;
  listIds?: string[];
  isLead?: boolean;
  engagedNotYet?: boolean;
  isIgnored?: boolean;
  leadBridgeScore?: number | null;
  leadFitScore?: number | null;
  leadFitReason?: string | null;
  leadBridges?: Array<{
    externalId: string;
    username?: string;
    grade?: number;
  }>;
  isCultivate?: boolean;
  cultivateReason?: string;
  isHot?: boolean;
  triageReason?: string;
  triageSource?: string;
  suggestedAction?: string;
};

export type FollowerList = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ChannelInteractionDirection = 'inbound' | 'outbound';

export type FollowerMemberNoteAuthor = {
  id: string;
  name: string;
};

export type FollowerMemberNote = {
  id: string;
  content: string;
  author: FollowerMemberNoteAuthor;
  createdAt: string;
  updatedAt: string;
};

export type FollowerMemberInteraction = {
  id: string;
  kind: ChannelInteractionKind;
  direction: ChannelInteractionDirection;
  timestamp: string;
  relatedObjectId?: string;
};

export type FollowerRelationshipSnapshot = {
  snapshotAt: string;
  windowStartedAt: string;
  effortScore: number;
  reciprocationScore: number;
  reciprocity: number | null;
  grade: number | null;
  adjustedGrade: number | null;
  effortStars: number;
  reciprocationStars: number;
  triage: RelationshipTriage | null;
  formulaVersion: number;
};

export type FollowerRelationship = {
  windowDays: 30;
  cadenceDays: 3;
  formulaVersion: number;
  current: FollowerRelationshipSnapshot | null;
  history: FollowerRelationshipSnapshot[];
};

export type FollowerMemberDetail = {
  follower: Follower;
  notes: FollowerMemberNote[];
  interactions: FollowerMemberInteraction[];
  relationship: FollowerRelationship;
  myGrade: number | null;
  tracking?: FollowerPageTracking;
};

export type FollowerPage = {
  items: Follower[];
  total?: number;
  nextCursor?: string;
  previousCursor?: string;
  hasMore: boolean;
  window?: ChannelInteractionWindow;
  tracking?: FollowerPageTracking;
};

export type MemberPostMedia = {
  url: string;
  type?: 'image' | 'video';
};

export type MemberPost = {
  externalId: string;
  url: string;
  content: string;
  publishedAt: string;
  media?: MemberPostMedia[];
};

export type MemberPostsPage = {
  items: MemberPost[];
  nextCursor?: string;
  hasMore: boolean;
};

export const FOLLOWER_INTERACTION_WINDOWS: {
  value: ChannelInteractionWindow;
  labelKey: string;
  defaultLabel: string;
}[] = [
    { value: 'week', labelKey: 'followers_window_week', defaultLabel: 'Week' },
    { value: 'month', labelKey: 'followers_window_month', defaultLabel: 'Month' },
    {
      value: '90_day',
      labelKey: 'followers_window_90_day',
      defaultLabel: '90 Day',
    },
    { value: 'year', labelKey: 'followers_window_year', defaultLabel: 'Year' },
  ];

export const DEFAULT_FOLLOWER_INTERACTION_WINDOW: ChannelInteractionWindow =
  'month';

export const useFollowerChannels = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    const response = await fetch('/followers/channels');
    if (!response.ok) {
      throw new Error('Failed to load follower channels');
    }
    return (await response.json()) as FollowerChannel[];
  }, [fetch]);

  return useSWR<FollowerChannel[]>('/followers/channels', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });
};

export type UseFollowersParams = {
  integrationId?: string;
  cursor?: string;
  limit: number;
  sort?: string;
  direction?: FollowerSortDirection;
  window?: ChannelInteractionWindow;
  search?: string;
  triage?: FollowerTriageFilter;
  audience?: 'lead' | 'ignored' | 'cultivate' | 'hot';
  listId?: string;
  isBot?: boolean;
};

export const buildFollowersUrl = ({
  integrationId,
  cursor,
  limit,
  sort,
  direction,
  window,
  search,
  triage,
  audience,
  listId,
  isBot,
}: UseFollowersParams & { integrationId: string }) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    params.set('cursor', cursor);
  }
  if (sort) {
    params.set('sort', sort);
    if (direction) {
      params.set('direction', direction);
    }
  }
  if (window) {
    params.set('window', window);
  }
  if (search) {
    params.set('search', search);
  }
  if (triage) {
    params.set('triage', triage);
  }
  if (audience) {
    params.set('audience', audience);
  }
  if (listId) {
    params.set('listId', listId);
  }
  if (isBot !== undefined) {
    params.set('isBot', String(isBot));
  }
  return `/followers/${integrationId}?${params.toString()}`;
};

export const buildFollowerDetailHref = (
  integrationId: string,
  username: string
) => {
  const normalized = normalizeFollowerSearch(username);
  if (!normalized) {
    return '/followers';
  }
  return `/followers/${encodeURIComponent(integrationId)}/@${encodeURIComponent(
    normalized
  )}`;
};

export const buildFollowerTimelineHref = (
  integrationId: string,
  username: string,
  externalId?: string
) => {
  const normalized = normalizeFollowerSearch(username);
  if (!normalized) {
    return '/followers';
  }
  const path = `/followers/${encodeURIComponent(integrationId)}/@${encodeURIComponent(
    normalized
  )}/timeline`;
  if (!externalId) {
    return path;
  }
  const params = new URLSearchParams({ externalId });
  return `${path}?${params.toString()}`;
};

export const buildFollowerMemberTimelineUrl = ({
  integrationId,
  externalId,
  username,
  cursor,
  limit,
}: {
  integrationId: string;
  externalId?: string;
  username?: string;
  cursor?: string;
  limit?: number;
}) => {
  const params = new URLSearchParams();
  if (externalId) {
    params.set('externalId', externalId);
  } else if (username) {
    params.set('username', username);
  }
  if (cursor) {
    params.set('cursor', cursor);
  }
  if (limit) {
    params.set('limit', String(limit));
  }
  return `/followers/${integrationId}/member/timeline?${params.toString()}`;
};

export const useFollowers = ({
  integrationId,
  cursor,
  limit,
  sort,
  direction,
  window,
  search,
  triage,
  audience,
  listId,
  isBot,
}: UseFollowersParams) => {
  const fetch = useFetch();

  const url = useMemo(() => {
    if (!integrationId) {
      return null;
    }
    return buildFollowersUrl({
      integrationId,
      cursor,
      limit,
      sort,
      direction,
      window,
      search,
      triage,
      audience,
      listId,
      isBot,
    });
  }, [
    audience,
    cursor,
    direction,
    integrationId,
    isBot,
    limit,
    listId,
    search,
    sort,
    triage,
    window,
  ]);

  const load = useCallback(
    async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error('Failed to load followers');
      }
      return (await response.json()) as FollowerPage;
    },
    [fetch]
  );

  return useSWR<FollowerPage>(url, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

export const buildFollowerDetailUrl = (
  integrationId: string,
  identity: { externalId?: string; username?: string }
) => {
  const params = new URLSearchParams();
  if (identity.externalId) {
    params.set('externalId', identity.externalId);
  } else if (identity.username) {
    params.set('username', identity.username);
  } else {
    return null;
  }
  return `/followers/${integrationId}/member?${params.toString()}`;
};

export const useFollowerDetail = (
  integrationId?: string,
  identity?: { externalId?: string; username?: string }
) => {
  const fetch = useFetch();

  const url = useMemo(() => {
    if (!integrationId || (!identity?.externalId && !identity?.username)) {
      return null;
    }
    return buildFollowerDetailUrl(integrationId, identity);
  }, [integrationId, identity?.externalId, identity?.username]);

  const load = useCallback(
    async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error('Failed to load follower details');
      }
      return (await response.json()) as FollowerMemberDetail;
    },
    [fetch]
  );

  return useSWR<FollowerMemberDetail>(url, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

export const useFollowerMemberTimeline = ({
  integrationId,
  externalId,
  username,
  cursor,
  limit = 20,
}: {
  integrationId?: string;
  externalId?: string;
  username?: string;
  cursor?: string;
  limit?: number;
}) => {
  const fetch = useFetch();

  const url = useMemo(() => {
    if (!integrationId || (!externalId && !username)) {
      return null;
    }
    return buildFollowerMemberTimelineUrl({
      integrationId,
      externalId,
      username,
      cursor,
      limit,
    });
  }, [integrationId, externalId, username, cursor, limit]);

  const load = useCallback(
    async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error('Failed to load member timeline');
      }
      return (await response.json()) as MemberPostsPage;
    },
    [fetch]
  );

  return useSWR<MemberPostsPage>(url, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

export const useFollowerNoteMutations = (
  integrationId: string,
  externalId: string,
  revalidateDetail: () => Promise<FollowerMemberDetail | undefined>
) => {
  const fetch = useFetch();

  const createNote = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) {
        throw new Error('Note content is required');
      }
      const response = await fetch(
        `/followers/${integrationId}/member/notes`,
        {
          method: 'POST',
          body: JSON.stringify({ externalId, content: trimmed }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to create note');
      }
      await revalidateDetail();
      return (await response.json()) as FollowerMemberNote;
    },
    [externalId, fetch, integrationId, revalidateDetail]
  );

  const updateNote = useCallback(
    async (noteId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) {
        throw new Error('Note content is required');
      }
      const response = await fetch(
        `/followers/${integrationId}/member/notes/${noteId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ content: trimmed }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to update note');
      }
      await revalidateDetail();
    },
    [fetch, integrationId, revalidateDetail]
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      const response = await fetch(
        `/followers/${integrationId}/member/notes/${noteId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        throw new Error('Failed to delete note');
      }
      await revalidateDetail();
    },
    [fetch, integrationId, revalidateDetail]
  );

  return { createNote, updateNote, deleteNote };
};

export type FollowerMyGradeUpdate = {
  myGrade: number | null;
  adjustedGrade: number | null;
};

export const applyMyGradeToFollowerPage = (
  page: FollowerPage | undefined,
  externalId: string,
  update: FollowerMyGradeUpdate
): FollowerPage | undefined => {
  if (!page) {
    return page;
  }
  return {
    ...page,
    items: page.items.map((item) =>
      item.id !== externalId
        ? item
        : {
          ...item,
          myGrade: update.myGrade,
          adjustedGrade: update.adjustedGrade,
        }
    ),
  };
};

export const applyMyGradeToFollowerDetail = (
  detail: FollowerMemberDetail | undefined,
  update: FollowerMyGradeUpdate
): FollowerMemberDetail | undefined => {
  if (!detail) {
    return detail;
  }
  const current = detail.relationship.current;
  return {
    ...detail,
    myGrade: update.myGrade,
    follower: {
      ...detail.follower,
      myGrade: update.myGrade,
      adjustedGrade: update.adjustedGrade,
    },
    relationship: {
      ...detail.relationship,
      current: current
        ? {
          ...current,
          adjustedGrade: update.adjustedGrade,
        }
        : current,
    },
  };
};

export const useFollowerGradeMutation = (
  integrationId: string,
  externalId: string,
  revalidateDetail: () => Promise<FollowerMemberDetail | undefined>
) => {
  const fetch = useFetch();
  const { mutate: mutateCache } = useSWRConfig();

  const updateGrade = useCallback(
    async (grade: number) => {
      const response = await fetch(
        `/followers/${integrationId}/member/my-grade`,
        {
          method: 'PUT',
          body: JSON.stringify({ externalId, grade }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to update personal grade');
      }
      const update = (await response.json()) as FollowerMyGradeUpdate;
      const detailKey = buildFollowerDetailUrl(integrationId, { externalId });
      await Promise.all([
        detailKey
          ? mutateCache(
            detailKey,
            (detail: FollowerMemberDetail | undefined) =>
              applyMyGradeToFollowerDetail(detail, update),
            { revalidate: false }
          )
          : Promise.resolve(),
        mutateCache(
          (key) => isFollowerListCacheKey(integrationId, key),
          (page: FollowerPage | undefined) =>
            applyMyGradeToFollowerPage(page, externalId, update),
          { revalidate: true }
        ),
      ]);
      await revalidateDetail();
    },
    [externalId, fetch, integrationId, mutateCache, revalidateDetail]
  );

  return { updateGrade };
};

export type RelationshipScoreDirection = 'their' | 'your';

export const isFollowerListCacheKey = (
  integrationId: string,
  key: unknown
) =>
  typeof key === 'string' && key.startsWith(`/followers/${integrationId}?`);

const isRelationshipSnapshot = (
  value: unknown
): value is FollowerRelationshipSnapshot => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const snapshot = value as Partial<FollowerRelationshipSnapshot>;
  return (
    Number.isSafeInteger(snapshot.effortScore) &&
    Number.isSafeInteger(snapshot.reciprocationScore) &&
    Number.isFinite(snapshot.effortStars) &&
    Number.isFinite(snapshot.reciprocationStars)
  );
};

export const applyRelationshipSnapshotToFollowerPage = (
  page: FollowerPage | undefined,
  externalId: string,
  current: unknown
): FollowerPage | undefined => {
  if (!page || !isRelationshipSnapshot(current)) {
    return page;
  }
  return {
    ...page,
    items: page.items.map((item) =>
      item.id !== externalId
        ? item
        : {
          ...item,
          effortScore: current.effortScore,
          reciprocationScore: current.reciprocationScore,
          netGap: current.reciprocationScore - current.effortScore,
          effortStars: current.effortStars,
          reciprocationStars: current.reciprocationStars,
          relationshipGrade: current.grade,
          relationshipTriage: current.triage,
          relationshipFormulaVersion: current.formulaVersion,
          relationshipSnapshotAt: current.snapshotAt,
          adjustedGrade: current.adjustedGrade,
        }
    ),
  };
};

export const applyRelationshipSnapshotToFollowerDetail = (
  detail: FollowerMemberDetail | undefined,
  current: unknown
): FollowerMemberDetail | undefined => {
  if (!detail || !isRelationshipSnapshot(current)) {
    return detail;
  }
  const snapshot = current as FollowerRelationshipSnapshot;
  const historyWithoutDuplicate = detail.relationship.history.filter(
    (entry) => entry.snapshotAt !== snapshot.snapshotAt
  );
  return {
    ...detail,
    follower: {
      ...detail.follower,
      effortScore: snapshot.effortScore,
      reciprocationScore: snapshot.reciprocationScore,
      netGap: snapshot.reciprocationScore - snapshot.effortScore,
      effortStars: snapshot.effortStars,
      reciprocationStars: snapshot.reciprocationStars,
      relationshipGrade: snapshot.grade,
      relationshipTriage: snapshot.triage,
      relationshipFormulaVersion: snapshot.formulaVersion,
      relationshipSnapshotAt: snapshot.snapshotAt,
      adjustedGrade: snapshot.adjustedGrade,
    },
    relationship: {
      ...detail.relationship,
      formulaVersion: snapshot.formulaVersion,
      current: snapshot,
      history: [...historyWithoutDuplicate, snapshot],
    },
  };
};

export const useFollowerRelationshipScoreMutation = (
  integrationId: string,
  externalId: string,
  revalidateDetail: () => Promise<FollowerMemberDetail | undefined>
) => {
  const fetch = useFetch();
  const { mutate: mutateCache } = useSWRConfig();

  const refreshScore = useCallback(
    async (direction: RelationshipScoreDirection) => {
      const response = await fetch(
        `/followers/${integrationId}/member/relationship-score`,
        {
          method: 'POST',
          body: JSON.stringify({ externalId, direction }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to refresh relationship score');
      }
      const current = (await response.json()) as FollowerRelationshipSnapshot;
      const detailKey = buildFollowerDetailUrl(integrationId, { externalId });
      await Promise.all([
        detailKey
          ? mutateCache(
            detailKey,
            (detail: FollowerMemberDetail | undefined) =>
              applyRelationshipSnapshotToFollowerDetail(detail, current),
            { revalidate: false }
          )
          : Promise.resolve(),
        mutateCache(
          (key) => isFollowerListCacheKey(integrationId, key),
          (page: FollowerPage | undefined) =>
            applyRelationshipSnapshotToFollowerPage(page, externalId, current),
          { revalidate: true }
        ),
      ]);
      await revalidateDetail();
    },
    [externalId, fetch, integrationId, mutateCache, revalidateDetail]
  );

  return { refreshScore };
};

export const followerListsKey = (integrationId: string) =>
  `/followers/${integrationId}/lists`;

export const isFollowerChannelCacheKey = (
  integrationId: string,
  key: unknown
) =>
  typeof key === 'string' &&
  (isFollowerListCacheKey(integrationId, key) ||
    key.startsWith(`/followers/${integrationId}/member`) ||
    key === followerListsKey(integrationId));

export const revalidateFollowerChannelCaches = (
  mutateCache: ReturnType<typeof useSWRConfig>['mutate'],
  integrationId: string
) =>
  mutateCache(
    (key) => isFollowerChannelCacheKey(integrationId, key),
    undefined,
    { revalidate: true }
  );

export const useFollowerLists = (integrationId?: string) => {
  const fetch = useFetch();

  const url = useMemo(() => {
    if (!integrationId) {
      return null;
    }
    return followerListsKey(integrationId);
  }, [integrationId]);

  const load = useCallback(
    async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error('Failed to load follower lists');
      }
      return (await response.json()) as FollowerList[];
    },
    [fetch]
  );

  return useSWR<FollowerList[]>(url, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });
};

export const applyListMembershipToFollowerPage = (
  page: FollowerPage | undefined,
  externalId: string,
  listId: string,
  assigned: boolean
): FollowerPage | undefined => {
  if (!page) {
    return page;
  }
  return {
    ...page,
    items: page.items.map((item) => {
      if (item.id !== externalId) {
        return item;
      }
      const current = item.listIds ?? [];
      const listIds = assigned
        ? current.includes(listId)
          ? current
          : [...current, listId]
        : current.filter((id) => id !== listId);
      return { ...item, listIds };
    }),
  };
};

export const applyImportedMemberToFollowerPage = (
  page: FollowerPage | undefined,
  imported: {
    externalId?: string;
    name?: string | null;
    username?: string | null;
    picture?: string | null;
    profileUrl?: string | null;
  },
  listId: string
): FollowerPage | undefined => {
  if (!page || !imported.externalId) {
    return page;
  }
  if (page.items.some((item) => item.id === imported.externalId)) {
    return applyListMembershipToFollowerPage(
      page,
      imported.externalId,
      listId,
      true
    );
  }
  const name = imported.name || imported.username || imported.externalId;
  return {
    ...page,
    items: [
      {
        id: imported.externalId,
        name,
        ...(imported.username ? { username: imported.username } : {}),
        ...(imported.picture ? { picture: imported.picture } : {}),
        ...(imported.profileUrl ? { profileUrl: imported.profileUrl } : {}),
        listIds: [listId],
      },
      ...page.items,
    ],
  };
};

export function getProfileLinkAutoSnoozeTriages(
  follower: Pick<
    Follower,
    'relationshipTriage' | 'isCultivate' | 'isHot'
  >
): ProfileLinkAutoSnoozeTriage[] {
  const triages: ProfileLinkAutoSnoozeTriage[] = [];
  if (follower.isHot || follower.relationshipTriage === 'hot_lead') {
    triages.push('hot_lead');
  }
  if (follower.isCultivate) {
    triages.push('cultivate');
  }
  return triages;
}

export const applyTriageIgnoreToFollowerPage = (
  page: FollowerPage | undefined,
  externalId: string,
  options?: {
    removeFromPage?: boolean;
    triage?: DismissibleTriage;
  }
): FollowerPage | undefined => {
  if (!page) {
    return page;
  }
  const items = options?.removeFromPage
    ? page.items.filter((item) => item.id !== externalId)
    : page.items.map((item) => {
      if (item.id !== externalId) {
        return item;
      }
      if (options?.triage === 'lead') {
        return { ...item, isLead: false };
      }
      if (options?.triage === 'cultivate') {
        return { ...item, isCultivate: false };
      }
      if (options?.triage === 'hot_lead') {
        return { ...item, relationshipTriage: null, isHot: false };
      }
      return { ...item, relationshipTriage: null };
    });
  return {
    ...page,
    items,
  };
};

export const applyIgnoreToFollowerPage = (
  page: FollowerPage | undefined,
  externalId: string,
  options?: { removeFromPage?: boolean; isIgnored?: boolean }
): FollowerPage | undefined => {
  if (!page) {
    return page;
  }
  if (options?.removeFromPage) {
    return {
      ...page,
      items: page.items.filter((item) => item.id !== externalId),
    };
  }
  return {
    ...page,
    items: page.items.map((item) => {
      if (item.id !== externalId) {
        return item;
      }
      return {
        ...item,
        isIgnored: options?.isIgnored ?? true,
      };
    }),
  };
};

export const useFollowerListMutations = (integrationId?: string) => {
  const fetch = useFetch();
  const { mutate: mutateCache } = useSWRConfig();

  const revalidateLists = useCallback(async () => {
    if (!integrationId) {
      return;
    }
    await mutateCache(followerListsKey(integrationId));
  }, [integrationId, mutateCache]);

  const createList = useCallback(
    async (name: string) => {
      if (!integrationId) {
        throw new Error('Channel is required');
      }
      const response = await fetch(`/followers/${integrationId}/lists`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw new Error('Failed to create follower list');
      }
      const list = (await response.json()) as FollowerList;
      await mutateCache(
        followerListsKey(integrationId),
        (current: FollowerList[] | undefined) => {
          const lists = current ?? [];
          if (lists.some((item) => item.id === list.id)) {
            return lists;
          }
          return [...lists, list];
        },
        { revalidate: true }
      );
      return list;
    },
    [fetch, integrationId, mutateCache]
  );

  const deleteList = useCallback(
    async (listId: string) => {
      if (!integrationId) {
        throw new Error('Channel is required');
      }
      const response = await fetch(
        `/followers/${integrationId}/lists/${listId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        throw new Error('Failed to delete follower list');
      }
      await mutateCache(
        followerListsKey(integrationId),
        (current: FollowerList[] | undefined) =>
          (current ?? []).filter((item) => item.id !== listId),
        { revalidate: true }
      );
    },
    [fetch, integrationId, mutateCache]
  );

  const addMember = useCallback(
    async (listId: string, externalId: string) => {
      if (!integrationId) {
        throw new Error('Channel is required');
      }
      const response = await fetch(
        `/followers/${integrationId}/lists/${listId}/members`,
        {
          method: 'POST',
          body: JSON.stringify({ externalId }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to add follower to list');
      }
      await mutateCache(
        (key) => isFollowerListCacheKey(integrationId, key),
        (page: FollowerPage | undefined) =>
          applyListMembershipToFollowerPage(page, externalId, listId, true),
        { revalidate: true }
      );
    },
    [fetch, integrationId, mutateCache]
  );

  const importMemberFromUrl = useCallback(
    async (listId: string, url: string) => {
      if (!integrationId) {
        throw new Error('Channel is required');
      }
      const response = await fetch(
        `/followers/${integrationId}/lists/${listId}/members/import`,
        {
          method: 'POST',
          body: JSON.stringify({ url }),
        }
      );
      if (!response.ok) {
        let message = 'Failed to import profile into list';
        try {
          const body = await response.json();
          if (typeof body?.message === 'string') {
            message = body.message;
          } else if (Array.isArray(body?.message) && body.message[0]) {
            message = String(body.message[0]);
          }
        } catch {
          // keep default message
        }
        throw new Error(message);
      }
      const imported = (await response.json()) as {
        externalId?: string;
        name?: string | null;
        username?: string | null;
        picture?: string | null;
        profileUrl?: string | null;
      };
      await mutateCache(
        (key) => isFollowerListCacheKey(integrationId, key),
        (page: FollowerPage | undefined) =>
          applyImportedMemberToFollowerPage(page, imported, listId),
        { revalidate: true }
      );
      return imported;
    },
    [fetch, integrationId, mutateCache]
  );

  const removeMember = useCallback(
    async (listId: string, externalId: string) => {
      if (!integrationId) {
        throw new Error('Channel is required');
      }
      const response = await fetch(
        `/followers/${integrationId}/lists/${listId}/members`,
        {
          method: 'DELETE',
          body: JSON.stringify({ externalId }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to remove follower from list');
      }
      await mutateCache(
        (key) => isFollowerListCacheKey(integrationId, key),
        (page: FollowerPage | undefined) =>
          applyListMembershipToFollowerPage(page, externalId, listId, false),
        { revalidate: true }
      );
    },
    [fetch, integrationId, mutateCache]
  );

  const ignoreTriage = useCallback(
    async (
      externalId: string,
      triage: DismissibleTriage,
      reasons?: string[],
      options?: { snooze?: boolean }
    ) => {
      if (!integrationId) {
        throw new Error('Channel is required');
      }
      const response = await fetch(
        `/followers/${integrationId}/member/triage-ignore`,
        {
          method: 'POST',
          body: JSON.stringify({
            externalId,
            triage,
            ...(reasons?.length ? { reasons } : {}),
            ...(options?.snooze ? { snooze: true } : {}),
          }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to remove triage badge');
      }
      await mutateCache(
        (key) => isFollowerListCacheKey(integrationId, key),
        (page: FollowerPage | undefined) =>
          applyTriageIgnoreToFollowerPage(page, externalId, { triage }),
        { revalidate: true }
      );
    },
    [fetch, integrationId, mutateCache]
  );

  const ignoreFollower = useCallback(
    async (externalId: string) => {
      if (!integrationId) {
        throw new Error('Channel is required');
      }
      const response = await fetch(
        `/followers/${integrationId}/member/ignore`,
        {
          method: 'POST',
          body: JSON.stringify({ externalId }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to ignore follower');
      }
      await mutateCache(
        (key) => isFollowerListCacheKey(integrationId, key),
        (page: FollowerPage | undefined) =>
          applyIgnoreToFollowerPage(page, externalId, {
            removeFromPage: true,
            isIgnored: true,
          }),
        { revalidate: true }
      );
    },
    [fetch, integrationId, mutateCache]
  );

  const unignoreFollower = useCallback(
    async (externalId: string) => {
      if (!integrationId) {
        throw new Error('Channel is required');
      }
      const response = await fetch(
        `/followers/${integrationId}/member/ignore`,
        {
          method: 'DELETE',
          body: JSON.stringify({ externalId }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to unignore follower');
      }
      await mutateCache(
        (key) => isFollowerListCacheKey(integrationId, key),
        (page: FollowerPage | undefined) =>
          applyIgnoreToFollowerPage(page, externalId, {
            removeFromPage: true,
            isIgnored: false,
          }),
        { revalidate: true }
      );
    },
    [fetch, integrationId, mutateCache]
  );

  return {
    createList,
    deleteList,
    addMember,
    importMemberFromUrl,
    removeMember,
    ignoreTriage,
    ignoreFollower,
    unignoreFollower,
    revalidateLists,
  };
};


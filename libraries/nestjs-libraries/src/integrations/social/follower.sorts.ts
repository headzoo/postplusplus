import {
  Follower,
  FollowerSort,
  FollowerSortDirection,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';

export const FOLLOWER_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type FollowerSortDirectionValue =
  (typeof FOLLOWER_SORT_DIRECTIONS)[number];

export const FOLLOWER_INTERACTION_WINDOWS = [
  'week',
  'month',
  '90_day',
  'year',
] as const;
export type FollowerInteractionWindow =
  (typeof FOLLOWER_INTERACTION_WINDOWS)[number];

export const FOLLOWER_TRIAGE_FILTERS = [
  'hot_lead',
  'mutual',
  'over_invested',
  'quiet',
  'engaged_not_yet',
] as const;
export type FollowerTriageFilterValue =
  (typeof FOLLOWER_TRIAGE_FILTERS)[number];

export const FOLLOWER_AUDIENCES = [
  'lead',
  'followed',
  'ignored',
  'cultivate',
  'hot',
] as const;
export type FollowerAudience = (typeof FOLLOWER_AUDIENCES)[number];

export const FOLLOWER_SEGMENT_COLORS = [
  'blue',
  'green',
  'red',
  'purple',
  'yellow',
  'orange',
  'neutral',
] as const;
export type FollowerSegmentColorValue =
  (typeof FOLLOWER_SEGMENT_COLORS)[number];

export const FOLLOWER_CATEGORY_DESCRIPTIONS = {
  hot: 'Hourly materialized picks for relationships that need reciprocation.',
  hot_lead:
    "Their effort exceeds the channel's, including unreciprocated inbound engagement.",
  over_invested: "The channel's effort exceeds theirs.",
  mutual: 'Balanced activity between both sides.',
  quiet: 'Neither direction has meaningful activity.',
  engaged_not_yet:
    'Legacy alias of Hot: they engaged, but the channel has not reciprocated.',
  lead: 'An interacting non-follower.',
  followed:
    'Someone the channel followed who has not followed back yet.',
  ignored: 'An organization-managed visibility state, not a relationship score.',
  cultivate:
    'A warm relationship that has not received outbound attention recently.',
} as const;

export type FollowerPageKind = 'list' | 'detail' | 'timeline';

export type FollowerPageContext = {
  kind: FollowerPageKind;
  route: string;
  channel: {
    id: string;
    name?: string;
    platform?: string;
    display?: string;
  };
  strategy?: {
    id: string;
    version: number;
    summary?: string;
  };
  follower?: {
    id?: string;
    username?: string;
    name?: string;
  };
  category?: {
    key?: keyof typeof FOLLOWER_CATEGORY_DESCRIPTIONS;
    label?: string;
    meaning?: string;
  };
  search?: string;
  list?: {
    id: string;
    name?: string;
    status: 'current' | 'unknown_or_deleted';
  };
  availableLists?: Array<{
    id: string;
    name?: string;
  }>;
  sort?: {
    key: string;
    label: string;
    scope: 'native' | 'page' | 'database';
    direction: FollowerSortDirection;
    caveat?: string;
  };
  interactionWindow?: FollowerInteractionWindow;
  pagination: {
    size: number;
    number: number;
  };
  tracking?: {
    availability?: 'ready' | 'provisioning' | 'unavailable';
    state?: string;
    computedAt?: string;
    followerSnapshotAt?: string;
  };
};

const shortenFollowerContextText = (value: string | undefined, max = 160) =>
  value?.trim().slice(0, max) || undefined;

/**
 * Produces the bounded, transport-safe follower page envelope used by the UI
 * readable and server-side agent guidance. It deliberately excludes records,
 * cursors, timeline entries, notes, and any authorization material.
 */
export const formatFollowerPageContext = (
  context: FollowerPageContext
): FollowerPageContext => ({
  ...context,
  route: shortenFollowerContextText(context.route, 240) || '/followers',
  channel: {
    id: shortenFollowerContextText(context.channel.id, 160) || '',
    name: shortenFollowerContextText(context.channel.name),
    platform: shortenFollowerContextText(context.channel.platform, 80),
    display: shortenFollowerContextText(context.channel.display),
  },
  strategy: context.strategy
    ? {
      id: shortenFollowerContextText(context.strategy.id, 80) || '',
      version: context.strategy.version,
      summary: shortenFollowerContextText(context.strategy.summary),
    }
    : undefined,
  follower: context.follower
    ? {
      id: shortenFollowerContextText(context.follower.id, 160),
      username: shortenFollowerContextText(context.follower.username),
      name: shortenFollowerContextText(context.follower.name),
    }
    : undefined,
  category: context.category
    ? {
      key: context.category.key,
      label: shortenFollowerContextText(context.category.label, 80),
      meaning: shortenFollowerContextText(context.category.meaning),
    }
    : undefined,
  search: shortenFollowerContextText(context.search),
  list: context.list
    ? {
      id: shortenFollowerContextText(context.list.id, 160) || '',
      name: shortenFollowerContextText(context.list.name),
      status: context.list.status,
    }
    : undefined,
  availableLists: context.availableLists
    ?.slice(0, 20)
    .map((list) => ({
      id: shortenFollowerContextText(list.id, 160) || '',
      name: shortenFollowerContextText(list.name, 80),
    }))
    .filter((list) => list.id),
  sort: context.sort
    ? {
      key: shortenFollowerContextText(context.sort.key, 80) || '',
      label: shortenFollowerContextText(context.sort.label, 80) || '',
      scope: context.sort.scope,
      direction: context.sort.direction,
      caveat: shortenFollowerContextText(context.sort.caveat),
    }
    : undefined,
  tracking: context.tracking
    ? {
      availability: context.tracking.availability,
      state: shortenFollowerContextText(context.tracking.state, 80),
      computedAt: shortenFollowerContextText(context.tracking.computedAt, 80),
      followerSnapshotAt: shortenFollowerContextText(
        context.tracking.followerSnapshotAt,
        80
      ),
    }
    : undefined,
});

export const FOLLOWER_NATIVE_RECENT_SORT: FollowerSort = {
  key: 'recent',
  label: 'Recent',
  directions: ['desc'],
  defaultDirection: 'desc',
  scope: 'native',
};

export const FOLLOWER_DATABASE_INTERACTIONS_SORT: FollowerSort = {
  key: 'interactions',
  label: 'Interactions',
  directions: ['asc', 'desc'],
  defaultDirection: 'desc',
  scope: 'database',
  requiresWindow: true,
};

export const FOLLOWER_DATABASE_NOTES_SORT: FollowerSort = {
  key: 'notes',
  label: 'Notes',
  directions: ['asc', 'desc'],
  defaultDirection: 'desc',
  scope: 'database',
};

export const FOLLOWER_DATABASE_LIKES_SORT: FollowerSort = {
  key: 'likes',
  label: 'Likes',
  directions: ['asc', 'desc'],
  defaultDirection: 'desc',
  scope: 'database',
};

export const FOLLOWER_DATABASE_RELATIONSHIP_GRADE_SORT: FollowerSort = {
  key: 'relationship_grade',
  label: 'Priority grade',
  directions: ['asc', 'desc'],
  defaultDirection: 'desc',
  scope: 'database',
};

export const FOLLOWER_DATABASE_MY_GRADE_SORT: FollowerSort = {
  key: 'my_grade',
  label: 'Your grade',
  directions: ['asc', 'desc'],
  defaultDirection: 'desc',
  scope: 'database',
};

export const FOLLOWER_DATABASE_BOT_GRADE_SORT: FollowerSort = {
  key: 'bot_grade',
  label: 'Bot grade',
  directions: ['asc', 'desc'],
  defaultDirection: 'desc',
  scope: 'database',
};

export const FOLLOWER_DATABASE_THEIR_EFFORT_SORT: FollowerSort = {
  key: 'their_effort',
  label: 'Their effort',
  directions: ['asc', 'desc'],
  defaultDirection: 'desc',
  scope: 'database',
};

export const FOLLOWER_DATABASE_NET_GAP_SORT: FollowerSort = {
  key: 'net_gap',
  label: 'Net effort gap',
  directions: ['asc', 'desc'],
  defaultDirection: 'desc',
  scope: 'database',
};

export const FOLLOWER_PAGE_SORTS: FollowerSort[] = [
  {
    key: 'followers_count',
    label: 'Followers',
    directions: ['asc', 'desc'],
    defaultDirection: 'desc',
    scope: 'page',
  },
  {
    key: 'following_count',
    label: 'Following',
    directions: ['asc', 'desc'],
    defaultDirection: 'desc',
    scope: 'page',
  },
  {
    key: 'account_created_at',
    label: 'Joined',
    directions: ['asc', 'desc'],
    defaultDirection: 'desc',
    scope: 'page',
  },
  {
    key: 'name',
    label: 'Name',
    directions: ['asc', 'desc'],
    defaultDirection: 'asc',
    scope: 'page',
  },
];

export const API_ORDER_FOLLOWER_SORTS: FollowerSort[] = [
  FOLLOWER_NATIVE_RECENT_SORT,
  ...FOLLOWER_PAGE_SORTS,
];

export const AUDIENCE_FOLLOWER_SORT_FIELDS = {
  recent: 'followedAt',
  name: 'name',
  followers_count: 'followersCount',
  following_count: 'followingCount',
  account_created_at: 'accountCreatedAt',
} as const;

export type AudienceFollowerSortField =
  (typeof AUDIENCE_FOLLOWER_SORT_FIELDS)[keyof typeof AUDIENCE_FOLLOWER_SORT_FIELDS];

export const normalizeFollowerSearch = (value?: string) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().replace(/^@/, '').trim();
  return normalized || undefined;
};

export const getAudienceFollowerSortField = (
  sortKey?: string
): AudienceFollowerSortField => {
  if (!sortKey) {
    return AUDIENCE_FOLLOWER_SORT_FIELDS.recent;
  }

  return (
    AUDIENCE_FOLLOWER_SORT_FIELDS[
    sortKey as keyof typeof AUDIENCE_FOLLOWER_SORT_FIELDS
    ] ?? AUDIENCE_FOLLOWER_SORT_FIELDS.recent
  );
};

export const isPageScopedFollowerSort = (
  sorts: FollowerSort[] | undefined,
  key?: string
) => {
  if (!key) {
    return false;
  }

  const sort = sorts?.find((candidate) => candidate.key === key);
  return sort?.scope === 'page';
};

const compareValues = (
  left: number | string | undefined,
  right: number | string | undefined
) => {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), undefined, {
    sensitivity: 'base',
  });
};

export const compareFollowers = (
  left: Follower,
  right: Follower,
  key: string,
  direction: FollowerSortDirection
) => {
  const factor = direction === 'asc' ? 1 : -1;

  switch (key) {
    case 'followers_count':
      return factor * compareValues(left.followersCount, right.followersCount);
    case 'following_count':
      return factor * compareValues(left.followingCount, right.followingCount);
    case 'account_created_at':
      return (
        factor * compareValues(left.accountCreatedAt, right.accountCreatedAt)
      );
    case 'name':
      return factor * compareValues(left.name, right.name);
    default:
      return 0;
  }
};

export const sortFollowers = (
  items: Follower[],
  key: string,
  direction: FollowerSortDirection
) => [...items].sort((left, right) => compareFollowers(left, right, key, direction));

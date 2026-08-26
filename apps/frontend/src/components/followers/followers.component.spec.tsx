/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  FollowersComponent,
  buildFollowerDetailHref,
  buildFollowersPageHref,
  parseFollowerPath,
  parseFollowerViewPath,
  resolveFollowerStrategyDefaults,
} from './followers.component';
import { getChannelStrategy } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.registry';
import {
  Follower,
  FollowerChannel,
  UseFollowersParams,
} from './use.followers';
import { FOLLOWER_BOARD_PREVIEW_LIMIT } from './follower.segments';

const openModal = jest.fn();
const closeById = jest.fn();
const decisionOpen = jest.fn();
const replace = jest.fn();
const push = jest.fn();
const useFollowersMock = jest.fn();
const useCopilotReadableMock = jest.fn();
const importMemberFromUrlMock = jest.fn();
const deleteListMock = jest.fn();
let mockPathname = '/followers';
let mockSearchParams = new URLSearchParams();
let followersPage = {
  items: [] as Follower[],
  hasMore: false,
  total: 0,
};
let pushState: jest.SpyInstance;
let historyBack: jest.SpyInstance;
let replaceState: jest.SpyInstance;
let deepLinkIsIgnored = false;

const channel: FollowerChannel = {
  id: 'channel-1',
  name: 'Acme Channel',
  identifier: 'x',
  sorts: [
    {
      key: 'recent',
      label: 'Recent',
      directions: ['desc'],
      defaultDirection: 'desc',
      scope: 'native',
    },
    {
      key: 'their_effort',
      label: 'Their effort',
      directions: ['asc', 'desc'],
      defaultDirection: 'desc',
      scope: 'database',
    },
  ],
};
let mockChannels: FollowerChannel[] = [channel];
let mockIntegrations = [
  {
    id: 'channel-1',
    name: 'Acme Channel',
    identifier: 'x',
    type: 'social',
    picture: '/picture.png',
    disabled: false,
    inBetweenSteps: false,
    changeProfilePicture: false,
    changeNickName: false,
  },
];

const strategyWithDefaults = (
  id: string,
  defaultFilter: string,
  defaultSort: string,
  filterPriority: string[] = []
) =>
  ({
    id,
    version: 1,
    summary: { key: 'summary', defaultValue: 'Summary' },
    ui: {
      defaultFilter,
      defaultSort,
      filterPriority,
      filterEmphasis: defaultFilter,
      compactMetrics: [],
      emptyState: { key: 'empty', defaultValue: 'Empty' },
    },
  }) as FollowerChannel['strategy'];

const publicStrategy = (
  id: Parameters<typeof getChannelStrategy>[0]
): FollowerChannel['strategy'] => {
  const strategy = getChannelStrategy(id);
  return {
    id: strategy.id,
    version: strategy.version,
    summary: strategy.description,
    ui: {
      defaultFilter: strategy.ui.defaultFilter,
      defaultSort: strategy.ui.defaultSort,
      filterPriority: [...strategy.ui.filterPriority],
      filterEmphasis: strategy.ui.filterEmphasis,
      compactMetrics: strategy.ui.compactMetrics,
      emptyState: strategy.ui.emptyState,
      assistantInitialCopy: strategy.ui.assistantInitialCopy,
      suggestedQuestions: strategy.ui.suggestedQuestions,
    },
  };
};


const isBoardPreviewParams = (params: UseFollowersParams) =>
  params.limit === FOLLOWER_BOARD_PREVIEW_LIMIT &&
  !params.cursor &&
  !params.listId &&
  !params.search &&
  !params.isBot &&
  (params.audience === 'lead' ||
    params.audience === 'hot' ||
    params.audience === 'cultivate' ||
    params.triage === 'mutual' ||
    params.triage === 'quiet');

const mainFollowersParams = () => {
  const withIntegration = useFollowersMock.mock.calls
    .map((call) => call[0] as UseFollowersParams)
    .filter((params) => !!params.integrationId);
  const boardStyle = withIntegration.filter(isBoardPreviewParams);
  if (boardStyle.length >= 5) {
    return withIntegration.filter((params) => !boardStyle.includes(params));
  }
  return withIntegration;
};

const getFilterChipLabels = () => {
  const filterBar = screen.getByTestId('followers-filter-bar');
  const listGroup = filterBar.querySelector('[data-filter-group="lists"]');
  return Array.from(filterBar.querySelectorAll('a'))
    .filter((link) => !listGroup?.contains(link))
    .map((link) => link.textContent?.trim());
};

jest.mock('@mantine/hooks', () => ({
  useClickOutside: () => ({ current: null }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@copilotkit/react-core', () => ({
  useCopilotReadable: (value: unknown) => useCopilotReadableMock(value),
}));

jest.mock('@gitroom/frontend/components/followers/use.copilot.follower.page', () => ({
  useCopilotFollowerPageProperties: jest.fn(),
}));

const dismissAlertMock = jest.fn();
let dismissedAlertKeys: string[] = [];
let dismissedAlertsLoading = false;

jest.mock('@gitroom/frontend/components/layout/use.dismissed.alerts', () => ({
  useDismissedAlerts: () => ({
    data: dismissedAlertsLoading
      ? undefined
      : { keys: dismissedAlertKeys },
    isLoading: dismissedAlertsLoading,
    dismissAlert: dismissAlertMock,
  }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    scroll: _scroll,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    scroll?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string, params?: Record<string, unknown>) => {
    if (!params) {
      return fallback;
    }
    return Object.entries(params).reduce(
      (result, [name, value]) =>
        result.replace(new RegExp(`{{${name}}}`, 'g'), String(value)),
      fallback
    );
  },
}));

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal,
    closeAll: jest.fn(),
    closeById,
  }),
  useDecisionModal: () => ({ open: decisionOpen }),
}));

jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div>Loading</div>,
}));

jest.mock('@gitroom/react/form/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

jest.mock('@gitroom/react/form/input', () => ({
  Input: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  }) => (
    <label>
      {label}
      <input aria-label={label} value={value} onChange={onChange} />
    </label>
  ),
}));

jest.mock('@gitroom/react/form/select', () => ({
  Select: ({
    label,
    value,
    onChange,
    children,
  }: {
    label: string;
    value: string;
    onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
    children: React.ReactNode;
  }) => (
    <label>
      {label}
      <select aria-label={label} value={value} onChange={onChange}>
        {children}
      </select>
    </label>
  ),
}));

jest.mock('@gitroom/frontend/components/followers/follower.card', () => ({
  FollowerCard: ({
    follower,
    onOpen,
  }: {
    follower: Follower;
    onOpen: () => void;
  }) => (
    <button type="button" onClick={onOpen}>
      {follower.name}
    </button>
  ),
}));

jest.mock('@gitroom/frontend/components/followers/follower.detail.modal', () => ({
  FollowerDetailModal: () => <div>Follower detail</div>,
}));

jest.mock('@gitroom/frontend/components/launches/channels.sidebar', () => ({
  ChannelsSidebar: ({ children }: { children: (collapsed: boolean) => React.ReactNode }) => (
    <div>{children(false)}</div>
  ),
  ChannelMenu: ({
    integrations,
    onSelect,
  }: {
    integrations: { id: string; name: string }[];
    onSelect: (integration: { id: string }) => void;
  }) => (
    <div data-testid="channel-menu">
      {integrations.map((integration) => (
        <button
          key={integration.id}
          type="button"
          onClick={() => onSelect(integration)}
        >
          {integration.name}
        </button>
      ))}
    </div>
  ),
  groupChannelsByCustomer: (integrations: { id: string }[]) => [
    { name: '', values: integrations },
  ],
}));

jest.mock('@gitroom/frontend/components/launches/helpers/use.integration.list', () => ({
  useIntegrationList: () => ({
    data: mockIntegrations,
    isLoading: false,
  }),
}));

jest.mock('@gitroom/frontend/components/followers/use.followers', () => {
  const actual = jest.requireActual('./use.followers');
  return {
    ...actual,
    useFollowerChannels: () => ({
      data: mockChannels,
      isLoading: false,
      error: undefined,
      mutate: jest.fn(),
    }),
    useFollowers: (params: UseFollowersParams) => useFollowersMock(params),
    useFollowerAudienceSummary: () => ({
      data: {
        total: 1256,
        totalAsOf: null,
        totalSource: 'list' as const,
        categories: {
          lead: 142,
          hot: 64,
          mutual: 89,
          cultivate: 40,
          quiet: 213,
          ignored: 27,
        },
        lists: [],
        listsTruncated: false,
        tracking: null,
      },
      isLoading: false,
    }),
    useFollowerLists: () => ({
      data: [{ id: 'list-1', name: 'VIP', createdAt: '', updatedAt: '' }],
      isLoading: false,
    }),
    useFollowerListMutations: () => ({
      createList: jest.fn(),
      deleteList: deleteListMock,
      addMember: jest.fn(),
      importMemberFromUrl: importMemberFromUrlMock,
      removeMember: jest.fn(),
      ignoreTriage: jest.fn(),
      ignoreFollower: jest.fn(),
      unignoreFollower: jest.fn(),
    }),
    useFollowerDetail: (
      integrationId?: string,
      identity?: { username?: string }
    ) => {
      if (!integrationId || !identity?.username) {
        return { data: undefined, isLoading: false };
      }
      return {
        data: {
          follower: {
            id: 'follower-1',
            name: identity.username,
            username: identity.username,
            isIgnored: deepLinkIsIgnored,
          },
          notes: [],
          interactions: [],
          relationship: {
            windowDays: 30,
            cadenceDays: 3,
            formulaVersion: 2,
            current: null,
            history: [],
          },
          myGrade: null,
        },
        isLoading: false,
      };
    },
  };
});

describe('follower page href helpers', () => {
  it.each([
    ['grow_audience', 'all', 'recent', undefined, undefined],
    ['lead_capture', 'leads', 'fit', 'leads', undefined],
    ['community_retention', 'cultivate', 'recent', 'cultivate', undefined],
    ['brand_awareness', 'all', 'interactions', undefined, 'interactions'],
    ['customer_support', 'costly', 'recent', 'costly', undefined],
  ])(
    'resolves %s defaults only for a bare Followers route',
    (_id, defaultFilter, defaultSort, slug, sort) => {
      const strategy = {
        id: _id,
        version: 1,
        summary: { key: 'summary', defaultValue: 'Summary' },
        ui: {
          defaultFilter,
          defaultSort,
          filterPriority: [],
          filterEmphasis: defaultFilter,
          compactMetrics: [],
          emptyState: { key: 'empty', defaultValue: 'Empty' },
        },
      } as FollowerChannel['strategy'];
      const defaults = resolveFollowerStrategyDefaults({
        pathname: '/followers',
        strategy,
        sorts: [
          {
            key: 'interactions',
            label: 'Interactions',
            directions: ['asc', 'desc'],
            defaultDirection: 'desc',
          },
        ],
      });

      expect(defaults).toEqual({
        ...(slug ? { slug } : {}),
        ...(sort ? { sort, direction: 'desc' } : {}),
      });
      expect(
        resolveFollowerStrategyDefaults({
          pathname: '/followers',
          search: 'alex',
          strategy,
        })
      ).toBeUndefined();
    }
  );

  it('maps triage slugs and query params', () => {
    expect(parseFollowerViewPath('/followers')).toEqual({
      slug: undefined,
      triage: undefined,
      audience: undefined,
      isBot: undefined,
    });
    expect(parseFollowerViewPath('/followers/hot')).toEqual({
      slug: 'hot',
      triage: undefined,
      audience: 'hot',
      isBot: undefined,
    });
    expect(parseFollowerViewPath('/followers/leads')).toEqual({
      slug: 'leads',
      triage: undefined,
      audience: 'lead',
      isBot: undefined,
    });
    expect(parseFollowerViewPath('/followers/lead')).toEqual({
      slug: 'lead',
      triage: undefined,
      audience: 'lead',
      isBot: undefined,
    });
    expect(parseFollowerViewPath('/followers/followed')).toEqual({
      slug: 'followed',
      triage: undefined,
      audience: 'followed',
      isBot: undefined,
    });
    expect(parseFollowerViewPath('/followers/ignored')).toEqual({
      slug: 'ignored',
      triage: undefined,
      audience: 'ignored',
      isBot: undefined,
    });
    expect(parseFollowerViewPath('/followers/bots')).toEqual({
      slug: 'bots',
      triage: undefined,
      audience: undefined,
      isBot: true,
    });
    expect(parseFollowerViewPath('/followers/engaged')).toEqual({
      slug: 'engaged',
      triage: undefined,
      audience: 'hot',
      isBot: undefined,
    });
    expect(
      buildFollowersPageHref({
        slug: 'hot',
        search: 'alex',
        sort: 'their_effort',
        direction: 'asc',
      })
    ).toBe('/followers/hot?search=alex&sort=their_effort&direction=asc');
    expect(
      buildFollowersPageHref({
        listId: 'list-1',
        search: 'alex',
      })
    ).toBe('/followers?search=alex&listId=list-1');
    expect(buildFollowersPageHref({ slug: 'bots' })).toBe('/followers/bots');
  });

  it('maps follower detail paths and hrefs', () => {
    expect(parseFollowerPath('/followers/@SummerYule')).toEqual({ type: 'list' });
    expect(parseFollowerPath('/followers/channel-1/@SummerYule')).toEqual({
      type: 'follower',
      integrationId: 'channel-1',
      username: 'SummerYule',
    });
    expect(parseFollowerPath('/followers/channel-1/%40SummerYule')).toEqual({
      type: 'follower',
      integrationId: 'channel-1',
      username: 'SummerYule',
    });
    expect(parseFollowerPath('/followers/hot')).toEqual({
      type: 'list',
      slug: 'hot',
      triage: undefined,
      audience: 'hot',
      isBot: undefined,
    });
    expect(parseFollowerPath('/followers/cultivate')).toEqual({
      type: 'list',
      slug: 'cultivate',
      triage: undefined,
      audience: 'cultivate',
      isBot: undefined,
    });
    expect(parseFollowerPath('/followers/bots')).toEqual({
      type: 'list',
      slug: 'bots',
      triage: undefined,
      audience: undefined,
      isBot: true,
    });
    expect(buildFollowerDetailHref('channel-1', '@SummerYule')).toBe(
      '/followers/channel-1/@SummerYule'
    );
  });
});

describe('FollowersComponent', () => {
  beforeEach(() => {
    openModal.mockClear();
    closeById.mockClear();
    replace.mockClear();
    push.mockClear();
    useFollowersMock.mockReset();
    useCopilotReadableMock.mockReset();
    importMemberFromUrlMock.mockReset();
    deleteListMock.mockReset();
    deleteListMock.mockResolvedValue(undefined);
    decisionOpen.mockReset();
    decisionOpen.mockResolvedValue(false);
    dismissAlertMock.mockReset();
    dismissedAlertKeys = [];
    dismissedAlertsLoading = false;
    mockPathname = '/followers';
    mockSearchParams = new URLSearchParams();
    mockChannels = [channel];
    mockIntegrations = [
      {
        id: 'channel-1',
        name: 'Acme Channel',
        identifier: 'x',
        type: 'social',
        picture: '/picture.png',
        disabled: false,
        inBetweenSteps: false,
        changeProfilePicture: false,
        changeNickName: false,
      },
    ];
    channel.strategy = undefined;
    deepLinkIsIgnored = false;
    followersPage = {
      items: [],
      hasMore: false,
      total: 0,
    };
    useFollowersMock.mockImplementation(() => ({
      data: followersPage,
      isLoading: false,
      error: undefined,
      mutate: jest.fn(),
    }));
    pushState = jest.spyOn(globalThis.history, 'pushState').mockImplementation(() => { });
    historyBack = jest.spyOn(globalThis.history, 'back').mockImplementation(() => { });
    replaceState = jest
      .spyOn(globalThis.history, 'replaceState')
      .mockImplementation(() => { });
  });

  afterEach(() => {
    pushState.mockRestore();
    historyBack.mockRestore();
    replaceState.mockRestore();
  });

  it('renders triage chips with accessible pressed state', () => {
    render(<FollowersComponent />);

    const allChip = screen.getByRole('link', { name: 'All' });
    const hotLeadChip = screen.getByRole('link', { name: 'Hot' });

    expect(allChip.getAttribute('aria-pressed')).toBe('true');
    expect(hotLeadChip.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows a triage tip on All and Hot views', () => {
    const { rerender } = render(<FollowersComponent />);

    expect(
      screen.getByTestId('followers-triage-tip').getAttribute('data-triage-tip')
    ).toBe('all');

    mockPathname = '/followers/hot';
    rerender(<FollowersComponent />);

    expect(
      screen.getByTestId('followers-triage-tip').getAttribute('data-triage-tip')
    ).toBe('hot');
  });

  it('hides the triage tip when a custom list is selected', () => {
    mockSearchParams = new URLSearchParams('listId=list-1');
    render(<FollowersComponent />);

    expect(screen.queryByTestId('followers-triage-tip')).toBeNull();
  });

  it('dismisses the active triage tip with a per-triage alert key', () => {
    mockPathname = '/followers/hot';
    render(<FollowersComponent />);

    fireEvent.click(screen.getByTestId('followers-triage-tip-dismiss'));

    expect(dismissAlertMock).toHaveBeenCalledWith('followers.triage.hot');
  });

  it('keeps All reachable after applying a strategy default', () => {
    channel.strategy = strategyWithDefaults('lead_capture', 'leads', 'fit');
    const { rerender } = render(<FollowersComponent />);

    expect(replace).toHaveBeenCalledWith('/followers/leads');

    mockPathname = '/followers/leads';
    rerender(<FollowersComponent />);
    mockPathname = '/followers';
    useFollowersMock.mockClear();
    rerender(<FollowersComponent />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'All' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByTestId('followers-board')).toBeTruthy();
  });

  it('applies strategy defaults only once for each channel', () => {
    channel.strategy = strategyWithDefaults('community_retention', 'cultivate', 'recent');
    const { rerender } = render(<FollowersComponent />);

    expect(replace).toHaveBeenCalledWith('/followers/cultivate');

    mockPathname = '/followers/cultivate';
    rerender(<FollowersComponent />);
    mockPathname = '/followers';
    rerender(<FollowersComponent />);

    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('does not apply a strategy default after entering on a non-bare route', () => {
    channel.strategy = strategyWithDefaults('community_retention', 'cultivate', 'recent');
    mockPathname = '/followers/hot';
    const { rerender } = render(<FollowersComponent />);

    expect(replace).not.toHaveBeenCalled();

    mockPathname = '/followers';
    rerender(<FollowersComponent />);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'All' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('applies a new channel strategy default once after switching channels', () => {
    channel.strategy = strategyWithDefaults('lead_capture', 'leads', 'fit');
    const secondChannel: FollowerChannel = {
      ...channel,
      id: 'channel-2',
      name: 'Support Channel',
      strategy: strategyWithDefaults('customer_support', 'costly', 'recent'),
    };
    mockChannels = [channel, secondChannel];
    mockIntegrations = [
      ...mockIntegrations,
      { ...mockIntegrations[0], id: 'channel-2', name: 'Support Channel' },
    ];

    const { rerender } = render(<FollowersComponent />);
    expect(replace).toHaveBeenCalledWith('/followers/leads');

    mockPathname = '/followers/leads';
    rerender(<FollowersComponent />);
    mockPathname = '/followers';
    rerender(<FollowersComponent />);
    fireEvent.click(screen.getByRole('button', { name: 'Support Channel' }));

    expect(replace).toHaveBeenLastCalledWith('/followers/costly');
    expect(replace).toHaveBeenCalledTimes(2);

    mockPathname = '/followers/costly';
    rerender(<FollowersComponent />);
    mockPathname = '/followers';
    rerender(<FollowersComponent />);

    expect(replace).toHaveBeenCalledTimes(2);
  });

  it('keeps the shipped filter chip order for grow audience', () => {
    channel.strategy = publicStrategy('grow_audience');
    render(<FollowersComponent />);

    expect(getFilterChipLabels()).toEqual([
      'All',
      'Leads',
      'Hot',
      'Cultivate',
      'Followed',
      'Mutual',
      'Quiet',
      'Costly',
      'Ignored',
      'Bots',
    ]);
  });

  it('reorders filter chips for non-default strategies', () => {
    channel.strategy = publicStrategy('lead_capture');
    render(<FollowersComponent />);

    expect(getFilterChipLabels()).toEqual([
      'Leads',
      'Hot',
      'All',
      'Cultivate',
      'Followed',
      'Mutual',
      'Quiet',
      'Costly',
      'Ignored',
      'Bots',
    ]);
  });

  it('renders flat tabs with mock segment colors and custom lists', () => {
    render(<FollowersComponent />);

    const filterBar = screen.getByTestId('followers-filter-bar');
    expect(filterBar.querySelectorAll('[data-filter-group]')).toHaveLength(1);
    expect(
      filterBar
        .querySelector('[data-filter-group="lists"]')
        ?.getAttribute('data-filter-group')
    ).toBe('lists');

    const leadsChip = screen.getByRole('link', { name: 'Leads' });
    const hotChip = screen.getByRole('link', { name: 'Hot' });
    const cultivateChip = screen.getByRole('link', { name: 'Cultivate' });
    const mutualChip = screen.getByRole('link', { name: 'Mutual' });
    const quietChip = screen.getByRole('link', { name: 'Quiet' });
    const costlyChip = screen.getByRole('link', { name: 'Costly' });
    const ignoredChip = screen.getByRole('link', { name: 'Ignored' });
    const botsChip = screen.getByRole('link', { name: 'Bots' });
    const vipChip = screen.getByRole('link', { name: 'VIP' });

    expect(leadsChip.className).toContain('border-red-500/40');
    expect(hotChip.className).toContain('border-red-500/40');
    expect(cultivateChip.className).toContain('border-red-500/40');
    expect(mutualChip.className).toContain('border-emerald-500/40');
    expect(quietChip.className).toContain('border-emerald-500/40');
    expect(costlyChip.className).toContain('border-amber-400/40');
    expect(ignoredChip.className).toContain('border-amber-400/40');
    expect(botsChip.className).toContain('border-amber-400/40');
    expect(vipChip.className).toContain('border-newBorder');
    expect(
      screen.getByRole('group', { name: 'Custom lists' }).contains(vipChip)
    ).toBe(true);
  });

  it('shows the summary cards and board on All with no search', () => {
    render(<FollowersComponent />);

    expect(screen.getByTestId('followers-summary-cards')).toBeTruthy();
    expect(screen.getByTestId('followers-board')).toBeTruthy();
    const columns = screen.getAllByTestId('followers-board-column');
    expect(columns).toHaveLength(6);
    expect(columns[0].getAttribute('data-board-segment')).toBe('leads');
    expect(columns[1].getAttribute('data-board-segment')).toBe('hot');
    expect(columns[2].getAttribute('data-board-segment')).toBe('cultivate');
    expect(columns[3].getAttribute('data-board-segment')).toBe('followed');

    const summaryCards = screen
      .getByTestId('followers-summary-cards')
      .querySelectorAll('[data-summary-segment]');
    expect(
      Array.from(summaryCards).map((card) =>
        card.getAttribute('data-summary-segment')
      )
    ).toEqual([
      'all',
      'leads',
      'hot',
      'cultivate',
      'followed',
      'mutual',
      'quiet',
      'costly',
      'ignored',
      'bots',
    ]);
  });

  it('hides the summary cards and board when a filtered tab is active', () => {
    mockPathname = '/followers/hot';
    render(<FollowersComponent />);

    expect(screen.queryByTestId('followers-summary-cards')).toBeNull();
    expect(screen.queryByTestId('followers-board')).toBeNull();
  });

  it('publishes bounded effective follower list context', () => {
    mockPathname = '/followers/hot';
    mockSearchParams = new URLSearchParams(
      'search=%20%40alex%20&sort=their_effort&direction=asc&listId=list-1'
    );
    render(<FollowersComponent />);

    expect(useCopilotReadableMock).toHaveBeenLastCalledWith({
      description: 'followerPage',
      value: expect.objectContaining({
        kind: 'list',
        route: '/followers/hot',
        channel: expect.objectContaining({ id: 'channel-1', name: 'Acme Channel' }),
        search: 'alex',
        list: expect.objectContaining({ id: 'list-1', name: 'VIP', status: 'current' }),
        availableLists: expect.arrayContaining([
          expect.objectContaining({ id: 'list-1', name: 'VIP' }),
        ]),
        sort: expect.objectContaining({
          key: 'their_effort',
          direction: 'asc',
          scope: 'database',
        }),
        pagination: { size: 24, number: 1 },
      }),
    });
  });

  it('points triage chips at real follower URLs', () => {
    render(<FollowersComponent />);

    expect(screen.getByRole('link', { name: 'All' }).getAttribute('href')).toBe(
      '/followers'
    );
    expect(screen.getByRole('link', { name: 'Hot' }).getAttribute('href')).toBe(
      '/followers/hot'
    );
    expect(screen.getByRole('link', { name: 'Cultivate' }).getAttribute('href')).toBe(
      '/followers/cultivate'
    );
    expect(screen.getByRole('link', { name: 'Mutual' }).getAttribute('href')).toBe(
      '/followers/mutual'
    );
    expect(screen.getByRole('link', { name: 'Costly' }).getAttribute('href')).toBe(
      '/followers/costly'
    );
    expect(screen.getByRole('link', { name: 'Quiet' }).getAttribute('href')).toBe(
      '/followers/quiet'
    );
    expect(screen.getByRole('link', { name: /^Leads$/ }).getAttribute('href')).toBe(
      '/followers/leads'
    );
    expect(screen.getByRole('link', { name: 'Ignored' }).getAttribute('href')).toBe(
      '/followers/ignored'
    );
    expect(screen.getByRole('link', { name: 'Bots' }).getAttribute('href')).toBe(
      '/followers/bots'
    );
    expect(screen.getByRole('link', { name: 'VIP' }).getAttribute('href')).toBe(
      '/followers?listId=list-1'
    );
    expect(screen.getByRole('button', { name: 'Create list' })).toBeTruthy();
  });

  it('hydrates hot audience from /followers/hot', () => {
    mockPathname = '/followers/hot';
    render(<FollowersComponent />);

    expect(screen.getByRole('link', { name: 'Hot' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(mainFollowersParams().at(-1)).toEqual(
      expect.objectContaining({ audience: 'hot', triage: undefined, sort: undefined })
    );
  });

  it('hydrates the bots filter from /followers/bots', () => {
    mockPathname = '/followers/bots';
    render(<FollowersComponent />);

    expect(screen.getByRole('link', { name: 'Bots' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByRole('link', { name: 'All' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(mainFollowersParams().at(-1)).toEqual(
      expect.objectContaining({ isBot: true, triage: undefined, audience: undefined })
    );
  });

  it('hydrates the lead audience from /followers/leads and clears triage', () => {
    mockPathname = '/followers/leads';
    render(<FollowersComponent />);

    expect(mainFollowersParams().at(-1)).toEqual(
      expect.objectContaining({
        audience: 'lead',
        triage: undefined,
      })
    );
  });

  it('redirects legacy /followers/lead to /followers/leads', () => {
    mockPathname = '/followers/lead';
    render(<FollowersComponent />);

    expect(replace).toHaveBeenCalledWith('/followers/leads');
  });

  it('redirects legacy /followers/engaged to /followers/hot', () => {
    mockPathname = '/followers/engaged';
    render(<FollowersComponent />);

    expect(replace).toHaveBeenCalledWith('/followers/hot');
  });

  it('hydrates the ignored audience from /followers/ignored', () => {
    mockPathname = '/followers/ignored';
    render(<FollowersComponent />);

    expect(
      screen.getByRole('link', { name: 'Ignored' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(mainFollowersParams().at(-1)).toEqual(
      expect.objectContaining({
        audience: 'ignored',
        triage: undefined,
      })
    );
  });

  it('shows an ignored-specific empty state', () => {
    mockPathname = '/followers/ignored';
    render(<FollowersComponent />);

    expect(screen.getByText('No ignored followers')).toBeTruthy();
  });

  it('hydrates search, sort, and direction from query params', () => {
    mockSearchParams = new URLSearchParams({
      search: 'alex',
      sort: 'their_effort',
      direction: 'asc',
    });
    render(<FollowersComponent />);

    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe(
      'alex'
    );
    fireEvent.click(screen.getByTestId('followers-filters-button'));
    expect((screen.getByLabelText('Sort by') as HTMLSelectElement).value).toBe(
      'their_effort'
    );
    expect((screen.getByLabelText('Direction') as HTMLSelectElement).value).toBe(
      'asc'
    );
    expect(mainFollowersParams().at(-1)).toEqual(
      expect.objectContaining({
        search: 'alex',
        sort: 'their_effort',
        direction: 'asc',
      })
    );
  });

  it('preserves search, sort, and direction on triage chip hrefs', () => {
    mockSearchParams = new URLSearchParams({
      search: 'alex',
      sort: 'their_effort',
      direction: 'asc',
    });
    render(<FollowersComponent />);

    expect(screen.getByRole('link', { name: 'Hot' }).getAttribute('href')).toBe(
      '/followers/hot?search=alex&sort=their_effort&direction=asc'
    );
  });

  it('writes search to the query string after debounce', () => {
    jest.useFakeTimers();
    render(<FollowersComponent />);

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'alex' },
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(replace).toHaveBeenCalledWith('/followers?search=alex');
    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe(
      'alex'
    );
    expect(replace).not.toHaveBeenCalledWith('/followers');
    jest.useRealTimers();
  });

  it('hydrates search from an external query-string change', () => {
    const { rerender } = render(<FollowersComponent />);
    replace.mockClear();

    mockSearchParams = new URLSearchParams({ search: 'alex' });
    rerender(<FollowersComponent />);

    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe(
      'alex'
    );
    expect(replace).not.toHaveBeenCalledWith('/followers');
  });

  it('writes sort and direction to the query string', () => {
    render(<FollowersComponent />);

    fireEvent.click(screen.getByTestId('followers-filters-button'));
    fireEvent.change(screen.getByLabelText('Sort by'), {
      target: { value: 'their_effort' },
    });

    expect(replace).toHaveBeenCalledWith(
      '/followers?sort=their_effort&direction=desc'
    );
  });

  it('resets pagination when the triage path changes', () => {
    mockPathname = '/followers/hot';
    followersPage = {
      items: [{ id: 'follower-1', name: 'Alex Example' }],
      hasMore: true,
      total: 2,
      nextCursor: 'cursor-2',
    } as typeof followersPage & { nextCursor: string };

    const { rerender } = render(<FollowersComponent />);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mainFollowersParams().at(-1)).toEqual(
      expect.objectContaining({ cursor: 'cursor-2' })
    );

    mockPathname = '/followers/quiet';
    rerender(<FollowersComponent />);
    expect(mainFollowersParams().at(-1)).toEqual(
      expect.objectContaining({ triage: 'quiet', cursor: undefined })
    );
    expect(screen.getByText('Page 1')).toBeTruthy();
  });

  it('resets pagination when the custom list filter changes', () => {
    mockPathname = '/followers/hot';
    followersPage = {
      items: [{ id: 'follower-1', name: 'Alex Example' }],
      hasMore: true,
      total: 2,
      nextCursor: 'cursor-2',
    } as typeof followersPage & { nextCursor: string };

    const { rerender } = render(<FollowersComponent />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    mockSearchParams = new URLSearchParams('listId=list-1');
    mockPathname = '/followers';
    rerender(<FollowersComponent />);
    expect(mainFollowersParams().at(-1)).toEqual(
      expect.objectContaining({ listId: 'list-1', cursor: undefined })
    );
    expect(screen.getByText('Page 1')).toBeTruthy();
  });

  it('shows a list-specific empty state when a custom list has no matches', () => {
    mockSearchParams = new URLSearchParams('listId=list-1');
    render(<FollowersComponent />);

    expect(screen.getByText('No followers in this list')).toBeTruthy();
    expect(
      screen.getByText(
        'Use + Add to paste a profile URL, or add people from their cards using the + button next to their triage label.'
      )
    ).toBeTruthy();
  });

  it('shows an Add button for custom lists and opens the import modal', () => {
    mockSearchParams = new URLSearchParams('listId=list-1');
    followersPage = {
      items: [{ id: 'follower-1', name: 'Alex Example' }],
      hasMore: false,
      total: 1,
    };

    render(<FollowersComponent />);

    const addButton = screen.getByRole('button', { name: 'Add' });
    expect(addButton).toBeTruthy();
    fireEvent.click(addButton);
    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Add to list',
      })
    );
  });

  it('hides the Add button when no custom list is selected', () => {
    render(<FollowersComponent />);
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  });

  it('shows a Remove button for custom lists and hides it otherwise', () => {
    mockSearchParams = new URLSearchParams('listId=list-1');
    const { unmount } = render(<FollowersComponent />);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    unmount();

    mockSearchParams = new URLSearchParams();
    render(<FollowersComponent />);
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('prompts before deleting a custom list and navigates away on confirm', async () => {
    mockSearchParams = new URLSearchParams('listId=list-1&search=alex');
    decisionOpen.mockResolvedValue(true);

    render(<FollowersComponent />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });

    expect(decisionOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Remove this list?',
        approveLabel: 'Yes',
        cancelLabel: 'Cancel',
      })
    );
    expect(deleteListMock).toHaveBeenCalledWith('list-1');
    expect(push).toHaveBeenCalledWith('/followers?search=alex');
  });

  it('does not delete a custom list when the prompt is cancelled', async () => {
    mockSearchParams = new URLSearchParams('listId=list-1');
    decisionOpen.mockResolvedValue(false);

    render(<FollowersComponent />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });

    expect(decisionOpen).toHaveBeenCalled();
    expect(deleteListMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a triage-specific empty state when a filter has no matches', () => {
    mockPathname = '/followers/mutual';
    render(<FollowersComponent />);

    expect(
      screen.getByText('No followers match this triage filter')
    ).toBeTruthy();
    expect(
      screen.getByText(
        'No followers match the Mutual filter on this channel. Try another filter or clear it to see everyone.'
      )
    ).toBeTruthy();
  });

  it('shows a lead-specific empty state', () => {
    mockPathname = '/followers/leads';
    render(<FollowersComponent />);

    expect(screen.getByText('No leads on this channel')).toBeTruthy();
    expect(
      screen.getByText(
        'Leads are people who interacted with this channel but do not currently follow it, plus prospects discovered through warm followers’ networks.'
      )
    ).toBeTruthy();
  });

  it('opens the detail modal as a closeable floating view', () => {
    mockPathname = '/followers/hot';
    followersPage = {
      items: [{ id: 'follower-1', name: 'Alex Example' }],
      hasMore: false,
      total: 1,
    };

    render(<FollowersComponent />);

    fireEvent.click(screen.getByRole('button', { name: 'Alex Example' }));

    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Follower details',
        size: 'calc(100vw - 24px)',
        maxSize: '960px',
        height: 'min(820px, calc(100dvh - 24px))',
        withCloseButton: true,
        classNames: {
          modal: 'text-textColor',
        },
      })
    );
    expect(pushState).not.toHaveBeenCalled();
  });

  it('pushes a follower URL with the History API and restores it when the modal closes', () => {
    mockPathname = '/followers/hot';
    followersPage = {
      items: [
        { id: 'follower-1', name: 'Alex Example', username: 'SummerYule' },
      ],
      hasMore: false,
      total: 1,
    };

    render(<FollowersComponent />);
    fireEvent.click(screen.getByRole('button', { name: 'Alex Example' }));

    expect(pushState).toHaveBeenCalledWith(
      { followerDetail: true },
      '',
      '/followers/channel-1/@SummerYule'
    );
    expect(push).not.toHaveBeenCalledWith('/followers/channel-1/@SummerYule');
    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'follower-detail-channel-1-SummerYule',
        onClose: expect.any(Function),
      })
    );

    act(() => {
      openModal.mock.calls[0][0].onClose();
    });
    expect(historyBack).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalledWith('/followers');
  });

  it('opens the detail modal from a follower deep link', () => {
    mockPathname = '/followers/channel-1/@SummerYule';
    render(<FollowersComponent />);

    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'follower-detail-channel-1-SummerYule',
        children: expect.anything(),
      })
    );
  });

  it('opens the detail modal for ignored followers from the ignored list', () => {
    deepLinkIsIgnored = true;
    mockPathname = '/followers/ignored';
    followersPage = {
      items: [
        {
          id: 'follower-1',
          name: 'Alex Example',
          username: 'SummerYule',
          isIgnored: true,
        },
      ],
      hasMore: false,
      total: 1,
    };

    render(<FollowersComponent />);
    fireEvent.click(screen.getByRole('button', { name: 'Alex Example' }));

    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'follower-detail-channel-1-SummerYule',
      })
    );
    expect(closeById).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalledWith('/followers/ignored');
  });

  it('opens the detail modal from a deep link when the follower is ignored', () => {
    deepLinkIsIgnored = true;
    mockPathname = '/followers/channel-1/@SummerYule';
    render(<FollowersComponent />);

    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'follower-detail-channel-1-SummerYule',
      })
    );
    expect(closeById).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalledWith('/followers/ignored');
  });
});

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
} from './followers.component';
import {
  Follower,
  FollowerChannel,
  UseFollowersParams,
} from './use.followers';

const openModal = jest.fn();
const closeById = jest.fn();
const replace = jest.fn();
const push = jest.fn();
const useFollowersMock = jest.fn();
const useCopilotReadableMock = jest.fn();
const importMemberFromUrlMock = jest.fn();
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
  ChannelMenu: () => <div data-testid="channel-menu" />,
  groupChannelsByCustomer: (integrations: { id: string }[]) => [
    { name: '', values: integrations },
  ],
}));

jest.mock('@gitroom/frontend/components/launches/helpers/use.integration.list', () => ({
  useIntegrationList: () => ({
    data: [
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
    ],
    isLoading: false,
  }),
}));

jest.mock('@gitroom/frontend/components/followers/use.followers', () => {
  const actual = jest.requireActual('./use.followers');
  return {
    ...actual,
    useFollowerChannels: () => ({
      data: [channel],
      isLoading: false,
      error: undefined,
      mutate: jest.fn(),
    }),
    useFollowers: (params: UseFollowersParams) => useFollowersMock(params),
    useFollowerLists: () => ({
      data: [{ id: 'list-1', name: 'VIP', createdAt: '', updatedAt: '' }],
      isLoading: false,
    }),
    useFollowerListMutations: () => ({
      createList: jest.fn(),
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
  it('maps triage slugs and query params', () => {
    expect(parseFollowerViewPath('/followers')).toEqual({
      slug: undefined,
      triage: undefined,
      audience: undefined,
      isBot: undefined,
    });
    expect(parseFollowerViewPath('/followers/hot')).toEqual({
      slug: 'hot',
      triage: 'hot_lead',
      audience: undefined,
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
    expect(
      buildFollowersPageHref({
        slug: 'engaged',
        search: 'alex',
        sort: 'their_effort',
        direction: 'asc',
      })
    ).toBe('/followers/engaged?search=alex&sort=their_effort&direction=asc');
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
      triage: 'hot_lead',
      audience: undefined,
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
    mockPathname = '/followers';
    mockSearchParams = new URLSearchParams();
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
    expect(screen.getByRole('link', { name: 'Engaged' }).getAttribute('href')).toBe(
      '/followers/engaged'
    );
    expect(screen.getByRole('link', { name: 'Hot' }).getAttribute('href')).toBe(
      '/followers/hot'
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

  it('hydrates triage from /followers/hot', () => {
    mockPathname = '/followers/hot';
    render(<FollowersComponent />);

    expect(screen.getByRole('link', { name: 'Hot' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(useFollowersMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ triage: 'hot_lead', audience: undefined })
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
    expect(useFollowersMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isBot: true, triage: undefined, audience: undefined })
    );
  });

  it('hydrates the lead audience from /followers/leads and clears triage', () => {
    mockPathname = '/followers/leads';
    render(<FollowersComponent />);

    expect(useFollowersMock).toHaveBeenLastCalledWith(
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

  it('hydrates the ignored audience from /followers/ignored', () => {
    mockPathname = '/followers/ignored';
    render(<FollowersComponent />);

    expect(
      screen.getByRole('link', { name: 'Ignored' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(useFollowersMock).toHaveBeenLastCalledWith(
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
    expect((screen.getByLabelText('Sort by') as HTMLSelectElement).value).toBe(
      'their_effort'
    );
    expect((screen.getByLabelText('Direction') as HTMLSelectElement).value).toBe(
      'asc'
    );
    expect(useFollowersMock).toHaveBeenLastCalledWith(
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

    fireEvent.change(screen.getByLabelText('Sort by'), {
      target: { value: 'their_effort' },
    });

    expect(replace).toHaveBeenCalledWith(
      '/followers?sort=their_effort&direction=desc'
    );
  });

  it('resets pagination when the triage path changes', () => {
    followersPage = {
      items: [{ id: 'follower-1', name: 'Alex Example' }],
      hasMore: true,
      total: 2,
      nextCursor: 'cursor-2',
    } as typeof followersPage & { nextCursor: string };

    const { rerender } = render(<FollowersComponent />);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(useFollowersMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2' })
    );

    mockPathname = '/followers/quiet';
    rerender(<FollowersComponent />);
    expect(useFollowersMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ triage: 'quiet', cursor: undefined })
    );
    expect(screen.getByText('Page 1')).toBeTruthy();
  });

  it('resets pagination when the custom list filter changes', () => {
    followersPage = {
      items: [{ id: 'follower-1', name: 'Alex Example' }],
      hasMore: true,
      total: 2,
      nextCursor: 'cursor-2',
    } as typeof followersPage & { nextCursor: string };

    const { rerender } = render(<FollowersComponent />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    mockSearchParams = new URLSearchParams('listId=list-1');
    rerender(<FollowersComponent />);
    expect(useFollowersMock).toHaveBeenLastCalledWith(
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

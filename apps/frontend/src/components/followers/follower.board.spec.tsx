/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  FollowerBoard,
  FollowerBoardColumn,
  FollowerBoardRow,
} from './follower.board';
import {
  FOLLOWER_BOARD_LIST_MIN_HEIGHT_PX,
  FOLLOWER_BOARD_SEGMENTS,
} from './follower.segments';
import { Follower } from './use.followers';

const dismissTriage = jest.fn();
const unfollowConfirmOpen = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback: string, params?: Record<string, unknown>) => {
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

jest.mock('@gitroom/frontend/components/followers/follower.card', () => ({
  useRelationshipTriageDismiss: () => ({
    dismiss: dismissTriage,
    displayLabel: 'Lead',
  }),
}));

jest.mock(
  '@gitroom/frontend/components/followers/unfollow.confirm.modal',
  () => ({
    useUnfollowConfirmModal: () => ({
      open: unfollowConfirmOpen,
    }),
  })
);

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

jest.mock('@gitroom/frontend/components/ui/custom.scroll.area', () => ({
  CustomScrollArea: ({
    children,
    className,
    contentClassName,
    maxHeight,
    'data-testid': dataTestId,
  }: {
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
    maxHeight?: string | number;
    'data-testid'?: string;
  }) => (
    <div
      data-testid={dataTestId ?? 'custom-scroll-area'}
      className={className}
      data-max-height={maxHeight}
    >
      {contentClassName ? (
        <div className={contentClassName}>{children}</div>
      ) : (
        children
      )}
    </div>
  ),
}));

jest.mock('@gitroom/frontend/components/followers/use.followers', () => {
  const actual = jest.requireActual('./use.followers');
  return {
    ...actual,
    useFollowers: () => ({
      data: { items: [], hasMore: false },
      isLoading: false,
    }),
  };
});

const openModal = jest.fn();

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal,
    closeCurrent: jest.fn(),
    closeAll: jest.fn(),
  }),
}));

jest.mock('@mantine/hooks', () => ({
  useClickOutside: () => ({ current: null }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/followers',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('react-dnd', () => ({
  useDrag: () => [{ isDragging: false }, jest.fn()],
  useDrop: () => [{}, jest.fn()],
  DndProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const follower = (overrides: Partial<Follower> = {}): Follower =>
  ({
    id: 'follower-1',
    name: 'Alex Rivera',
    username: 'alex',
    picture: '/alex.png',
    interactionCount: 12,
    profileUrl: 'https://example.com/alex',
    ...overrides,
  } as Follower);

const toOrderedSegmentColumns = (
  columns: Array<{
    segment: (typeof FOLLOWER_BOARD_SEGMENTS)[number];
    items: Follower[];
    total: number | null;
    viewAllHref: string;
  }>
) =>
  columns.map((column) => ({
    kind: 'segment' as const,
    columnKey: `segment:${column.segment.slug}`,
    ...column,
  }));

const leadsSegment = FOLLOWER_BOARD_SEGMENTS.find(
  (segment) => segment.slug === 'leads'
)!;
const conversionsSegment = FOLLOWER_BOARD_SEGMENTS.find(
  (segment) => segment.slug === 'conversions'
)!;
const followedSegment = FOLLOWER_BOARD_SEGMENTS.find(
  (segment) => segment.slug === 'followed'
)!;
const unfollowedSegment = FOLLOWER_BOARD_SEGMENTS.find(
  (segment) => segment.slug === 'unfollowed'
)!;

describe('FollowerBoard', () => {
  beforeEach(() => {
    dismissTriage.mockClear();
    unfollowConfirmOpen.mockClear();
  });

  it('renders a responsive grid of built-in columns with followed before mutual', () => {
    const onOpen = jest.fn();
    render(
      <FollowerBoard
        orderedColumns={toOrderedSegmentColumns(
          FOLLOWER_BOARD_SEGMENTS.map((segment, index) => ({
            segment,
            items: [
              follower({
                id: `f-${index}`,
                name: `${segment.defaultLabel} User`,
              }),
            ],
            total: 10 + index,
            viewAllHref: `/followers/${segment.slug}`,
          }))
        )}
        onOpenFollower={onOpen}
        onDismissTriage={jest.fn()}
      />
    );

    const board = screen.getByTestId('followers-board');
    expect(board.className).toContain('grid-cols-1');
    expect(board.className).toContain('2xl:grid-cols-5');

    const columns = screen.getAllByTestId('followers-board-column');
    expect(columns).toHaveLength(FOLLOWER_BOARD_SEGMENTS.length);
    expect(columns[0].getAttribute('data-board-segment')).toBe('leads');
    expect(columns[1].getAttribute('data-board-segment')).toBe('hot');
    expect(columns[2].getAttribute('data-board-segment')).toBe('cultivate');
    expect(columns[3].getAttribute('data-board-segment')).toBe('followed');
    expect(columns[4].getAttribute('data-board-segment')).toBe('conversions');
    expect(columns[5].getAttribute('data-board-segment')).toBe('mutual');
    expect(columns[6].getAttribute('data-board-segment')).toBe('quiet');
    expect(columns[7].getAttribute('data-board-segment')).toBe('costly');
    expect(columns[8].getAttribute('data-board-segment')).toBe('ignored');
    expect(columns[9].getAttribute('data-board-segment')).toBe('unfollowed');
    expect(columns[10].getAttribute('data-board-segment')).toBe('bots');
    expect(
      screen.getByRole('link', { name: 'View all (10)' }).getAttribute('href')
    ).toBe('/followers/leads');

    fireEvent.click(screen.getByText('Leads User'));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Leads User' })
    );
  });

  it('shows a column menu with Help that opens a segment help modal', () => {
    openModal.mockClear();
    render(
      <FollowerBoard
        orderedColumns={toOrderedSegmentColumns(
          FOLLOWER_BOARD_SEGMENTS.map((segment, index) => ({
            segment,
            items: [],
            total: index,
            viewAllHref: `/followers/${segment.slug}`,
          }))
        )}
        onOpenFollower={jest.fn()}
      />
    );

    expect(screen.queryByText(leadsSegment.defaultDescription)).toBeNull();

    const menuButtons = screen.getAllByTestId('followers-board-column-menu');
    expect(menuButtons).toHaveLength(FOLLOWER_BOARD_SEGMENTS.length);

    fireEvent.click(menuButtons[0]);
    expect(screen.queryByTestId('followers-board-column-add')).toBeNull();
    const helpItem = screen.getByTestId('followers-board-column-help');
    expect(helpItem.textContent).toBe('Help');
    fireEvent.click(helpItem);

    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'About Leads',
      })
    );

    const hotIndex = FOLLOWER_BOARD_SEGMENTS.findIndex((s) => s.slug === 'hot');
    fireEvent.click(menuButtons[hotIndex]);
    fireEvent.click(screen.getByTestId('followers-board-column-help'));
    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'About Hot',
      })
    );
  });

  it('shows Add above Help in the Leads column menu and calls onAddLead', () => {
    const onAddLead = jest.fn();
    render(
      <FollowerBoard
        orderedColumns={toOrderedSegmentColumns(
          FOLLOWER_BOARD_SEGMENTS.map((segment, index) => ({
            segment,
            items: [],
            total: index,
            viewAllHref: `/followers/${segment.slug}`,
          }))
        )}
        onOpenFollower={jest.fn()}
        onAddLead={onAddLead}
      />
    );

    const menuButtons = screen.getAllByTestId('followers-board-column-menu');
    fireEvent.click(menuButtons[0]);

    const panel = screen.getByTestId('followers-board-column-menu-panel');
    const items = panel.querySelectorAll('[role="menuitem"]');
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('data-testid')).toBe(
      'followers-board-column-add'
    );
    expect(items[0].textContent).toBe('Add');
    expect(items[1].getAttribute('data-testid')).toBe(
      'followers-board-column-help'
    );

    fireEvent.click(screen.getByTestId('followers-board-column-add'));
    expect(onAddLead).toHaveBeenCalled();

    const hotIndex = FOLLOWER_BOARD_SEGMENTS.findIndex((s) => s.slug === 'hot');
    fireEvent.click(menuButtons[hotIndex]);
    expect(screen.queryByTestId('followers-board-column-add')).toBeNull();
  });

  it('renders a scroll wrapper when a column has items', () => {
    render(
      <FollowerBoardColumn
        segment={leadsSegment}
        items={[follower()]}
        total={12}
        viewAllHref="/followers/leads"
        onOpenFollower={jest.fn()}
        onDismissTriage={jest.fn()}
      />
    );

    expect(screen.getByTestId('followers-board-column-scroll')).toBeTruthy();
    expect(screen.getByTestId('custom-scroll-area')).toBeTruthy();
    expect(screen.getByTestId('followers-board-view-all')).toBeTruthy();
  });

  it('renders View all in every column footer for populated and empty columns', () => {
    render(
      <FollowerBoard
        orderedColumns={toOrderedSegmentColumns(
          FOLLOWER_BOARD_SEGMENTS.map((segment, index) => ({
            segment,
            items:
              index % 2 === 0
                ? [
                    follower({
                      id: `f-${index}`,
                      name: `${segment.defaultLabel} User`,
                    }),
                  ]
                : [],
            total: 10 + index,
            viewAllHref: `/followers/${segment.slug}`,
          }))
        )}
        onOpenFollower={jest.fn()}
        onDismissTriage={jest.fn()}
      />
    );

    const viewAllLinks = screen.getAllByTestId('followers-board-view-all');
    expect(viewAllLinks).toHaveLength(FOLLOWER_BOARD_SEGMENTS.length);
    expect(screen.getAllByTestId('followers-board-column-scroll')).toHaveLength(
      6
    );
  });

  it('renders custom list columns in the board grid', () => {
    render(
      <FollowerBoard
        orderedColumns={[
          {
            kind: 'list',
            columnKey: 'list:list-1',
            list: {
              id: 'list-1',
              name: 'VIP',
              color: 'orange',
              createdAt: '',
              updatedAt: '',
            },
            total: 4,
            viewAllHref: '/followers?listId=list-1',
          },
        ]}
        integrationId="channel-1"
        onOpenFollower={jest.fn()}
      />
    );

    const listColumn = screen.getByTestId('followers-board-column');
    expect(listColumn.getAttribute('data-board-list')).toBe('list-1');
    expect(screen.getByText('VIP')).toBeTruthy();
  });

  it('uses a fixed list height for six visible rows', () => {
    render(
      <FollowerBoardColumn
        segment={leadsSegment}
        items={[follower()]}
        total={12}
        viewAllHref="/followers/leads"
        onOpenFollower={jest.fn()}
        onDismissTriage={jest.fn()}
      />
    );

    const listArea = screen.getByTestId('followers-board-column-list');
    expect(listArea.style.height).toBe(
      `${FOLLOWER_BOARD_LIST_MIN_HEIGHT_PX}px`
    );
    expect(
      screen.getByTestId('custom-scroll-area').getAttribute('data-max-height')
    ).toBe(String(FOLLOWER_BOARD_LIST_MIN_HEIGHT_PX));
  });

  it('omits the scroll wrapper when a column is empty', () => {
    render(
      <FollowerBoardColumn
        segment={leadsSegment}
        items={[]}
        total={0}
        viewAllHref="/followers/leads"
        onOpenFollower={jest.fn()}
      />
    );

    expect(screen.queryByTestId('followers-board-column-scroll')).toBeNull();
    expect(screen.getByText('No people in this segment yet.')).toBeTruthy();
    expect(screen.getByTestId('followers-board-view-all')).toBeTruthy();
  });
});

it('exposes a drag handle on the column icon and title', () => {
  render(
    <FollowerBoard
      orderedColumns={toOrderedSegmentColumns([
        {
          segment: leadsSegment,
          items: [follower()],
          total: 1,
          viewAllHref: '/followers/leads',
        },
      ])}
      onOpenFollower={jest.fn()}
    />
  );

  expect(screen.getByTestId('followers-board-column-drag-handle')).toBeTruthy();
});

describe('FollowerBoardRow', () => {
  beforeEach(() => {
    dismissTriage.mockClear();
    unfollowConfirmOpen.mockClear();
  });

  it('shows name and handle without interaction count', () => {
    render(
      <FollowerBoardRow
        follower={follower()}
        segment={leadsSegment}
        onOpen={jest.fn()}
        onDismissTriage={jest.fn()}
      />
    );

    expect(screen.getByText('Alex Rivera')).toBeTruthy();
    expect(screen.getByText('@alex')).toBeTruthy();
    expect(screen.queryByText('12i')).toBeNull();
    expect(screen.getByTestId('followers-board-row-menu')).toBeTruthy();
  });

  it('shows conversion subtitle in the conversions column', () => {
    render(
      <FollowerBoardRow
        follower={follower({
          latestConversionType: 'follower_gained',
          lastConvertedAt: new Date(Date.now() - 60_000).toISOString(),
        })}
        segment={conversionsSegment}
        onOpen={jest.fn()}
      />
    );

    expect(screen.getByText(/Follower gained · /)).toBeTruthy();
  });

  it('does not open the modal when avatar or username profile links are clicked', () => {
    const onOpen = jest.fn();
    render(
      <FollowerBoardRow
        follower={follower()}
        segment={leadsSegment}
        onOpen={onOpen}
        onDismissTriage={jest.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole('link', { name: 'View profile for Alex Rivera' })
    );
    fireEvent.click(screen.getByText('@alex'));

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('snoozes Hot and Cultivate triages when a profile link is clicked', async () => {
    const onOpen = jest.fn();
    const onDismissTriage = jest.fn();
    render(
      <FollowerBoardRow
        follower={follower({
          isHot: true,
          isCultivate: true,
          relationshipTriage: 'hot_lead',
        })}
        segment={leadsSegment}
        onOpen={onOpen}
        onDismissTriage={onDismissTriage}
      />
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('link', { name: 'View profile for Alex Rivera' })
      );
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(onDismissTriage).toHaveBeenCalledWith('hot_lead', undefined, {
      snooze: true,
    });
    expect(onDismissTriage).toHaveBeenCalledWith('cultivate', undefined, {
      snooze: true,
    });
  });

  it('opens triage dismiss flow from the menu without opening the row', async () => {
    const onOpen = jest.fn();
    render(
      <FollowerBoardRow
        follower={follower()}
        segment={leadsSegment}
        onOpen={onOpen}
        onDismissTriage={jest.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('followers-board-row-menu'));
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(dismissTriage).toHaveBeenCalled();
  });

  it('opens unfollow flow from the menu in the followed column', async () => {
    const onOpen = jest.fn();
    const onUnfollow = jest.fn();
    unfollowConfirmOpen.mockResolvedValue('unfollow');

    render(
      <FollowerBoardRow
        follower={follower()}
        segment={followedSegment}
        canUnfollow={true}
        onOpen={onOpen}
        onUnfollow={onUnfollow}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('followers-board-row-menu'));
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(unfollowConfirmOpen).toHaveBeenCalled();
    expect(onUnfollow).toHaveBeenCalled();
  });

  it('opens unfollow flow from the menu in the unfollowed column', async () => {
    const onOpen = jest.fn();
    const onUnfollow = jest.fn();
    unfollowConfirmOpen.mockResolvedValue('unfollow');

    render(
      <FollowerBoardRow
        follower={follower()}
        segment={unfollowedSegment}
        canUnfollow={true}
        onOpen={onOpen}
        onUnfollow={onUnfollow}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('followers-board-row-menu'));
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(unfollowConfirmOpen).toHaveBeenCalled();
    expect(onUnfollow).toHaveBeenCalled();
  });

  it('opens the modal when the row is clicked outside profile links', () => {
    const onOpen = jest.fn();
    render(
      <FollowerBoardRow
        follower={follower()}
        segment={leadsSegment}
        onOpen={onOpen}
        onDismissTriage={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('Alex Rivera'));
    expect(onOpen).toHaveBeenCalled();
  });
});

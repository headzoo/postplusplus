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
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="custom-scroll-area" className={className}>
      {children}
    </div>
  ),
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
  }) as Follower;

describe('FollowerBoard', () => {
  it('renders five columns with cultivate before mutual and opens rows', () => {
    const onOpen = jest.fn();
    render(
      <FollowerBoard
        columns={FOLLOWER_BOARD_SEGMENTS.map((segment, index) => ({
          segment,
          items: [follower({ id: `f-${index}`, name: `${segment.defaultLabel} User` })],
          total: 10 + index,
          viewAllHref: `/followers/${segment.slug}`,
        }))}
        onOpenFollower={onOpen}
      />
    );

    expect(screen.getByTestId('followers-board')).toBeTruthy();
    const columns = screen.getAllByTestId('followers-board-column');
    expect(columns).toHaveLength(5);
    expect(columns[0].getAttribute('data-board-segment')).toBe('leads');
    expect(columns[1].getAttribute('data-board-segment')).toBe('hot');
    expect(columns[2].getAttribute('data-board-segment')).toBe('cultivate');
    expect(columns[3].getAttribute('data-board-segment')).toBe('mutual');
    expect(columns[4].getAttribute('data-board-segment')).toBe('quiet');
    expect(
      screen.getByRole('link', { name: 'View all (10)' }).getAttribute('href')
    ).toBe('/followers/leads');

    fireEvent.click(screen.getByText('Leads User'));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Leads User' })
    );
  });

  it('renders a scroll wrapper with min height when a column has items', () => {
    const segment = FOLLOWER_BOARD_SEGMENTS[0];
    render(
      <FollowerBoardColumn
        segment={segment}
        items={[follower()]}
        total={12}
        viewAllHref="/followers/leads"
        onOpenFollower={jest.fn()}
      />
    );

    const scrollWrapper = screen.getByTestId('followers-board-column-scroll');
    expect(scrollWrapper).toBeTruthy();
    expect(scrollWrapper.style.minHeight).toBe(
      `${FOLLOWER_BOARD_LIST_MIN_HEIGHT_PX}px`
    );
    expect(screen.getByTestId('custom-scroll-area')).toBeTruthy();
  });

  it('omits the scroll wrapper when a column is empty', () => {
    const segment = FOLLOWER_BOARD_SEGMENTS[0];
    render(
      <FollowerBoardColumn
        segment={segment}
        items={[]}
        total={0}
        viewAllHref="/followers/leads"
        onOpenFollower={jest.fn()}
      />
    );

    expect(screen.queryByTestId('followers-board-column-scroll')).toBeNull();
    expect(screen.getByText('No people in this segment yet.')).toBeTruthy();
  });
});

describe('FollowerBoardRow', () => {
  it('shows name, handle, and interaction count', () => {
    render(
      <FollowerBoardRow
        follower={follower()}
        color="red"
        onOpen={jest.fn()}
      />
    );

    expect(screen.getByText('Alex Rivera')).toBeTruthy();
    expect(screen.getByText('@alex')).toBeTruthy();
    expect(screen.getByText(/12/)).toBeTruthy();
    expect(screen.getByText(/Interactions/)).toBeTruthy();
  });

  it('does not open the modal when avatar or username profile links are clicked', () => {
    const onOpen = jest.fn();
    render(
      <FollowerBoardRow
        follower={follower()}
        color="red"
        onOpen={onOpen}
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
        color="red"
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

  it('opens the modal when the row is clicked outside profile links', () => {
    const onOpen = jest.fn();
    render(
      <FollowerBoardRow
        follower={follower()}
        color="red"
        onOpen={onOpen}
      />
    );

    fireEvent.click(screen.getByText('Alex Rivera'));
    expect(onOpen).toHaveBeenCalled();
  });
});

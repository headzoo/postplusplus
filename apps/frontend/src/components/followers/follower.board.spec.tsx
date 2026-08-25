/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  FollowerBoard,
  FollowerBoardRow,
} from './follower.board';
import { FOLLOWER_BOARD_SEGMENTS } from './follower.segments';
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

const follower = (overrides: Partial<Follower> = {}): Follower =>
  ({
    id: 'follower-1',
    name: 'Alex Rivera',
    username: 'alex',
    picture: '/alex.png',
    interactionCount: 12,
    ...overrides,
  }) as Follower;

describe('FollowerBoard', () => {
  it('renders five columns with view-all links and opens rows', () => {
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
    expect(screen.getAllByTestId('followers-board-column')).toHaveLength(5);
    expect(
      screen.getAllByTestId('followers-board-column')[0].getAttribute(
        'data-board-segment'
      )
    ).toBe('leads');
    expect(
      screen.getByRole('link', { name: 'View all (10)' }).getAttribute('href')
    ).toBe('/followers/leads');

    fireEvent.click(screen.getByText('Leads User'));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Leads User' })
    );
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
});

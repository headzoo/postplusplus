/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { openExternalPost } from '@gitroom/frontend/components/external-post/open.external.post';

const mockXPost = jest.fn(
  ({ post }: { post: { content: string; author: { username?: string } } }) => (
    <div data-testid="x-post">
      {post.author.username}: {post.content}
    </div>
  )
);
const mockUseFollowerDetail = jest.fn();
const mockUseFollowerMemberTimeline = jest.fn();
let mockFollowerChannels = [
  { id: 'channel-1', identifier: 'x', name: 'X', sorts: [] },
];

jest.mock('next/navigation', () => ({
  useParams: () => ({ view: 'channel-1', handle: '@Nav_Mian' }),
  useSearchParams: () => new URLSearchParams('externalId=follower-1'),
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

jest.mock('@copilotkit/react-core', () => ({
  useCopilotReadable: jest.fn(),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

jest.mock('@gitroom/react/form/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div>Loading</div>,
}));

jest.mock(
  '@gitroom/frontend/components/followers/use.copilot.follower.page',
  () => ({
    useCopilotFollowerPageProperties: jest.fn(),
  })
);

jest.mock('@gitroom/frontend/components/followers/use.followers', () => ({
  buildFollowerDetailHref: () => '/followers/channel-1/@Nav_Mian',
  useFollowerChannels: () => ({ data: mockFollowerChannels }),
  useFollowerDetail: (...args: unknown[]) => mockUseFollowerDetail(...args),
  useFollowerMemberTimeline: (...args: unknown[]) =>
    mockUseFollowerMemberTimeline(...args),
}));

jest.mock(
  '@gitroom/frontend/components/conversations/providers/x.post.component',
  () => ({
    XPost: (props: {
      post: { content: string; author: { username?: string } };
    }) => mockXPost(props),
  })
);

const { FollowerTimelineComponent } =
  require('./follower.timeline.component') as typeof import('./follower.timeline.component');

describe('follower timeline external post navigation', () => {
  it('reuses the shared named tab for subsequent post links', () => {
    const focus = jest.fn();
    const postTab = {
      closed: false,
      focus,
      location: { href: '' },
    } as unknown as Window;
    const open = jest.spyOn(window, 'open').mockReturnValue(postTab);

    openExternalPost('https://x.com/jane/status/1');
    openExternalPost('https://x.com/jane/status/2');

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      'https://x.com/jane/status/1',
      'postplusplus-external-post'
    );
    expect(postTab.location.href).toBe('https://x.com/jane/status/2');
    expect(focus).toHaveBeenCalledTimes(2);

    open.mockRestore();
  });
});

describe('FollowerTimelineComponent', () => {
  beforeEach(() => {
    mockXPost.mockClear();
    mockFollowerChannels = [
      { id: 'channel-1', identifier: 'x', name: 'X', sorts: [] },
    ];
    mockUseFollowerDetail.mockReturnValue({
      data: {
        follower: {
          id: 'follower-1',
          name: 'Nav Mian',
          username: 'Nav_Mian',
          picture: '/nav.jpg',
        },
      },
    });
    mockUseFollowerMemberTimeline.mockReturnValue({
      data: {
        items: [
          {
            externalId: 'tweet-1',
            url: 'https://x.com/Nav_Mian/status/tweet-1',
            content: 'Timeline tweet',
            publishedAt: '2026-09-07T12:00:00.000Z',
          },
        ],
        hasMore: false,
      },
      error: undefined,
      isLoading: false,
      mutate: jest.fn(),
    });
  });

  it('renders timeline entries with the shared X post component', () => {
    render(<FollowerTimelineComponent />);

    expect(screen.getByTestId('x-post').textContent).toBe(
      'Nav_Mian: Timeline tweet'
    );
    expect(mockXPost).toHaveBeenCalledWith(
      expect.objectContaining({
        post: expect.objectContaining({
          externalId: 'tweet-1',
          author: expect.objectContaining({
            externalId: 'follower-1',
            name: 'Nav Mian',
            username: 'Nav_Mian',
            picture: '/nav.jpg',
          }),
        }),
      })
    );
    expect(
      screen.getByTestId('x-post').closest('article')?.className
    ).toContain('bg-newBgColorInner');
  });

  it('keeps the generic timeline card for non-X providers', () => {
    mockFollowerChannels = [
      { id: 'channel-1', identifier: 'mastodon', name: 'Mastodon', sorts: [] },
    ];

    render(<FollowerTimelineComponent />);

    expect(screen.queryByTestId('x-post')).toBeNull();
    expect(screen.getByText('Timeline tweet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View post' })).toBeTruthy();
  });
});

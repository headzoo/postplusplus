/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockOpenComposer = jest.fn();
const mockOpenExternalPost = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));
jest.mock('@gitroom/frontend/components/new-launch/use.open.composer', () => ({
  useOpenComposer: () => ({ openComposer: mockOpenComposer }),
}));
jest.mock(
  '@gitroom/frontend/components/external-post/open.external.post',
  () => ({
    isSafeHttpUrl: (url: string) => /^https?:\/\//.test(url),
    openExternalPost: mockOpenExternalPost,
  })
);

const { XConversationCard } =
  require('./x.conversation.card') as typeof import('./x.conversation.card');

const props = {
  conversation: {
    id: 'event-1',
    type: 'mention' as const,
    eventAt: '2026-08-28T12:00:00.000Z',
    provider: 'x',
    channel: { id: 'channel-1', name: 'Post++', username: 'postplusplus' },
    actor: { externalId: 'author-1', name: 'Jane Doe', username: 'jane' },
    snapshotState: 'complete' as const,
    actions: {
      likeUrl: 'https://x.com/intent/like?tweet_id=1',
      replyUrl: 'https://x.com/intent/post?in_reply_to=1',
      canRepost: true,
      canQuote: true,
    },
    post: {
      externalId: '1',
      url: 'https://x.com/jane/status/1',
      content: 'Hello @postplusplus #social https://example.com',
      publishedAt: '2026-08-28T12:00:00.000Z',
      author: { externalId: 'author-1', name: 'Jane Doe', username: 'jane' },
      version: 1,
      completeness: 'complete' as const,
    },
  },
  integration: {
    id: 'channel-1',
    name: 'Post++',
    inBetweenSteps: false,
    editor: 'normal' as const,
    display: 'Post++',
    identifier: 'x',
    type: 'social',
    picture: '',
    changeProfilePicture: false,
    additionalSettings: '',
    changeNickName: false,
    time: [],
  },
  reposting: false,
  reposted: false,
  onRepost: jest.fn().mockResolvedValue(undefined),
};

describe('XConversationCard', () => {
  beforeEach(() => {
    mockOpenComposer.mockReset();
    mockOpenExternalPost.mockReset();
    props.onRepost.mockClear();
  });

  it('opens provider action URLs in the shared post tab', () => {
    render(<XConversationCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(mockOpenExternalPost).toHaveBeenNthCalledWith(
      1,
      'https://x.com/intent/like?tweet_id=1'
    );
    expect(mockOpenExternalPost).toHaveBeenNthCalledWith(
      2,
      'https://x.com/intent/post?in_reply_to=1'
    );
  });

  it('renders safe links for URLs, mentions, and hashtags', () => {
    render(<XConversationCard {...props} />);

    fireEvent.click(screen.getByRole('link', { name: 'https://example.com' }));
    fireEvent.click(screen.getByRole('link', { name: '@postplusplus' }));
    fireEvent.click(screen.getByRole('link', { name: '#social' }));

    expect(mockOpenExternalPost).toHaveBeenCalledWith('https://example.com');
    expect(mockOpenExternalPost).toHaveBeenCalledWith(
      'https://x.com/postplusplus'
    );
    expect(mockOpenExternalPost).toHaveBeenCalledWith(
      'https://x.com/hashtag/social'
    );
  });

  it('opens the composer with the selected channel and quote reference', () => {
    render(<XConversationCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Quote' }));

    expect(mockOpenComposer).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedChannels: ['channel-1'],
        focusedChannel: 'channel-1',
        initialPostReference: expect.objectContaining({
          providerIdentifier: 'x',
          externalId: '1',
        }),
      })
    );
  });

  it('hides quote when the API does not permit it', () => {
    render(
      <XConversationCard
        {...props}
        conversation={{
          ...props.conversation,
          actions: { ...props.conversation.actions, canQuote: false },
        }}
      />
    );

    expect(screen.queryByRole('button', { name: 'Quote' })).toBeNull();
  });

  it('runs the direct repost mutation', () => {
    render(<XConversationCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Repost' }));

    expect(props.onRepost).toHaveBeenCalledTimes(1);
  });

  it('shows a disabled repost action with the provider reason', () => {
    render(
      <XConversationCard
        {...props}
        conversation={{
          ...props.conversation,
          actions: {
            canRepost: false,
            repostReason: 'You cannot repost your own post',
          },
        }}
      />
    );

    const repost = screen.getByRole('button', { name: 'Repost' });
    expect(repost.disabled).toBe(true);
    expect(repost.title).toBe('You cannot repost your own post');
  });

  it('keeps repost disabled after a successful repost', () => {
    render(<XConversationCard {...props} reposted />);

    expect(screen.getByRole('button', { name: 'Reposted' }).disabled).toBe(
      true
    );
  });
});

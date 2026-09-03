/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

const mockHydrate = jest.fn();
const mockRepost = jest.fn();
const mockMutate = jest.fn();
const mockUseConversations = jest.fn();
const mockGetRenderer = jest.fn();
const mockSupportsProvider = jest.fn();
const mockShowToast = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockShowToast }),
}));
jest.mock('@gitroom/react/form/button', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div>Loading</div>,
}));
jest.mock('@gitroom/frontend/components/launches/channels.sidebar', () => ({
  ChannelsSidebar: ({
    children,
  }: {
    children: (collapsed: boolean) => React.ReactNode;
  }) => <div>{children(false)}</div>,
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
}));
jest.mock('@gitroom/frontend/components/launches/helpers/last-channel', () => ({
  setLastChannelId: jest.fn(),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({
      data: [
        {
          id: 'channel-1',
          name: 'X Channel',
          disabled: false,
          inBetweenSteps: false,
          editor: 'normal',
          display: 'X Channel',
          identifier: 'x',
          type: 'social',
          picture: '',
          changeProfilePicture: false,
          additionalSettings: '',
          changeNickName: false,
          time: [],
        },
        {
          id: 'channel-2',
          name: 'Other Channel',
          disabled: false,
          inBetweenSteps: false,
          editor: 'normal',
          display: 'Other Channel',
          identifier: 'linkedin',
          type: 'social',
          picture: '',
          changeProfilePicture: false,
          additionalSettings: '',
          changeNickName: false,
          time: [],
        },
      ],
    }),
  })
);
jest.mock(
  '@gitroom/frontend/components/conversations/use.conversations',
  () => ({
    useConversations: (params: unknown) => mockUseConversations(params),
    useConversationMutations: () => ({
      hydrate: mockHydrate,
      repost: mockRepost,
    }),
  })
);
jest.mock(
  '@gitroom/frontend/components/conversations/conversation.provider.renderers',
  () => ({
    getConversationProviderRenderer: (provider: string) =>
      mockGetRenderer(provider),
    supportsConversationProvider: (provider: string) =>
      mockSupportsProvider(provider),
  })
);

const { ConversationsComponent } =
  require('./conversations.component') as typeof import('./conversations.component');

const conversation = {
  id: 'event-1',
  type: 'mention' as const,
  eventAt: '2026-08-28T12:00:00.000Z',
  provider: 'x',
  channel: { id: 'channel-1', name: 'X Channel' },
  actor: { externalId: 'actor-1', name: 'Jane Doe' },
  snapshotState: 'partial' as const,
  actions: { canRepost: true, canQuote: true },
  post: {
    externalId: 'post-1',
    url: 'https://x.com/jane/status/1',
    content: 'Hello',
    publishedAt: '2026-08-28T12:00:00.000Z',
    author: { externalId: 'actor-1', name: 'Jane Doe' },
    version: 1,
    completeness: 'complete' as const,
  },
};

const TestRenderer = ({
  conversation: item,
  reposting,
  reposted,
  onRepost,
}: {
  conversation: typeof conversation;
  reposting: boolean;
  reposted: boolean;
  onRepost: () => Promise<void>;
}) => (
  <article>
    <p>Rendered {item.id}</p>
    <button type="button" disabled={reposting || reposted} onClick={onRepost}>
      {reposting ? 'Reposting…' : reposted ? 'Reposted' : 'Repost'}
    </button>
  </article>
);

describe('ConversationsComponent', () => {
  beforeEach(() => {
    mockHydrate.mockReset().mockResolvedValue(undefined);
    mockRepost.mockReset().mockResolvedValue({ status: 'reposted' });
    mockMutate.mockReset();
    mockShowToast.mockReset();
    mockUseConversations.mockReset();
    mockGetRenderer
      .mockReset()
      .mockImplementation((provider) =>
        provider === 'x' ? TestRenderer : undefined
      );
    mockSupportsProvider
      .mockReset()
      .mockImplementation((provider) => provider === 'x');
    mockUseConversations.mockReturnValue({
      data: { items: [conversation] },
      isLoading: false,
      error: undefined,
      mutate: mockMutate,
    });
  });

  it('dispatches to a provider renderer, falls back safely, and hydrates partial snapshots once', async () => {
    mockUseConversations.mockReturnValue({
      data: {
        items: [
          conversation,
          {
            ...conversation,
            id: 'event-unknown',
            provider: 'unknown',
            snapshotState: 'complete',
            channel: { id: 'channel-2', name: 'Unknown Channel' },
          },
        ],
      },
      isLoading: false,
      error: undefined,
      mutate: mockMutate,
    });

    const view = render(<ConversationsComponent />);
    await act(async () => undefined);

    expect(screen.getByText('Rendered event-1')).toBeTruthy();
    expect(
      screen.getByText('This conversation cannot be displayed yet.')
    ).toBeTruthy();
    expect(mockGetRenderer).toHaveBeenCalledWith('x');
    expect(mockGetRenderer).toHaveBeenCalledWith('unknown');
    expect(mockHydrate).toHaveBeenCalledWith(['event-1']);

    view.rerender(<ConversationsComponent />);
    await act(async () => undefined);
    expect(mockHydrate).toHaveBeenCalledTimes(1);
  });

  it('distinguishes unsupported channels from an empty inbox', () => {
    mockSupportsProvider.mockReturnValue(false);
    mockUseConversations.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      error: undefined,
      mutate: mockMutate,
    });

    render(<ConversationsComponent />);

    expect(screen.getByText('No conversation channels yet')).toBeTruthy();
    expect(screen.queryByText('No conversations yet.')).toBeNull();
  });

  it('shows an empty inbox when supported channels exist', () => {
    mockUseConversations.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      error: undefined,
      mutate: mockMutate,
    });

    render(<ConversationsComponent />);

    expect(screen.getByText('No conversations yet.')).toBeTruthy();
    expect(screen.queryByText('No conversation channels yet')).toBeNull();
  });

  it('moves through cursor pagination', () => {
    mockUseConversations.mockReturnValue({
      data: { items: [conversation], nextCursor: 'cursor-2' },
      isLoading: false,
      error: undefined,
      mutate: mockMutate,
    });

    render(<ConversationsComponent />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(mockUseConversations).toHaveBeenLastCalledWith({
      integrationId: undefined,
      cursor: 'cursor-2',
      limit: 20,
    });
    expect(screen.getByRole('button', { name: 'Previous' })).toBeTruthy();
  });

  it('toggles channel filter from the sidebar', () => {
    render(<ConversationsComponent />);

    expect(mockUseConversations).toHaveBeenLastCalledWith({
      integrationId: undefined,
      cursor: undefined,
      limit: 20,
    });

    fireEvent.click(screen.getByRole('button', { name: 'X Channel' }));
    expect(mockUseConversations).toHaveBeenLastCalledWith({
      integrationId: 'channel-1',
      cursor: undefined,
      limit: 20,
    });

    fireEvent.click(screen.getByRole('button', { name: 'X Channel' }));
    expect(mockUseConversations).toHaveBeenLastCalledWith({
      integrationId: undefined,
      cursor: undefined,
      limit: 20,
    });
  });

  it('keeps the repost action in flight until its mutation resolves', async () => {
    let resolveRepost: () => void;
    mockRepost.mockReturnValue(
      new Promise<{ status: string }>((resolve) => {
        resolveRepost = () => resolve({ status: 'reposted' });
      })
    );

    render(<ConversationsComponent />);
    fireEvent.click(screen.getByRole('button', { name: 'Repost' }));

    expect(mockRepost).toHaveBeenCalledWith('event-1');
    expect(screen.getByRole('button', { name: 'Reposting…' }).disabled).toBe(
      true
    );

    await act(async () => {
      resolveRepost!();
    });
    expect(screen.getByRole('button', { name: 'Reposted' }).disabled).toBe(
      true
    );
  });

  it('surfaces repost failures without unhandled rejections', async () => {
    mockRepost.mockRejectedValue(new Error('You cannot repost your own post'));

    render(<ConversationsComponent />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Repost' }));
    });

    expect(mockShowToast).toHaveBeenCalledWith(
      'You cannot repost your own post',
      'warning'
    );
    expect(screen.getByRole('button', { name: 'Repost' })).toBeTruthy();
  });
});

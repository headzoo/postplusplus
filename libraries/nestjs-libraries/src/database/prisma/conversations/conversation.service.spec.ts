jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));

import { ConversationService } from './conversation.service';

const event = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'event-a',
    integrationId: 'integration-a',
    kind: 'MENTION',
    eventAt: new Date('2026-08-28T12:00:00.000Z'),
    counterpartyExternalId: 'actor-a',
    relatedObjectId: 'post-a',
    metadata: { referenceType: 'quote' },
    postSnapshot: {
      externalId: 'post-a',
      url: 'https://x.com/alice/status/post-a',
      content: 'Hello',
      publishedAt: '2026-08-28T12:00:00.000Z',
      author: { externalId: 'actor-a', username: 'alice' },
      version: 1,
      completeness: 'complete',
    },
    integration: {
      id: 'integration-a',
      providerIdentifier: 'x',
      name: 'X channel',
      profile: 'channel',
      picture: null,
      token: 'oauth1-token:oauth1-secret',
    },
    ...overrides,
  } as any);

describe('ConversationService', () => {
  const repository = {
    list: jest.fn(),
    findOwned: jest.fn(),
    findOwnedMany: jest.fn(),
    updateSnapshot: jest.fn(),
  };
  const capability = {
    supported: { kinds: ['mention', 'repost'], actions: { repost: true } },
    eligibility: jest.fn(() => ({
      likeUrl: 'https://x.com/alice/status/post-a',
      replyUrl: 'https://x.com/intent/tweet?in_reply_to=post-a',
      canRepost: true,
      repostExternalId: 'post-a',
    })),
    getHydrationSourceExternalId: jest.fn(),
    hydrate: jest.fn(),
    repost: jest.fn(),
  };
  const manager = {
    getSocialIntegration: jest.fn(() => ({ conversations: capability })),
  };
  const validation = {
    validatePostSnapshot: jest.fn((snapshot) => snapshot),
  };
  const service = new ConversationService(
    repository as any,
    manager as any,
    validation as any
  );

  beforeEach(() => jest.clearAllMocks());

  it('serializes inbound quotes without exposing credentials', async () => {
    repository.list.mockResolvedValue({ events: [event()], next: undefined });

    await expect(service.list('org-a')).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'event-a',
          type: 'quote',
          provider: 'x',
          actor: { externalId: 'actor-a', username: 'alice' },
          snapshotState: 'complete',
        }),
      ],
      nextCursor: undefined,
    });
  });

  it('uses only the owning integration posting credential for reposts', async () => {
    repository.findOwned.mockResolvedValue(event());
    capability.repost.mockResolvedValue({
      status: 'reposted',
      remoteReleaseId: 'post-a',
    });

    await expect(service.repost('org-a', 'event-a')).resolves.toEqual({
      status: 'reposted',
      remoteReleaseId: 'post-a',
    });
    expect(capability.repost).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'integration-a' }),
      'oauth1-token:oauth1-secret',
      'post-a'
    );
  });

  it('blocks a repost that the provider disabled', async () => {
    repository.findOwned.mockResolvedValue(event());
    capability.eligibility.mockReturnValueOnce({
      canRepost: false,
      repostReason: 'You cannot repost your own post',
    });

    await expect(service.repost('org-a', 'event-a')).rejects.toThrow(
      'You cannot repost your own post'
    );
    expect(capability.repost).not.toHaveBeenCalled();
  });

  it('hydrates a snapshotless event only through a provider-derived source ID', async () => {
    repository.findOwnedMany
      .mockResolvedValueOnce([
        event({
          postSnapshot: null,
          metadata: {},
          relatedObjectId: 'source-a',
        }),
      ])
      .mockResolvedValueOnce([event()]);
    capability.getHydrationSourceExternalId.mockReturnValueOnce('source-a');
    capability.hydrate.mockResolvedValue([
      { eventId: 'event-a', postSnapshot: event().postSnapshot },
    ]);

    await expect(service.hydrate('org-a', ['event-a'])).resolves.toEqual({
      items: [expect.objectContaining({ id: 'event-a' })],
    });
    expect(capability.hydrate).toHaveBeenCalledWith(
      expect.anything(),
      'oauth1-token:oauth1-secret',
      [{ eventId: 'event-a', externalPostId: 'source-a' }]
    );
    expect(repository.updateSnapshot).toHaveBeenCalledWith(
      'org-a',
      'event-a',
      expect.objectContaining({ externalId: 'post-a' })
    );
  });

  it('does not return malformed stored snapshots', async () => {
    validation.validatePostSnapshot.mockImplementationOnce(() => {
      throw new Error('invalid URL');
    });
    repository.list.mockResolvedValue({
      events: [event({ postSnapshot: { url: 'javascript:alert(1)' } })],
      next: undefined,
    });

    await expect(service.list('org-a')).resolves.toEqual({
      items: [
        expect.objectContaining({
          post: undefined,
          snapshotState: 'missing',
          actions: { canRepost: false },
        }),
      ],
      nextCursor: undefined,
    });
  });
});

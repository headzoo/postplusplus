import { XProvider } from './x.provider';

describe('XProvider quote post references', () => {
  const integration = {
    id: 'integration-1',
    profile: 'postplusplus',
  } as any;

  it('carries a root quote reference through pending publication and sends it to X', async () => {
    const provider = new XProvider();
    (provider as any).getClient = jest.fn().mockResolvedValue({});
    (provider as any).uploadMediaEntries = jest.fn().mockResolvedValue({
      media: { root: [] },
      processingIds: [],
    });

    const [pending] = await provider.postPending(
      'user',
      'token:secret',
      [
        {
          id: 'root',
          message: 'A quoted status',
          settings: { post_type: 'post' },
          reference: {
            type: 'quote',
            providerIdentifier: 'x',
            externalId: '123456789',
          },
        },
      ],
      integration
    );

    expect(pending.pendingData.quoteTweetId).toBe('123456789');

    const fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({ data: { id: 'new-tweet' } }),
    });
    (provider as any).fetch = fetch;

    await provider.finalizePost(
      'token:secret',
      {
        ...pending.pendingData,
        attempting: true,
        confirmed: true,
      },
      integration
    );

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({ quote_tweet_id: '123456789' })
    );
  });

  it('rejects quote references for X articles and threads', () => {
    const provider = new XProvider();
    const reference = {
      type: 'quote' as const,
      providerIdentifier: 'x',
      externalId: '123456789',
    };

    expect(
      provider.validatePostReference(reference, {
        settings: { post_type: 'article' },
        value: [{ reference }],
      })
    ).toBe('X articles cannot quote a post');
    expect(
      provider.validatePostReference(reference, {
        settings: {},
        value: [{ reference }, {}],
      })
    ).toBe('X quote posts cannot be part of a thread');
  });

  it('uses the underlying repost target and disables self reposts', () => {
    const provider = new XProvider();
    const postSnapshot = {
      externalId: 'repost-status',
      url: 'https://x.com/actor/status/repost-status',
      content: 'Reposted',
      publishedAt: '2026-08-28T12:00:00.000Z',
      author: { externalId: 'actor' },
      repostedPost: {
        externalId: 'original-status',
        url: 'https://x.com/channel/status/original-status',
        content: 'Original',
        publishedAt: '2026-08-28T11:00:00.000Z',
        author: { externalId: 'channel-account' },
      },
      version: 1,
      completeness: 'complete' as const,
    };

    expect(
      provider.conversations.eligibility({
        integration: { internalId: 'channel-account' } as any,
        event: { kind: 'repost' },
        postSnapshot,
      })
    ).toEqual(
      expect.objectContaining({
        canRepost: false,
        repostReason: 'You cannot repost your own post',
        canQuote: true,
      })
    );

    expect(
      provider.conversations.eligibility({
        integration: { internalId: 'another-account' } as any,
        event: { kind: 'repost' },
        postSnapshot,
      })
    ).toEqual(
      expect.objectContaining({
        canRepost: true,
        repostExternalId: 'original-status',
        canQuote: true,
      })
    );
  });

  it('only derives hydration identities for plain mentions', () => {
    const provider = new XProvider();

    expect(
      provider.conversations.getHydrationSourceExternalId({
        kind: 'mention',
        relatedObjectId: 'source-status',
      })
    ).toBe('source-status');
    expect(
      provider.conversations.getHydrationSourceExternalId({
        kind: 'mention',
        relatedObjectId: 'quoted-status',
        metadata: { referenceType: 'quote' },
      })
    ).toBeUndefined();
    expect(
      provider.conversations.getHydrationSourceExternalId({
        kind: 'repost',
        relatedObjectId: 'original-status',
      })
    ).toBeUndefined();
  });
});

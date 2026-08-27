import { createHmac } from 'crypto';
import { XProvider } from '@gitroom/nestjs-libraries/integrations/social/x.provider';

const originalEnv = process.env;

const user = (id: string, username = `user${id}`) => ({
  id,
  name: `User ${id}`,
  username,
  profile_image_url: `https://images.x.example/${id}.jpg`,
});

const signedRequest = (data: unknown, secret = 'consumer-secret') => {
  const rawBody = Buffer.from(JSON.stringify({ data }));
  return {
    rawBody,
    headers: {
      'x-twitter-webhooks-signature': `sha256=${createHmac('sha256', secret)
        .update(rawBody)
        .digest('base64')}`,
    },
  };
};

const activity = (
  eventType: string,
  payload: unknown,
  options: {
    eventUuid?: string;
    direction?: 'inbound' | 'outbound';
    includes?: Record<string, unknown>;
  } = {}
) => ({
  event_uuid: options.eventUuid || '2080761390344937796',
  event_type: eventType,
  filter: {
    user_id: '42',
    ...(options.direction ? { direction: options.direction } : {}),
  },
  payload,
  includes: options.includes || {},
});

const endpointResponse = () =>
  new Response(
    JSON.stringify({
      data: [
        {
          id: '123',
          url: process.env.X_WEBHOOK_CALLBACK_URL,
          valid: true,
        },
      ],
    }),
    { status: 200 }
  );

describe('XProvider interaction webhooks', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      X_API_KEY: 'consumer-key',
      X_API_SECRET: 'consumer-secret',
      X_WEBHOOK_BEARER_TOKEN: 'app-bearer',
      X_WEBHOOK_CALLBACK_URL: 'https://postiz.example/api/channel-webhooks/x',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('answers bounded CRC challenges and verifies signatures before parsing', async () => {
    const capability = new XProvider().channelInteractionWebhooks;
    await expect(
      capability.verifyChallenge({ query: { crc_token: 'challenge' } })
    ).resolves.toEqual({
      accepted: true,
      responseBody: {
        response_token: `sha256=${createHmac('sha256', 'consumer-secret')
          .update('challenge')
          .digest('base64')}`,
      },
    });

    const rawBody = Buffer.from('{ definitely-not-json');
    await expect(
      capability.verifyAndNormalizeDelivery({
        rawBody,
        headers: {
          'x-twitter-webhooks-signature':
            'sha256=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        },
      })
    ).resolves.toEqual({ accepted: false, statusCode: 401 });
  });

  it('normalizes documented like and follow envelopes', async () => {
    const capability = new XProvider().channelInteractionWebhooks;
    const like = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'like.create',
          {
            id: 'like-1',
            timestamp_ms: '1704067200000',
            liked_tweet_author_id: '8',
            liked_tweet_id: 'post-1',
          },
          {
            direction: 'outbound',
            eventUuid: 'event-like',
            includes: { users: [user('8')] },
          }
        )
      )
    );
    expect(like).toMatchObject({
      accepted: true,
      connectedAccountId: '42',
      events: [
        {
          kind: 'like',
          direction: 'outbound',
          counterparty: { externalId: '8' },
          relatedObjectId: 'post-1',
          eventType: 'like.create',
        },
      ],
    });

    const follow = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'follow.unfollow',
          {
            source: { data: user('9') },
            target: { data: user('42') },
          },
          { eventUuid: 'event-unfollow' }
        )
      )
    );
    expect(follow).toMatchObject({
      accepted: true,
      events: [
        {
          kind: 'follow',
          direction: 'inbound',
          counterparty: { externalId: '9' },
          membershipUpdate: 'not_follower',
          eventType: 'follow.unfollow',
        },
      ],
    });
  });

  it('uses explicit v2 post references for replies and reposts', async () => {
    const capability = new XProvider().channelInteractionWebhooks;
    const reply = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'post.mention.create',
          {
            id: 'reply-in',
            author_id: '7',
            conversation_id: 'conversation-1',
            created_at: '2024-01-01T00:00:00.000Z',
            referenced_tweets: [{ type: 'replied_to', id: 'parent' }],
            entities: { mentions: [{ id: '42', username: 'connected' }] },
          },
          {
            eventUuid: 'event-reply',
            includes: {
              users: [user('7'), user('42', 'connected')],
              tweets: [{ id: 'parent', author_id: '42' }],
            },
          }
        )
      )
    );
    expect(reply).toMatchObject({
      accepted: true,
      events: [
        {
          kind: 'reply',
          direction: 'inbound',
          counterparty: { externalId: '7' },
          relatedObjectId: 'parent',
          conversationExternalId: 'conversation-1',
          eventType: 'post.mention.create',
        },
      ],
    });

    const repost = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'post.create',
          {
            id: 'repost-out',
            author_id: '42',
            created_at: '2024-01-01T00:00:01.000Z',
            referenced_tweets: [{ type: 'retweeted', id: 'original' }],
          },
          {
            eventUuid: 'event-repost',
            includes: {
              users: [user('42'), user('8')],
              tweets: [{ id: 'original', author_id: '8' }],
            },
          }
        )
      )
    );
    expect(repost).toMatchObject({
      accepted: true,
      events: [
        {
          kind: 'repost',
          direction: 'outbound',
          counterparty: { externalId: '8' },
          relatedObjectId: 'original',
          metadata: { referenceType: 'repost' },
          eventType: 'post.create',
        },
      ],
    });
  });

  it('normalizes inbound reposts delivered on the dedicated repost event', async () => {
    const capability = new XProvider().channelInteractionWebhooks;
    const repost = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'post.repost.create',
          {
            id: 'repost-in',
            author_id: '8',
            created_at: '2024-01-01T00:00:02.000Z',
            referenced_tweets: [{ type: 'retweeted', id: 'original' }],
          },
          {
            direction: 'inbound',
            eventUuid: 'event-repost-in',
            includes: {
              users: [user('8'), user('42')],
              tweets: [{ id: 'original', author_id: '42' }],
            },
          }
        )
      )
    );
    expect(repost).toMatchObject({
      accepted: true,
      connectedAccountId: '42',
      events: [
        {
          kind: 'repost',
          direction: 'inbound',
          counterparty: { externalId: '8' },
          relatedObjectId: 'original',
          metadata: { referenceType: 'repost' },
          eventType: 'post.repost.create',
        },
      ],
    });
  });

  it('normalizes inbound replies and quotes delivered on dedicated events', async () => {
    const capability = new XProvider().channelInteractionWebhooks;
    const reply = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'post.reply.create',
          {
            id: 'reply-in',
            author_id: '7',
            created_at: '2024-01-01T00:00:03.000Z',
            referenced_tweets: [{ type: 'replied_to', id: 'parent' }],
          },
          {
            direction: 'inbound',
            eventUuid: 'event-reply-dedicated',
            includes: {
              users: [user('7'), user('42')],
              tweets: [{ id: 'parent', author_id: '42' }],
            },
          }
        )
      )
    );
    expect(reply).toMatchObject({
      accepted: true,
      events: [
        {
          kind: 'reply',
          direction: 'inbound',
          counterparty: { externalId: '7' },
          relatedObjectId: 'parent',
          eventType: 'post.reply.create',
        },
      ],
    });

    const quote = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'post.quote.create',
          {
            id: 'quote-in',
            author_id: '8',
            created_at: '2024-01-01T00:00:04.000Z',
            referenced_tweets: [{ type: 'quoted', id: 'original' }],
          },
          {
            direction: 'inbound',
            eventUuid: 'event-quote-in',
            includes: {
              users: [user('8'), user('42')],
              tweets: [{ id: 'original', author_id: '42' }],
            },
          }
        )
      )
    );
    expect(quote).toMatchObject({
      accepted: true,
      events: [
        {
          kind: 'mention',
          direction: 'inbound',
          counterparty: { externalId: '8' },
          relatedObjectId: 'original',
          metadata: { referenceType: 'quote' },
          eventType: 'post.quote.create',
        },
      ],
    });
  });

  it('imports standalone outbound posts and marks platform deletes', async () => {
    const capability = new XProvider().channelInteractionWebhooks;
    const created = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'post.create',
          {
            id: 'original-out',
            author_id: '42',
            text: 'Posted on X',
            created_at: '2024-01-01T00:00:00.000Z',
          },
          {
            eventUuid: 'event-original',
            includes: { users: [user('42', 'connected')] },
          }
        )
      )
    );
    expect(created).toMatchObject({
      accepted: true,
      events: [],
      contentEvents: [
        {
          type: 'post.upsert',
          externalId: 'original-out',
          url: 'https://twitter.com/connected/status/original-out',
          content: 'Posted on X',
          publishedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });

    const mentioned = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'post.create',
          {
            id: 'mention-out',
            author_id: '42',
            text: 'Hello @other',
            created_at: '2024-01-01T00:00:02.000Z',
            entities: { mentions: [{ id: '7', username: 'other' }] },
          },
          {
            eventUuid: 'event-mention-out',
            includes: { users: [user('42', 'connected'), user('7', 'other')] },
          }
        )
      )
    );
    expect(mentioned).toMatchObject({
      accepted: true,
      events: [
        {
          kind: 'mention',
          direction: 'outbound',
          counterparty: { externalId: '7' },
        },
      ],
      contentEvents: [{ type: 'post.upsert', externalId: 'mention-out' }],
    });

    const deleted = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'post.delete',
          {
            id: 'original-out',
            author_id: '42',
            timestamp_ms: '1704067200000',
          },
          { eventUuid: 'event-delete' }
        )
      )
    );
    expect(deleted).toMatchObject({
      accepted: true,
      events: [],
      contentEvents: [
        {
          type: 'post.delete',
          externalId: 'original-out',
          deletedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('does not import replies, reposts, or quotes onto the calendar', async () => {
    const capability = new XProvider().channelInteractionWebhooks;
    const reply = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'post.create',
          {
            id: 'reply-out',
            author_id: '42',
            text: 'A reply',
            created_at: '2024-01-01T00:00:00.000Z',
            referenced_tweets: [{ type: 'replied_to', id: 'parent' }],
          },
          {
            eventUuid: 'event-reply-out',
            includes: {
              users: [user('42'), user('8')],
              tweets: [{ id: 'parent', author_id: '8' }],
            },
          }
        )
      )
    );
    expect(reply.accepted && reply.contentEvents).toEqual([]);

    const quote = await capability.verifyAndNormalizeDelivery(
      signedRequest(
        activity(
          'post.create',
          {
            id: 'quote-out',
            author_id: '42',
            text: 'A quote',
            created_at: '2024-01-01T00:00:00.000Z',
            referenced_tweets: [{ type: 'quoted', id: 'quoted' }],
          },
          {
            eventUuid: 'event-quote-out',
            includes: { users: [user('42')] },
          }
        )
      )
    );
    expect(quote.accepted && quote.contentEvents).toEqual([]);
  });

  it('normalizes mentions, ignores quotes as reposts, and keys by event_uuid', async () => {
    const capability = new XProvider().channelInteractionWebhooks;
    const envelope = activity(
      'post.mention.create',
      {
        id: 'mention-in',
        author_id: '7',
        created_at: '2024-01-01T00:00:00.000Z',
        referenced_tweets: [{ type: 'quoted', id: 'quoted' }],
        entities: { mentions: [{ id: '42', username: 'connected' }] },
      },
      {
        eventUuid: 'stable-event',
        includes: { users: [user('7'), user('42', 'connected')] },
      }
    );
    const first = await capability.verifyAndNormalizeDelivery(
      signedRequest(envelope)
    );
    const duplicate = await capability.verifyAndNormalizeDelivery(
      signedRequest(envelope)
    );
    expect(first).toMatchObject({
      accepted: true,
      events: [{ kind: 'mention', direction: 'inbound' }],
      contentEvents: [],
    });
    expect(first.accepted && first.events[0].providerEventKey).toBe(
      duplicate.accepted && duplicate.events[0].providerEventKey
    );
  });

  it('rejects malformed and oversized verified Activity API envelopes', async () => {
    const capability = new XProvider().channelInteractionWebhooks;
    await expect(
      capability.verifyAndNormalizeDelivery(
        signedRequest({
          event_type: 'like.create',
          filter: { user_id: '42', direction: 'outbound' },
          payload: [],
        })
      )
    ).resolves.toEqual({ accepted: false, statusCode: 400 });

    const rawBody = Buffer.alloc(1024 * 1024 + 1, 0x20);
    await expect(
      capability.verifyAndNormalizeDelivery({
        rawBody,
        headers: {
          'x-twitter-webhooks-signature': `sha256=${createHmac(
            'sha256',
            'consumer-secret'
          )
            .update(rawBody)
            .digest('base64')}`,
        },
      })
    ).resolves.toEqual({ accepted: false, statusCode: 413 });
  });

  it('declares documented remote records and full repost coverage', () => {
    const capability = new XProvider().channelInteractionWebhooks;
    expect(capability.getDesiredSubscriptions({} as any)).toEqual([
      { eventKey: 'like.create', direction: 'inbound' },
      { eventKey: 'follow.follow', direction: 'inbound' },
      { eventKey: 'follow.unfollow', direction: 'inbound' },
      { eventKey: 'post.create', direction: 'outbound' },
      { eventKey: 'post.delete', direction: 'outbound' },
      { eventKey: 'post.mention.create', direction: 'inbound' },
      { eventKey: 'post.repost.create', direction: 'inbound' },
      { eventKey: 'post.reply.create', direction: 'inbound' },
      { eventKey: 'post.quote.create', direction: 'inbound' },
    ]);
    expect(capability.getInteractionCoverage()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'repost',
          inbound: 'supported',
          outbound: 'unsupported',
        }),
      ])
    );
  });

  it('lists and reuses per-event subscriptions by subscription ID', async () => {
    const provider = new XProvider();
    const subscriptions = [
      ['like.create', undefined],
      ['follow.follow', undefined],
      ['follow.unfollow', undefined],
      ['post.create', undefined],
      ['post.delete', undefined],
      ['post.mention.create', undefined],
      ['post.repost.create', undefined],
      ['post.reply.create', undefined],
      ['post.quote.create', undefined],
    ].map(([eventType, direction], index) => ({
      subscription_id: String(index + 1),
      event_type: eventType,
      filter: { user_id: '42', ...(direction ? { direction } : {}) },
      webhook_id: '123',
      tag: `postiz:42:${eventType}:${
        eventType === 'post.create' ||
        eventType === 'post.delete' ||
        direction === 'outbound'
          ? 'outbound'
          : 'inbound'
      }`,
    }));
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url) =>
        String(url).endsWith('/2/webhooks')
          ? endpointResponse()
          : new Response(JSON.stringify({ data: subscriptions, meta: {} }), {
              status: 200,
            })
      );

    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret'
      )
    ).resolves.toMatchObject({
      state: 'active',
      subscriptions: expect.arrayContaining([
        expect.objectContaining({ remoteIdentifier: '1', state: 'active' }),
      ]),
    });
    expect(
      fetchMock.mock.calls.filter(([, options]) =>
        ['POST', 'PUT', 'DELETE'].includes(
          String((options as RequestInit).method)
        )
      )
    ).toHaveLength(0);
  });

  it('creates, updates, deduplicates, and deletes subscriptions by ID', async () => {
    const provider = new XProvider();
    let createdId = 100;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, options) => {
        const value = String(url);
        const method = options?.method || 'GET';
        if (value.endsWith('/2/webhooks')) return endpointResponse();
        if (method === 'GET') {
          return new Response(
            JSON.stringify({
              data: [
                {
                  subscription_id: 'duplicate-a',
                  event_type: 'follow.follow',
                  filter: { user_id: '42' },
                  webhook_id: 'old',
                },
                {
                  subscription_id: 'duplicate-b',
                  event_type: 'follow.follow',
                  filter: { user_id: '42' },
                  webhook_id: '123',
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (method === 'POST') {
          return new Response(
            JSON.stringify({
              data: { subscription_id: String(createdId++) },
            }),
            { status: 200 }
          );
        }
        if (method === 'PUT') {
          return new Response(
            JSON.stringify({
              data: { subscription_id: value.split('/').pop() },
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ data: { deleted: true } }), {
          status: 200,
        });
      });

    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret',
        'tracking-oauth2'
      )
    ).resolves.toMatchObject({ state: 'active' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/activity\/subscriptions\/duplicate-b$/),
      expect.objectContaining({ method: 'DELETE' })
    );
    // The surviving subscription is attached to a stale webhook. Rather than a
    // tag-bearing PUT (which resets delivery to "Stream only"), reconciliation
    // deletes it and recreates it with the current webhook attached.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/activity\/subscriptions\/duplicate-a$/),
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          String(url).endsWith('/activity/subscriptions') &&
          options?.method === 'POST' &&
          String((options as RequestInit).body).includes(
            '"event_type":"follow.follow"'
          ) &&
          String((options as RequestInit).body).includes('"webhook_id":"123"')
      )
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([, options]) => options?.method === 'PUT')
    ).toBe(false);

    fetchMock.mockClear();
    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: true, deletedAt: null } as any,
        'access:secret',
        'tracking-oauth2'
      )
    ).resolves.toMatchObject({ state: 'unconfigured' });
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          String(url).includes('/activity/subscriptions/duplicate-a') &&
          options?.method === 'DELETE'
      )
    ).toBe(true);
  });

  it('continues creating remaining event types after one subscription is rejected', async () => {
    const provider = new XProvider();
    const posted: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const value = String(url);
      const method = options?.method || 'GET';
      if (value.endsWith('/2/webhooks')) return endpointResponse();
      if (method === 'GET') {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (method === 'POST') {
        const body = JSON.parse(String(options?.body || '{}'));
        posted.push(body.event_type);
        if (body.event_type === 'like.create') {
          return new Response('usage-capped: private detail', { status: 429 });
        }
        return new Response(
          JSON.stringify({ data: { subscription_id: `new-${posted.length}` } }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ data: { deleted: true } }), {
        status: 200,
      });
    });

    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret',
        'tracking-oauth2'
      )
    ).resolves.toMatchObject({
      state: 'partial',
      subscriptions: expect.arrayContaining([
        expect.objectContaining({
          eventKey: 'like.create',
          direction: 'inbound',
          state: 'error',
          failureCategory: 'quota',
        }),
        expect.objectContaining({
          eventKey: 'post.create',
          state: 'active',
        }),
        expect.objectContaining({
          eventKey: 'post.delete',
          state: 'active',
        }),
        expect.objectContaining({
          eventKey: 'post.mention.create',
          state: 'active',
        }),
      ]),
    });
    expect(posted).toEqual([
      'like.create',
      'follow.follow',
      'follow.unfollow',
      'post.create',
      'post.delete',
      'post.mention.create',
      'post.repost.create',
      'post.reply.create',
      'post.quote.create',
    ]);
  });

  it('recreates stream-only subscriptions with the Postiz webhook instead of a tag PUT', async () => {
    const provider = new XProvider();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, options) => {
        const value = String(url);
        const method = options?.method || 'GET';
        if (value.endsWith('/2/webhooks')) return endpointResponse();
        if (method === 'GET') {
          return new Response(
            '{"data":[{"subscription_id":2087621151899975680,"event_type":"follow.unfollow","filter":{"user_id":42},"tag":"postiz:42:follow.unfollow:inbound"}]}',
            { status: 200 }
          );
        }
        if (method === 'POST') {
          return new Response(
            JSON.stringify({
              data: {
                subscription_id: '2087621151899975681',
                webhook_id: '123',
              },
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ data: { deleted: true } }), {
          status: 200,
        });
      });

    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret',
        'tracking-oauth2'
      )
    ).resolves.toMatchObject({ state: 'active' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/activity\/subscriptions\/2087621151899975680$/),
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer app-bearer',
        }),
      })
    );
    const created = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith('/activity/subscriptions') &&
        options?.method === 'POST' &&
        String(options.body).includes('"event_type":"follow.unfollow"')
    );
    expect(created?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^OAuth /),
        }),
        body: expect.stringContaining('"webhook_id":"123"'),
      })
    );
    expect(
      fetchMock.mock.calls.some(([, options]) => options?.method === 'PUT')
    ).toBe(false);
  });

  it('creates follow subscriptions with user OAuth credentials', async () => {
    const provider = new XProvider();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, options) => {
        const value = String(url);
        const method = options?.method || 'GET';
        if (value.endsWith('/2/webhooks')) return endpointResponse();
        if (method === 'GET') {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        if (method === 'POST') {
          const body = JSON.parse(String(options?.body || '{}'));
          if (body.event_type === 'follow.follow') {
            expect((options as RequestInit).headers).toEqual(
              expect.objectContaining({
                Authorization: expect.stringMatching(/^OAuth /),
              })
            );
            return new Response(
              JSON.stringify({ data: { subscription_id: 'follow-1' } }),
              { status: 200 }
            );
          }
          return new Response(
            JSON.stringify({
              data: { subscription_id: `sub-${body.event_type}` },
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ data: { deleted: true } }), {
          status: 200,
        });
      });

    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret',
        'tracking-oauth2'
      )
    ).resolves.toMatchObject({
      state: 'active',
      subscriptions: expect.arrayContaining([
        expect.objectContaining({
          eventKey: 'follow.follow',
          direction: 'inbound',
          state: 'active',
          remoteIdentifier: 'follow-1',
        }),
      ]),
    });

    fetchMock.mockRestore();
  });

  it('creates like subscriptions with the tracking OAuth2 grant', async () => {
    const provider = new XProvider();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, options) => {
        const value = String(url);
        const method = options?.method || 'GET';
        if (value.endsWith('/2/webhooks')) return endpointResponse();
        if (method === 'GET') {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        const body = JSON.parse(String(options?.body || '{}'));
        return new Response(
          JSON.stringify({
            data: { subscription_id: `sub-${body.event_type}` },
          }),
          { status: 200 }
        );
      });

    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret',
        'tracking-oauth2'
      )
    ).resolves.toMatchObject({ state: 'active' });

    const created = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith('/activity/subscriptions') &&
        options?.method === 'POST' &&
        String(options.body).includes('"event_type":"like.create"')
    );
    expect(created?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer tracking-oauth2',
        }),
      })
    );

    fetchMock.mockRestore();
  });

  it('reports likes as unauthorized until tracking is authorized', async () => {
    const provider = new XProvider();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, options) => {
        const value = String(url);
        const method = options?.method || 'GET';
        if (value.endsWith('/2/webhooks')) return endpointResponse();
        if (method === 'GET') {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        const body = JSON.parse(String(options?.body || '{}'));
        return new Response(
          JSON.stringify({
            data: { subscription_id: `sub-${body.event_type}` },
          }),
          { status: 200 }
        );
      });

    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret'
      )
    ).resolves.toMatchObject({
      state: 'partial',
      subscriptions: expect.arrayContaining([
        expect.objectContaining({
          eventKey: 'like.create',
          state: 'error',
          failureCategory: 'authorization',
          reason: expect.stringContaining('authorize tracking'),
        }),
      ]),
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          String(url).endsWith('/activity/subscriptions') &&
          options?.method === 'POST' &&
          String(options.body).includes('"event_type":"like.create"')
      )
    ).toBe(false);

    fetchMock.mockRestore();
  });

  it('returns a sanitized scope classification', async () => {
    const provider = new XProvider();
    jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(async () => endpointResponse())
      .mockImplementationOnce(
        async () =>
          new Response('OAuth token requires like.read scope: secret-token', {
            status: 403,
          })
      );
    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret'
      )
    ).resolves.toMatchObject({
      state: 'error',
      subscriptions: expect.arrayContaining([
        expect.objectContaining({
          failureCategory: 'authorization',
          reason: expect.stringContaining('like.read'),
        }),
      ]),
    });
  });

  it('returns actionable follow scope guidance', async () => {
    const provider = new XProvider();
    jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(async () => endpointResponse())
      .mockImplementationOnce(
        async () =>
          new Response(
            'OAuth token requires follows.read scope: secret-token',
            {
              status: 403,
            }
          )
      );
    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret'
      )
    ).resolves.toMatchObject({
      state: 'error',
      subscriptions: expect.arrayContaining([
        expect.objectContaining({
          failureCategory: 'authorization',
          reason: expect.stringContaining('follows.read'),
        }),
      ]),
    });
  });

  it('returns a sanitized quota classification', async () => {
    const provider = new XProvider();
    jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(async () => endpointResponse())
      .mockImplementationOnce(
        async () =>
          new Response('usage-capped: private detail', { status: 429 })
      );
    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret'
      )
    ).resolves.toMatchObject({
      state: 'error',
      subscriptions: expect.arrayContaining([
        expect.objectContaining({ failureCategory: 'quota' }),
      ]),
    });
  });

  it('distinguishes unsupported subscription auth from revoked credentials', async () => {
    const provider = new XProvider();
    jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(async () => endpointResponse())
      .mockImplementationOnce(
        async () =>
          new Response('Unsupported Authentication: OAuth 2.0 required', {
            status: 401,
          })
      );
    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret'
      )
    ).resolves.toMatchObject({
      state: 'error',
      subscriptions: expect.arrayContaining([
        expect.objectContaining({
          failureCategory: 'authorization',
        }),
      ]),
    });
  });

  it('replaces a directional like subscription with a directionless one', async () => {
    const provider = new XProvider();
    let subscriptionList: any[] = [
      {
        subscription_id: 'like-inbound-only',
        event_type: 'like.create',
        filter: { user_id: '42', direction: 'inbound' },
        webhook_id: '123',
      },
    ];
    const deleted: string[] = [];
    let created = 0;

    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, options) => {
        const value = String(url);
        const method = options?.method || 'GET';
        if (value.endsWith('/2/webhooks')) return endpointResponse();
        if (method === 'GET' && value.includes('/activity/subscriptions')) {
          return new Response(JSON.stringify({ data: subscriptionList }), {
            status: 200,
          });
        }
        if (method === 'POST') {
          const body = JSON.parse(String(options?.body || '{}'));
          // X rejects a second subscription for the same event type and user
          // regardless of the direction filter.
          if (
            subscriptionList.some(
              (subscription) =>
                subscription.event_type === body.event_type &&
                subscription.filter?.user_id === body.filter?.user_id
            )
          ) {
            return new Response(
              JSON.stringify({
                errors: [
                  {
                    message:
                      "DuplicateSubscription: A subscription already exists for event type 'like.create' with the same filters",
                  },
                ],
              }),
              { status: 400 }
            );
          }
          const subscription = {
            subscription_id: `new-${++created}`,
            event_type: body.event_type,
            filter: body.filter,
            webhook_id: body.webhook_id,
          };
          subscriptionList = [...subscriptionList, subscription];
          return new Response(
            JSON.stringify({
              data: { subscription_id: subscription.subscription_id },
            }),
            { status: 200 }
          );
        }
        if (method === 'DELETE') {
          const id = value.split('/').pop()!;
          deleted.push(id);
          subscriptionList = subscriptionList.filter(
            (subscription) => subscription.subscription_id !== id
          );
          return new Response(JSON.stringify({ data: { deleted: true } }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      });

    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret',
        'tracking-oauth2'
      )
    ).resolves.toMatchObject({
      state: 'active',
      subscriptions: expect.arrayContaining([
        expect.objectContaining({
          eventKey: 'like.create',
          direction: 'inbound',
          state: 'active',
        }),
      ]),
    });
    expect(deleted).toContain('like-inbound-only');
    const likeCreate = fetchMock.mock.calls.filter(
      ([url, options]) =>
        String(url).endsWith('/activity/subscriptions') &&
        (options as RequestInit).method === 'POST' &&
        String((options as RequestInit).body).includes(
          '"event_type":"like.create"'
        )
    );
    expect(
      JSON.parse(String((likeCreate.at(-1)![1] as RequestInit).body)).filter
    ).toEqual({ user_id: '42' });
  });

  it('deletes subscriptions with app-only auth', async () => {
    const provider = new XProvider();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, options) => {
        const value = String(url);
        const method = options?.method || 'GET';
        if (value.endsWith('/2/webhooks')) return endpointResponse();
        if (method === 'GET') {
          return new Response(
            JSON.stringify({
              data: [
                {
                  subscription_id: 'follow-sub',
                  event_type: 'follow.follow',
                  filter: { user_id: '42' },
                  webhook_id: '123',
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ data: { deleted: true } }), {
          status: 200,
        });
      });

    await provider.channelInteractionWebhooks.reconcileSubscriptions(
      { internalId: '42', disabled: true, deletedAt: null } as any,
      'access:secret'
    );

    const deleteCall = fetchMock.mock.calls.find(
      ([, options]) => (options as RequestInit).method === 'DELETE'
    );
    expect(
      (deleteCall![1] as RequestInit).headers as Record<string, string>
    ).toMatchObject({ Authorization: 'Bearer app-bearer' });
  });

  it('reuses an existing directionless like subscription without recreating it', async () => {
    const provider = new XProvider();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, options) => {
        const value = String(url);
        const method = options?.method || 'GET';
        if (value.endsWith('/2/webhooks')) return endpointResponse();
        if (method === 'GET') {
          return new Response(
            JSON.stringify({
              data: [
                {
                  subscription_id: 'like-both',
                  event_type: 'like.create',
                  filter: { user_id: '42' },
                  webhook_id: '123',
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      });

    await expect(
      provider.channelInteractionWebhooks.reconcileSubscriptions(
        { internalId: '42', disabled: false, deletedAt: null } as any,
        'access:secret'
      )
    ).resolves.toMatchObject({
      subscriptions: expect.arrayContaining([
        expect.objectContaining({
          eventKey: 'like.create',
          direction: 'inbound',
          state: 'active',
          remoteIdentifier: 'like-both',
        }),
      ]),
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          (options as RequestInit).method === 'POST' &&
          String((options as RequestInit).body).includes(
            '"event_type":"like.create"'
          )
      )
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          String(url).includes('/activity/subscriptions/like-both') &&
          (options as RequestInit).method === 'DELETE'
      )
    ).toBe(false);
  });
});

import { MastodonProvider } from '@gitroom/nestjs-libraries/integrations/social/mastodon.provider';

describe('MastodonProvider followers', () => {
  const originalInstance = process.env.MASTODON_URL;

  beforeEach(() => {
    process.env.MASTODON_URL = 'https://mastodon.example';
  });

  afterEach(() => {
    if (originalInstance === undefined) {
      delete process.env.MASTODON_URL;
    } else {
      process.env.MASTODON_URL = originalInstance;
    }
  });

  it('normalizes followers and confines Link pagination to opaque cursors', async () => {
    const provider = new MastodonProvider();
    const fetch = jest.spyOn(provider as any, 'fetch').mockResolvedValue({
      headers: new Headers({
        link: '<https://attacker.example/api/v1/accounts/1/followers?max_id=next>; rel="next", <https://mastodon.example/api/v1/accounts/1/followers?min_id=previous>; rel="prev"',
      }),
      json: jest.fn().mockResolvedValue([
        {
          id: 'follower-1',
          display_name: 'Follower',
          acct: 'follower@example',
          avatar: 'https://cdn.example/avatar.png',
          url: 'https://mastodon.example/@follower',
          note: '<p>Hello <strong>world</strong></p>',
          followers_count: 3,
          following_count: 4,
          created_at: '2024-01-01T00:00:00.000Z',
        },
      ]),
    });

    const page = await provider.followers(
      { internalId: 'account-1' } as any,
      'token',
      { limit: 100 }
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://mastodon.example/api/v1/accounts/account-1/followers?limit=80',
      { headers: { Authorization: 'Bearer token' } }
    );
    expect(page).toMatchObject({
      items: [
        expect.objectContaining({
          id: 'follower-1',
          bio: 'Hello world',
          accountCreatedAt: '2024-01-01T00:00:00.000Z',
        }),
      ],
      hasMore: true,
    });
    expect(page.nextCursor).not.toContain('attacker.example');
    expect(Buffer.from(page.nextCursor!, 'base64url').toString('utf8')).toBe(
      '{"max_id":"next"}'
    );
  });

  it('follows an audience member through the Mastodon API', async () => {
    const provider = new MastodonProvider();
    const fetch = jest.spyOn(provider as any, 'fetch').mockResolvedValue({
      ok: true,
    });

    await expect(
      provider.followAudienceMember({} as any, 'token', 'account-9')
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://mastodon.example/api/v1/accounts/account-9/follow',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
      }
    );
  });
});

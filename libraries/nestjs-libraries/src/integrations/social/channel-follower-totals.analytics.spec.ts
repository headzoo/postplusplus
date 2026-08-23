/**
 * Provider capture smoke tests for channel follower / subscriber totals.
 */
import { BlueskyProvider } from '@gitroom/nestjs-libraries/integrations/social/bluesky.provider';
import { FacebookProvider } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';
import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import { LinkedinPageProvider } from '@gitroom/nestjs-libraries/integrations/social/linkedin.page.provider';
import { MastodonProvider } from '@gitroom/nestjs-libraries/integrations/social/mastodon.provider';
import { PinterestProvider } from '@gitroom/nestjs-libraries/integrations/social/pinterest.provider';
import { ThreadsProvider } from '@gitroom/nestjs-libraries/integrations/social/threads.provider';
import { TumblrProvider } from '@gitroom/nestjs-libraries/integrations/social/tumblr.provider';
import { TwitchProvider } from '@gitroom/nestjs-libraries/integrations/social/twitch.provider';
import { VkProvider } from '@gitroom/nestjs-libraries/integrations/social/vk.provider';

const snapshotAt = new Date('2026-08-15T12:00:00.000Z');
const dayRange = {
  snapshotAt,
  fromDay: new Date('2026-08-15T00:00:00.000Z'),
  toDay: new Date('2026-08-15T00:00:00.000Z'),
  pageSize: 100,
};

describe('channel follower total analytics captures', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('Facebook includes latest followers from page_follows insights', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            name: 'page_follows',
            values: [{ value: 900, end_time: '2026-08-15T07:00:00+0000' }],
          },
          {
            name: 'page_daily_follows',
            values: [{ value: 3, end_time: '2026-08-15T07:00:00+0000' }],
          },
        ],
      }),
    }) as any;

    const page = await new FacebookProvider().analyticsSnapshot!.capture({
      integration: { internalId: 'page-1' },
      accessToken: 'token',
      ...dayRange,
    } as any);

    expect(page.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricKey: 'followers',
          valueMode: 'latest',
          value: 900,
        }),
        expect.objectContaining({
          metricKey: 'page_followers',
          valueMode: 'sum',
          value: 3,
        }),
      ])
    );
  });

  it('LinkedIn Pages includes latest followers from networkSizes', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('networkSizes')) {
        return {
          ok: true,
          json: async () => ({ firstDegreeSize: 321 }),
        };
      }
      return {
        ok: true,
        json: async () => ({ elements: [] }),
      };
    }) as any;

    const page = await new LinkedinPageProvider().analyticsSnapshot!.capture({
      integration: { internalId: 'org-1' },
      accessToken: 'token',
      ...dayRange,
    } as any);

    expect(page.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricKey: 'followers',
          valueMode: 'latest',
          value: 321,
          day: '2026-08-15',
        }),
      ])
    );
  });

  it('Pinterest includes latest followers from user_account', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/user_account/analytics')) {
        return {
          ok: true,
          json: async () => ({ all: { daily_metrics: [] } }),
        };
      }
      if (String(url).endsWith('/user_account')) {
        return {
          ok: true,
          json: async () => ({ follower_count: 77 }),
        };
      }
      return { ok: false, json: async () => ({}) };
    }) as any;

    const page = await new PinterestProvider().analyticsSnapshot!.capture({
      integration: { internalId: 'user-1' },
      accessToken: 'token',
      ...dayRange,
    } as any);

    expect(page.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricKey: 'followers',
          valueMode: 'latest',
          value: 77,
          day: '2026-08-15',
        }),
      ])
    );
  });

  it('Instagram stores profile followers_count as latest and follower_count insight as sum', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/insights?metric=follower_count')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                name: 'follower_count',
                values: [{ value: 5, end_time: '2026-08-15T07:00:00+0000' }],
              },
            ],
          }),
        };
      }
      if (String(url).includes('metric_type=total_value')) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      if (String(url).includes('fields=followers_count')) {
        return {
          ok: true,
          json: async () => ({ followers_count: 2500 }),
        };
      }
      return { ok: false, json: async () => ({}) };
    }) as any;

    const page = await new InstagramProvider().analyticsSnapshot!.capture({
      integration: { internalId: 'ig-1' },
      accessToken: 'page___user',
      ...dayRange,
    } as any);

    expect(page.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricKey: 'followers',
          valueMode: 'latest',
          value: 2500,
        }),
        expect.objectContaining({
          metricKey: 'follower_count',
          valueMode: 'sum',
          value: 5,
        }),
      ])
    );
  });

  it('Threads includes latest followers from user fields when available', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('threads_insights')) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      if (String(url).includes('fields=followers_count')) {
        return {
          ok: true,
          json: async () => ({ followers_count: 880 }),
        };
      }
      return { ok: false, json: async () => ({}) };
    }) as any;

    const page = await new ThreadsProvider().analyticsSnapshot!.capture({
      integration: { internalId: 'threads-1' },
      accessToken: 'token',
      ...dayRange,
    } as any);

    expect(page.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricKey: 'followers',
          valueMode: 'latest',
          value: 880,
        }),
      ])
    );
  });

  it('Bluesky includes latest followers from getProfile', async () => {
    const provider = new BlueskyProvider();
    jest.spyOn(provider as any, 'getAgent').mockResolvedValue({
      getProfile: jest.fn().mockResolvedValue({
        data: { followersCount: 4321 },
      }),
    });

    const page = await provider.analyticsSnapshot!.capture({
      integration: { internalId: 'did:plc:abc' },
      accessToken: 'token',
      ...dayRange,
    } as any);

    expect(page.points).toEqual([
      expect.objectContaining({
        metricKey: 'followers',
        valueMode: 'latest',
        value: 4321,
        day: '2026-08-15',
      }),
    ]);
  });

  it('Mastodon includes latest followers from account lookup', async () => {
    const provider = new MastodonProvider();
    jest.spyOn(provider as any, 'fetch').mockResolvedValue({
      json: async () => ({ followers_count: 111 }),
    });

    const page = await provider.analyticsSnapshot!.capture({
      integration: { internalId: 'acct-1' },
      accessToken: 'token',
      ...dayRange,
    } as any);

    expect(page.points).toEqual([
      expect.objectContaining({
        metricKey: 'followers',
        valueMode: 'latest',
        value: 111,
      }),
    ]);
  });

  it('Twitch includes latest followers from helix total without avatars', async () => {
    const provider = new TwitchProvider();
    const fetchSpy = jest.spyOn(provider as any, 'fetch').mockResolvedValue({
      json: async () => ({ total: 55, data: [] }),
    });

    const page = await provider.analyticsSnapshot!.capture({
      integration: { internalId: 'broadcaster-1' },
      accessToken: 'token',
      ...dayRange,
    } as any);

    expect(page.points).toEqual([
      expect.objectContaining({
        metricKey: 'followers',
        valueMode: 'latest',
        value: 55,
      }),
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('first=1'),
      expect.any(Object),
      'twitch'
    );
  });

  it('Tumblr includes latest followers from total_users', async () => {
    const provider = new TumblrProvider();
    jest.spyOn(provider as any, 'fetch').mockResolvedValue({
      json: async () => ({ response: { total_users: 25, users: [] } }),
    });

    const page = await provider.analyticsSnapshot!.capture({
      integration: { internalId: 'blog.tumblr.com' },
      accessToken: 'token',
      ...dayRange,
    } as any);

    expect(page.points).toEqual([
      expect.objectContaining({
        metricKey: 'followers',
        valueMode: 'latest',
        value: 25,
      }),
    ]);
  });

  it('VK includes latest followers from users.getFollowers count', async () => {
    const provider = new VkProvider();
    jest.spyOn(provider as any, 'fetch').mockResolvedValue({
      json: async () => ({ response: { count: 90, items: [] } }),
    });

    const page = await provider.analyticsSnapshot!.capture({
      integration: { internalId: 'vk-user' },
      accessToken: 'token',
      ...dayRange,
    } as any);

    expect(page.points).toEqual([
      expect.objectContaining({
        metricKey: 'followers',
        valueMode: 'latest',
        value: 90,
      }),
    ]);
  });

  it('Farcaster includes latest followers from Neynar user', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('@neynar/nodejs-sdk', () => ({
        NeynarAPIClient: jest.fn().mockImplementation(() => ({
          fetchBulkUsers: jest.fn().mockResolvedValue({
            users: [{ follower_count: 333 }],
          }),
          fetchUserFollowers: jest.fn(),
          lookupUserByUsername: jest.fn(),
          publishCast: jest.fn(),
          searchChannels: jest.fn(),
        })),
      }));
      const { FarcasterProvider } = await import(
        '@gitroom/nestjs-libraries/integrations/social/farcaster.provider'
      );
      const page = await new FarcasterProvider().analyticsSnapshot!.capture({
        integration: { internalId: '123' },
        accessToken: 'token',
        ...dayRange,
      } as any);

      expect(page.points).toEqual([
        expect.objectContaining({
          metricKey: 'followers',
          valueMode: 'latest',
          value: 333,
        }),
      ]);
    });
  });
});

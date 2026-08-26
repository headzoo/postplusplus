import 'reflect-metadata';

const fetchUserFollowers = jest.fn();
const followUser = jest.fn();

jest.mock('@neynar/nodejs-sdk', () => ({
  NeynarAPIClient: jest.fn().mockImplementation(() => ({
    fetchUserFollowers,
    followUser,
  })),
}));

import { FarcasterProvider } from '@gitroom/nestjs-libraries/integrations/social/farcaster.provider';

describe('FarcasterProvider followers', () => {
  beforeEach(() => {
    fetchUserFollowers.mockReset();
    followUser.mockReset();
  });

  it('maps recommended ordering to Neynar algorithmic ordering', async () => {
    fetchUserFollowers.mockResolvedValue({
      users: [
        {
          user: {
            fid: 7,
            username: 'ada',
            display_name: 'Ada',
            pfp_url: 'https://cdn.warpcast.com/ada.jpg',
            profile: { bio: { text: 'Builder' } },
            follower_count: 10,
            following_count: 2,
            score: 0.8,
            registered_at: '2020-01-01T00:00:00.000Z',
          },
        },
      ],
      next: { cursor: 'next' },
    });
    const provider = new FarcasterProvider();

    await expect(
      provider.followers({ internalId: '42' } as any, '', {
        limit: 24,
        sort: 'recommended',
        direction: 'desc',
      })
    ).resolves.toEqual({
      items: [
        {
          id: '7',
          name: 'Ada',
          username: 'ada',
          picture: 'https://cdn.warpcast.com/ada.jpg',
          profileUrl: 'https://warpcast.com/ada',
          bio: 'Builder',
          followersCount: 10,
          followingCount: 2,
          influenceScore: 0.8,
          accountCreatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      nextCursor: 'next',
      hasMore: true,
    });
    expect(fetchUserFollowers).toHaveBeenCalledWith({
      fid: 42,
      limit: 24,
      sortType: 'algorithmic',
    });
    expect(provider.followerSorts).toEqual([
      expect.objectContaining({ key: 'recent', directions: ['desc'] }),
      expect.objectContaining({ key: 'recommended', directions: ['desc'] }),
    ]);
  });

  it('returns an empty page without a cursor', async () => {
    fetchUserFollowers.mockResolvedValue({ users: [], next: { cursor: null } });

    await expect(
      new FarcasterProvider().followers({ internalId: '42' } as any, '', {
        limit: 1,
      })
    ).resolves.toEqual({ items: [], hasMore: false });
  });

  it('follows an audience member by fid through Neynar', async () => {
    followUser.mockResolvedValue(undefined);
    const provider = new FarcasterProvider();

    await expect(
      provider.followAudienceMember({} as any, 'signer-uuid', '42')
    ).resolves.toBeUndefined();
    expect(followUser).toHaveBeenCalledWith({
      signerUuid: 'signer-uuid',
      targetFids: [42],
    });
  });
});

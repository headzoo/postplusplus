import { XProvider } from '@gitroom/nestjs-libraries/integrations/social/x.provider';

describe('XProvider followers', () => {
  it('uses the stored user client and normalizes native pagination', async () => {
    const provider = new XProvider();
    const followers = jest.fn().mockResolvedValue({
      data: [
        {
          id: '1',
          name: 'Ada',
          username: 'ada',
          description: 'Builder',
          profile_image_url: 'https://images.x.example/ada.jpg',
          created_at: '2020-01-01T00:00:00.000Z',
          public_metrics: { followers_count: 5, following_count: 3 },
        },
      ],
      meta: { next_token: 'next' },
    });
    jest
      .spyOn(provider as any, 'getClient')
      .mockResolvedValue({ v2: { followers } });

    await expect(
      provider.followers({ internalId: '42' } as any, 'token:secret', {
        limit: 24,
        cursor: 'current',
      })
    ).resolves.toEqual({
      items: [
        {
          id: '1',
          name: 'Ada',
          username: 'ada',
          bio: 'Builder',
          picture: 'https://images.x.example/ada.jpg',
          profileUrl: 'https://x.com/ada',
          followersCount: 5,
          followingCount: 3,
          accountCreatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      nextCursor: 'next',
      hasMore: true,
    });
    expect(followers).toHaveBeenCalledWith(
      '42',
      expect.objectContaining({ max_results: 24, pagination_token: 'current' })
    );
  });

  it('loads another member follower page via memberFollowers', async () => {
    const provider = new XProvider();
    const followers = jest.fn().mockResolvedValue({
      data: [
        {
          id: '9',
          name: 'Prospect',
          username: 'prospect',
          public_metrics: { followers_count: 2, following_count: 1 },
        },
      ],
      meta: {},
    });
    jest
      .spyOn(provider as any, 'getClient')
      .mockResolvedValue({ v2: { followers } });

    await expect(
      provider.memberFollowers({ internalId: '42' } as any, 'token:secret', 'warm-1', {
        limit: 100,
      })
    ).resolves.toEqual({
      items: [
        {
          id: '9',
          name: 'Prospect',
          username: 'prospect',
          profileUrl: 'https://x.com/prospect',
          followersCount: 2,
          followingCount: 1,
        },
      ],
      hasMore: false,
    });
    expect(followers).toHaveBeenCalledWith(
      'warm-1',
      expect.objectContaining({ max_results: 100 })
    );
  });

  it('follows an audience member through the OAuth client', async () => {
    const provider = new XProvider();
    const follow = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(provider as any, 'getClient')
      .mockResolvedValue({ v2: { follow } });

    await expect(
      provider.followAudienceMember(
        { internalId: '42' } as any,
        'token:secret',
        'target-9'
      )
    ).resolves.toBeUndefined();
    expect(follow).toHaveBeenCalledWith('42', 'target-9');
  });

  it('normalizes member timeline posts from userTimeline', async () => {
    const provider = new XProvider();
    const userTimeline = jest.fn().mockResolvedValue({
      data: {
        data: [
          {
            id: 'tweet-1',
            text: 'Hello world',
            created_at: '2024-01-02T12:00:00.000Z',
          },
        ],
      },
      includes: { media: [] },
      meta: { next_token: 'next-page' },
    });
    jest
      .spyOn(provider as any, 'getClient')
      .mockResolvedValue({ v2: { userTimeline } });

    await expect(
      provider.memberPosts({ internalId: '42' } as any, 'token:secret', '99', {
        limit: 20,
      })
    ).resolves.toEqual({
      items: [
        {
          externalId: 'tweet-1',
          url: 'https://x.com/i/web/status/tweet-1',
          content: 'Hello world',
          publishedAt: '2024-01-02T12:00:00.000Z',
        },
      ],
      nextCursor: 'next-page',
      hasMore: true,
    });
    expect(userTimeline).toHaveBeenCalledWith(
      '99',
      expect.objectContaining({ max_results: 20, exclude: ['retweets'] })
    );
  });
});

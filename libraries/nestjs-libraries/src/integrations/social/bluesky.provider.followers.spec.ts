import { BlueskyProvider } from '@gitroom/nestjs-libraries/integrations/social/bluesky.provider';

describe('BlueskyProvider followers', () => {
  it('uses the integration session and returns the opaque cursor', async () => {
    const provider = new BlueskyProvider();
    const getFollowers = jest.fn().mockResolvedValue({
      data: {
        cursor: 'next',
        followers: [
          {
            did: 'did:plc:ada',
            handle: 'ada.bsky.social',
            displayName: 'Ada',
            description: 'Builder',
            avatar: 'https://cdn.bsky.app/avatar.jpg',
            createdAt: '2020-01-01T00:00:00.000Z',
          },
        ],
      },
    });
    jest.spyOn(provider as any, 'getAgent').mockResolvedValue({
      app: { bsky: { graph: { getFollowers } } },
    });

    await expect(
      provider.followers({ internalId: 'did:plc:owner' } as any, '', {
        limit: 24,
        cursor: 'current',
      })
    ).resolves.toEqual({
      items: [
        {
          id: 'did:plc:ada',
          name: 'Ada',
          username: 'ada.bsky.social',
          bio: 'Builder',
          picture: 'https://cdn.bsky.app/avatar.jpg',
          profileUrl: 'https://bsky.app/profile/ada.bsky.social',
          accountCreatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      nextCursor: 'next',
      hasMore: true,
    });
    expect(getFollowers).toHaveBeenCalledWith({
      actor: 'did:plc:owner',
      limit: 24,
      cursor: 'current',
    });
  });

  it('follows an audience member through the agent', async () => {
    const provider = new BlueskyProvider();
    const follow = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(provider as any, 'getAgent').mockResolvedValue({ follow });

    await expect(
      provider.followAudienceMember(
        { internalId: 'did:plc:owner' } as any,
        '',
        'did:plc:target'
      )
    ).resolves.toBeUndefined();
    expect(follow).toHaveBeenCalledWith('did:plc:target');
  });
});

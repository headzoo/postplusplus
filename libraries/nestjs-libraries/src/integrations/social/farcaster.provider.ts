import {
  AuthTokenDetails,
  ChannelAnalyticsCaptureRequest,
  ChannelAnalyticsCapturePage,
  Follower,
  FollowerPage,
  FollowerQuery,
  FollowerSort,
  PostDetails,
  PostResponse,
  SocialProvider,
  paginateDailyAnalyticsCapture,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { Integration } from '@prisma/client';
import { FarcasterDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/farcaster.dto';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

dayjs.extend(utc);

const client = new NeynarAPIClient({
  apiKey: process.env.NEYNAR_SECRET_KEY || '00000000-000-0000-000-000000000000',
});

@Rules('Farcaster/Warpcast can only accept pictures')
export class FarcasterProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'wrapcast';
  name = 'Farcaster';
  analyticsSnapshot = {
    capture: (request: ChannelAnalyticsCaptureRequest) =>
      this.captureAnalyticsSnapshot(request),
  };
  followerSorts: FollowerSort[] = [
    {
      key: 'recent',
      label: 'Recent',
      directions: ['desc'],
      defaultDirection: 'desc',
      scope: 'native',
    },
    {
      key: 'recommended',
      label: 'Recommended',
      directions: ['desc'],
      defaultDirection: 'desc',
      scope: 'native',
    },
  ];
  isBetweenSteps = false;
  isWeb3 = true;
  scopes = [] as string[];
  override maxConcurrentJob = 3; // Farcaster has moderate limits
  editor = 'normal' as const;
  maxLength() {
    return 800;
  }
  dto = FarcasterDto;

  private async captureAnalyticsSnapshot(
    request: ChannelAnalyticsCaptureRequest
  ): Promise<ChannelAnalyticsCapturePage> {
    const day = dayjs.utc(request.snapshotAt).format('YYYY-MM-DD');
    const points: Array<{
      metricKey: string;
      label: string;
      valueMode: 'latest';
      value: number;
      day: string;
    }> = [];
    try {
      const fid = Number(request.integration.internalId);
      if (!Number.isSafeInteger(fid) || fid < 1) {
        throw new Error('Farcaster integration has an invalid FID');
      }
      const response = await client.fetchBulkUsers({ fids: [fid] });
      const user = response.users?.[0] as
        | { follower_count?: number }
        | undefined;
      if (
        typeof user?.follower_count === 'number' &&
        user.follower_count >= 0
      ) {
        points.push({
          metricKey: 'followers',
          label: 'Followers',
          valueMode: 'latest',
          value: user.follower_count,
          day,
        });
      }
    } catch {
      // Leave points empty when the profile lookup fails.
    }
    return paginateDailyAnalyticsCapture(
      request,
      { fromDay: day, toDay: day },
      points
    );
  }

  async followers(
    integration: Integration,
    _accessToken: string,
    query: FollowerQuery
  ): Promise<FollowerPage> {
    const fid = Number(integration.internalId);
    if (!Number.isSafeInteger(fid) || fid < 1) {
      throw new Error('Farcaster integration has an invalid FID');
    }

    const response = await client.fetchUserFollowers({
      fid,
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      sortType: query.sort === 'recommended' ? 'algorithmic' : 'desc_chron',
    });
    const nextCursor = response.next?.cursor;
    const isHttpUrl = (value?: string) => {
      try {
        return value && /^https?:$/.test(new URL(value).protocol)
          ? value
          : undefined;
      } catch {
        return undefined;
      }
    };

    return {
      items: response.users.map(({ user }) => ({
        id: String(user.fid),
        name: user.display_name || user.username,
        username: user.username,
        ...(isHttpUrl(user.pfp_url) ? { picture: user.pfp_url } : {}),
        profileUrl: `https://warpcast.com/${encodeURIComponent(user.username)}`,
        ...(user.profile?.bio?.text ? { bio: user.profile.bio.text } : {}),
        ...(user.follower_count !== undefined
          ? { followersCount: user.follower_count }
          : {}),
        ...(user.following_count !== undefined
          ? { followingCount: user.following_count }
          : {}),
        ...(user.score !== undefined ? { influenceScore: user.score } : {}),
        ...(user.registered_at ? { accountCreatedAt: user.registered_at } : {}),
      })),
      ...(nextCursor ? { nextCursor } : {}),
      hasMore: !!nextCursor,
    };
  }

  async followAudienceMember(
    _integration: Integration,
    accessToken: string,
    externalId: string
  ): Promise<void> {
    const targetFid = Number(externalId);
    if (!Number.isSafeInteger(targetFid) || targetFid < 1) {
      throw new Error('Invalid Farcaster profile id');
    }
    try {
      await client.followUser({
        signerUuid: accessToken,
        targetFids: [targetFid],
      });
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Could not follow on Farcaster'
      );
    }
  }

  async unfollowAudienceMember(
    _integration: Integration,
    accessToken: string,
    externalId: string
  ): Promise<void> {
    const targetFid = Number(externalId);
    if (!Number.isSafeInteger(targetFid) || targetFid < 1) {
      throw new Error('Invalid Farcaster profile id');
    }
    try {
      await client.unfollowUser({
        signerUuid: accessToken,
        targetFids: [targetFid],
      });
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Could not unfollow on Farcaster'
      );
    }
  }

  async resolveAudienceProfileFromUrl(
    _accessToken: string,
    _integration: Integration,
    url: string
  ): Promise<Follower | null> {
    const target = this.parseFarcasterProfileTarget(url);
    if (!target) {
      return null;
    }
    try {
      const isHttpUrl = (value?: string) => {
        try {
          return value && /^https?:$/.test(new URL(value).protocol)
            ? value
            : undefined;
        } catch {
          return undefined;
        }
      };
      const mapUser = (user: {
        fid: number;
        display_name?: string;
        username?: string;
        pfp_url?: string;
        profile?: { bio?: { text?: string } };
        follower_count?: number;
        following_count?: number;
        score?: number;
        registered_at?: string;
      }): Follower => ({
        id: String(user.fid),
        name: user.display_name || user.username || String(user.fid),
        ...(user.username ? { username: user.username } : {}),
        ...(isHttpUrl(user.pfp_url) ? { picture: user.pfp_url } : {}),
        ...(user.username
          ? {
              profileUrl: `https://warpcast.com/${encodeURIComponent(
                user.username
              )}`,
            }
          : {}),
        ...(user.profile?.bio?.text ? { bio: user.profile.bio.text } : {}),
        ...(user.follower_count !== undefined
          ? { followersCount: user.follower_count }
          : {}),
        ...(user.following_count !== undefined
          ? { followingCount: user.following_count }
          : {}),
        ...(user.score !== undefined ? { influenceScore: user.score } : {}),
        ...(user.registered_at ? { accountCreatedAt: user.registered_at } : {}),
      });

      if (target.kind === 'fid') {
        const response = await client.fetchBulkUsers({ fids: [target.value] });
        const user = response.users?.[0];
        return user ? mapUser(user) : null;
      }

      const response = await client.lookupUserByUsername({
        username: target.value,
      });
      const user = response.user;
      return user ? mapUser(user) : null;
    } catch {
      return null;
    }
  }

  private parseFarcasterProfileTarget(
    raw: string
  ):
    | { kind: 'username'; value: string }
    | { kind: 'fid'; value: number }
    | null {
    const trimmed = raw.trim().replace(/^@/, '');
    if (!trimmed) {
      return null;
    }
    if (/^\d+$/.test(trimmed)) {
      const fid = Number(trimmed);
      return Number.isSafeInteger(fid) && fid > 0
        ? { kind: 'fid', value: fid }
        : null;
    }
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.includes('/')) {
      return /^[A-Za-z0-9._-]{1,64}$/.test(trimmed)
        ? { kind: 'username', value: trimmed }
        : null;
    }
    let parsed: URL;
    try {
      parsed = new URL(
        /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
      );
    } catch {
      return null;
    }
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (host !== 'warpcast.com' && host !== 'farcaster.xyz') {
      return null;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (!segments.length) {
      return null;
    }
    const username = decodeURIComponent(segments[0]).replace(/^@/, '');
    return /^[A-Za-z0-9._-]{1,64}$/.test(username)
      ? { kind: 'username', value: username }
      : null;
  }

  override async checkValidity(
    list: Array<ValidityMedia[]>
  ): Promise<string | true> {
    if (
      list?.some((item) =>
        item?.some((field) => (field?.path?.indexOf?.('mp4') ?? -1) > -1)
      )
    ) {
      return 'Can only accept images';
    }
    return true;
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeId(17);
    return {
      url: `${process.env.NEYNAR_CLIENT_ID}||${state}` || '',
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const data = JSON.parse(Buffer.from(params.code, 'base64').toString());
    return {
      id: String(data.fid),
      name: data.display_name,
      accessToken: data.signer_uuid,
      refreshToken: '',
      expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
      picture: data?.pfp_url || '',
      username: data.username,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<FarcasterDto>[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const ids: { releaseURL: string; postId: string }[] = [];

    const channels =
      !firstPost?.settings?.subreddit ||
      firstPost?.settings?.subreddit.length === 0
        ? [undefined]
        : firstPost?.settings?.subreddit;

    for (const channel of channels) {
      const data = await client.publishCast({
        embeds:
          firstPost?.media?.map((media) => ({
            url: media.path,
          })) || [],
        signerUuid: accessToken,
        text: firstPost.message,
        ...(channel?.value?.id ? { channelId: channel?.value?.id } : {}),
      });

      ids.push({
        // @ts-ignore
        releaseURL: `https://warpcast.com/${data.cast.author.username}/${data.cast.hash}`,
        postId: data.cast.hash,
      });
    }

    return [
      {
        id: firstPost.id,
        postId: ids.map((p) => p.postId).join(','),
        releaseURL: ids.map((p) => p.releaseURL).join(','),
        status: 'published',
      },
    ];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails<FarcasterDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    const ids: { releaseURL: string; postId: string }[] = [];

    // postId can be comma-separated if posted to multiple channels
    const parentIds = (lastCommentId || postId).split(',');

    for (const parentHash of parentIds) {
      const data = await client.publishCast({
        embeds:
          commentPost?.media?.map((media) => ({
            url: media.path,
          })) || [],
        signerUuid: accessToken,
        text: commentPost.message,
        parent: parentHash,
      });

      ids.push({
        // @ts-ignore
        releaseURL: `https://warpcast.com/${data.cast.author.username}/${data.cast.hash}`,
        postId: data.cast.hash,
      });
    }

    return [
      {
        id: commentPost.id,
        postId: ids.map((p) => p.postId).join(','),
        releaseURL: ids.map((p) => p.releaseURL).join(','),
        status: 'published',
      },
    ];
  }

  @Tool({
    description: 'Search channels',
    dataSchema: [{ key: 'word', type: 'string', description: 'Search word' }],
  })
  async subreddits(
    accessToken: string,
    data: any,
    id: string,
    integration: Integration
  ) {
    const search = await client.searchChannels({
      q: data.word,
      limit: 10,
    });

    return search.channels.map((p) => {
      return {
        title: p.name,
        name: p.name,
        id: p.id,
      };
    });
  }
}

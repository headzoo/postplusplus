import {
  AuthTokenDetails,
  ChannelAnalyticsCaptureRequest,
  ChannelAnalyticsCapturePage,
  Follower,
  FollowerQuery,
  FollowerSort,
  PostDetails,
  PostResponse,
  SocialProvider,
  paginateDailyAnalyticsCapture,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';
import { TwitchDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/twitch.dto';
import { timer } from '@gitroom/helpers/utils/timer';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

export class TwitchProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 1;
  identifier = 'twitch';
  name = 'Twitch';
  analyticsSnapshot = {
    capture: (request: ChannelAnalyticsCaptureRequest) =>
      this.captureAnalyticsSnapshot(request),
  };
  isBetweenSteps = false;
  editor = 'normal' as const;
  scopes = [
    'user:write:chat',
    'user:read:chat',
    'moderator:manage:announcements',
    'moderator:read:followers',
  ];
  dto = TwitchDto;
  followerSorts: FollowerSort[] = [
    {
      key: 'recent',
      label: 'Most recent',
      directions: ['desc'],
      defaultDirection: 'desc',
    },
  ];

  maxLength() {
    return 500; // Twitch chat message max length
  }

  profileUrl(integration: Integration) {
    return integration.profile
      ? `https://www.twitch.tv/${encodeURIComponent(integration.profile)}`
      : undefined;
  }

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
      const params = new URLSearchParams({
        broadcaster_id: request.integration.internalId,
        first: '1',
      });
      const response = await this.fetch(
        `https://api.twitch.tv/helix/channels/followers?${params.toString()}`,
        {
          headers: this.twitchHeaders(request.accessToken),
        },
        this.identifier
      );
      const body = (await response.json()) as { total?: number };
      if (Number.isSafeInteger(body.total) && (body.total as number) >= 0) {
        points.push({
          metricKey: 'followers',
          label: 'Followers',
          valueMode: 'latest',
          value: body.total as number,
          day,
        });
      }
    } catch {
      // Leave points empty when the total lookup fails.
    }
    return paginateDailyAnalyticsCapture(
      request,
      { fromDay: day, toDay: day },
      points
    );
  }

  async followers(
    integration: Integration,
    accessToken: string,
    query: FollowerQuery
  ) {
    const params = new URLSearchParams({
      broadcaster_id: integration.internalId,
      first: String(Math.min(Math.max(query.limit, 1), 100)),
    });
    if (query.cursor) {
      params.set('after', query.cursor);
    }

    const response = await this.fetch(
      `https://api.twitch.tv/helix/channels/followers?${params.toString()}`,
      {
        headers: this.twitchHeaders(accessToken),
      },
      this.identifier
    );
    const body = (await response.json()) as {
      data?: Array<{
        user_id?: string;
        user_login?: string;
        user_name?: string;
        followed_at?: string;
      }>;
      pagination?: { cursor?: string };
      total?: number;
    };

    if (!Array.isArray(body.data)) {
      throw new Error('Twitch did not return follower identities');
    }

    const avatars = await this.getFollowerAvatars(
      body.data.map((follower) => String(follower.user_id || '')),
      accessToken
    );

    return {
      items: body.data.map((follower) => {
        const id = String(follower.user_id || '');
        const username = follower.user_login || '';
        return {
          id,
          name: follower.user_name || username || id,
          ...(username ? { username } : {}),
          ...(avatars.get(id) ? { picture: avatars.get(id) } : {}),
          ...(username
            ? {
              profileUrl: `https://www.twitch.tv/${encodeURIComponent(
                username
              )}`,
            }
            : {}),
          ...(follower.followed_at ? { followedAt: follower.followed_at } : {}),
        };
      }),
      ...(Number.isSafeInteger(body.total) && (body.total as number) >= 0
        ? { total: body.total }
        : {}),
      ...(body.pagination?.cursor
        ? { nextCursor: body.pagination.cursor }
        : {}),
      hasMore: !!body.pagination?.cursor,
    };
  }

  async resolveAudienceProfileFromUrl(
    accessToken: string,
    _integration: Integration,
    url: string
  ): Promise<Follower | null> {
    const login = this.parseTwitchLogin(url);
    if (!login) {
      return null;
    }
    try {
      const params = new URLSearchParams({ login });
      const response = await this.fetch(
        `https://api.twitch.tv/helix/users?${params.toString()}`,
        {
          headers: this.twitchHeaders(accessToken),
        },
        this.identifier
      );
      if (!response.ok) {
        return null;
      }
      const body = (await response.json()) as {
        data?: Array<{
          id?: string;
          login?: string;
          display_name?: string;
          profile_image_url?: string;
          description?: string;
        }>;
      };
      const user = Array.isArray(body.data) ? body.data[0] : undefined;
      if (!user?.id) {
        return null;
      }
      const username = user.login || login;
      return {
        id: String(user.id),
        name: user.display_name || username || String(user.id),
        ...(username ? { username } : {}),
        ...(user.profile_image_url ? { picture: user.profile_image_url } : {}),
        ...(username
          ? {
            profileUrl: `https://www.twitch.tv/${encodeURIComponent(
              username
            )}`,
          }
          : {}),
        ...(user.description ? { bio: user.description } : {}),
      };
    } catch {
      return null;
    }
  }

  private parseTwitchLogin(raw: string): string | null {
    const trimmed = raw.trim().replace(/^@/, '');
    if (!trimmed) {
      return null;
    }
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.includes('/')) {
      return /^[A-Za-z0-9_]{1,64}$/.test(trimmed) ? trimmed.toLowerCase() : null;
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
    if (host !== 'twitch.tv' && host !== 'm.twitch.tv') {
      return null;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (!segments.length) {
      return null;
    }
    const reserved = new Set([
      'directory',
      'videos',
      'settings',
      'inventory',
      'subscriptions',
      'wallet',
      'p',
      'popout',
    ]);
    if (reserved.has(segments[0].toLowerCase())) {
      return null;
    }
    const login = decodeURIComponent(segments[0]);
    return /^[A-Za-z0-9_]{1,64}$/.test(login) ? login.toLowerCase() : null;
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const response = await this.fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.TWITCH_CLIENT_ID!,
        client_secret: process.env.TWITCH_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    });

    const { access_token, refresh_token, expires_in } = await response.json();

    // Get user info
    const userInfo = await this.getUserInfo(access_token);

    return {
      refreshToken: refresh_token,
      expiresIn: expires_in,
      accessToken: access_token,
      id: userInfo.id,
      name: userInfo.name,
      picture: userInfo.picture || '',
      username: userInfo.username,
    };
  }

  async generateAuthUrl() {
    const state = makeId(32);

    const redirectUri = `${process.env.FRONTEND_URL}/integrations/social/twitch`;

    const url =
      `https://id.twitch.tv/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${process.env.TWITCH_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(this.scopes.join(' '))}` +
      `&state=${state}`;

    return {
      url,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const redirectUri = `${process.env.FRONTEND_URL
      }/integrations/social/twitch${params.refresh ? `?refresh=${params.refresh}` : ''
      }`;

    const tokenResponse = await this.fetch(
      'https://id.twitch.tv/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: process.env.TWITCH_CLIENT_ID!,
          client_secret: process.env.TWITCH_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          code: params.code,
        }),
      }
    );

    const { access_token, refresh_token, expires_in } =
      await tokenResponse.json();

    // Get user info
    const userInfo = await this.getUserInfo(access_token);

    return {
      id: userInfo.id,
      name: userInfo.name,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      picture: userInfo.picture || '',
      username: userInfo.username,
    };
  }

  private async getUserInfo(
    accessToken: string
  ): Promise<{ id: string; name: string; username: string; picture?: string }> {
    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': process.env.TWITCH_CLIENT_ID!,
      },
    });

    const userData = await userResponse.json();
    const user = userData.data?.[0];

    return {
      id: String(user.id),
      name: user.display_name,
      username: user.login,
      picture: user.profile_image_url || '',
    };
  }

  private twitchHeaders(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': process.env.TWITCH_CLIENT_ID!,
    };
  }

  private async getFollowerAvatars(ids: string[], accessToken: string) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) {
      return new Map<string, string>();
    }

    try {
      const params = new URLSearchParams();
      uniqueIds.forEach((id) => params.append('id', id));
      const response = await this.fetch(
        `https://api.twitch.tv/helix/users?${params.toString()}`,
        {
          headers: this.twitchHeaders(accessToken),
        },
        this.identifier
      );
      const body = (await response.json()) as {
        data?: Array<{ id?: string; profile_image_url?: string }>;
      };

      return new Map(
        (Array.isArray(body.data) ? body.data : [])
          .filter((user) => user.id && user.profile_image_url)
          .map((user) => [String(user.id), user.profile_image_url!] as const)
      );
    } catch {
      return new Map<string, string>();
    }
  }

  private async sendAnnouncement(
    broadcasterId: string,
    accessToken: string,
    message: string,
    color: string = 'primary'
  ): Promise<{ success: boolean }> {
    await fetch(
      `https://api.twitch.tv/helix/chat/announcements?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': process.env.TWITCH_CLIENT_ID!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.substring(0, 500),
          color,
        }),
      }
    );

    // Announcements return 204 No Content on success
    return { success: true };
  }

  private async sendChatMessage(
    broadcasterId: string,
    accessToken: string,
    message: string,
    replyToMessageId?: string
  ): Promise<{ messageId: string; isSent: boolean }> {
    const body: Record<string, string> = {
      broadcaster_id: broadcasterId,
      sender_id: broadcasterId,
      message: message.substring(0, 500),
    };

    if (replyToMessageId) {
      body.reply_parent_message_id = replyToMessageId;
    }

    const response = await this.fetch(
      'https://api.twitch.tv/helix/chat/messages',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': process.env.TWITCH_CLIENT_ID!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    return {
      messageId: data.data?.[0]?.message_id || makeId(10),
      isSent: data.data?.[0]?.is_sent ?? false,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    await timer(2000);
    const [firstPost] = postDetails;
    const messageType = firstPost.settings?.messageType || 'message';
    const announcementColor =
      firstPost.settings?.announcementColor || 'primary';

    if (messageType === 'announcement') {
      const result = await this.sendAnnouncement(
        id,
        accessToken,
        firstPost.message,
        announcementColor
      );

      return [
        {
          id: firstPost.id,
          postId: makeId(10), // Announcements don't return a message ID
          releaseURL: `https://twitch.tv/${integration.profile || integration.providerIdentifier
            }`,
          status: result.success ? 'posted' : 'error',
        },
      ];
    }

    // Regular chat message
    const result = await this.sendChatMessage(
      id,
      accessToken,
      firstPost.message
    );

    return [
      {
        id: firstPost.id,
        postId: result.messageId,
        releaseURL: `https://twitch.tv/${integration.profile || integration.providerIdentifier
          }`,
        status: result.isSent ? 'posted' : 'error',
      },
    ];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    await timer(2000);
    const [commentPost] = postDetails;
    const messageType = commentPost.settings?.messageType || 'message';
    const announcementColor =
      commentPost.settings?.announcementColor || 'primary';

    if (messageType === 'announcement') {
      const result = await this.sendAnnouncement(
        id,
        accessToken,
        commentPost.message,
        announcementColor
      );

      return [
        {
          id: commentPost.id,
          postId: makeId(10),
          releaseURL: `https://twitch.tv/${integration.profile || integration.providerIdentifier
            }`,
          status: result.success ? 'posted' : 'error',
        },
      ];
    }

    // Regular chat message with reply
    const result = await this.sendChatMessage(
      id,
      accessToken,
      commentPost.message,
      lastCommentId || postId
    );

    return [
      {
        id: commentPost.id,
        postId: result.messageId,
        releaseURL: `https://twitch.tv/${integration.profile || integration.providerIdentifier
          }`,
        status: result.isSent ? 'posted' : 'error',
      },
    ];
  }
}

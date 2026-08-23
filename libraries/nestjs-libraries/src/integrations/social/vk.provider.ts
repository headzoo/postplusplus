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
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { createHash, randomBytes } from 'crypto';
import FormDataNew from 'form-data';
import mime from 'mime-types';
import { Integration } from '@prisma/client';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';

dayjs.extend(utc);

export class VkProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 2; // VK has moderate API limits
  identifier = 'vk';
  name = 'VK';
  analyticsSnapshot = {
    capture: (request: ChannelAnalyticsCaptureRequest) =>
      this.captureAnalyticsSnapshot(request),
  };
  isBetweenSteps = false;
  scopes = [
    'vkid.personal_info',
    'email',
    'wall',
    'status',
    'docs',
    'photos',
    'video',
  ];

  editor = 'normal' as const;
  followerSorts: FollowerSort[] = [
    {
      key: 'recent',
      label: 'Most recent',
      directions: ['desc'],
      defaultDirection: 'desc',
    },
  ];

  private decodeFollowerCursor(cursor?: string) {
    if (!cursor) {
      return 0;
    }

    try {
      const { offset } = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8')
      ) as { offset?: unknown };
      return typeof offset === 'number' &&
        Number.isSafeInteger(offset) &&
        offset >= 0
        ? offset
        : 0;
    } catch {
      return 0;
    }
  }

  private encodeFollowerCursor(offset: number) {
    return Buffer.from(JSON.stringify({ offset })).toString('base64url');
  }

  private httpUrl(value: unknown) {
    try {
      const url = new URL(String(value));
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? url.toString()
        : undefined;
    } catch {
      return undefined;
    }
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
      const url = new URL('https://api.vk.com/method/users.getFollowers');
      url.search = new URLSearchParams({
        user_id: request.integration.internalId,
        offset: '0',
        count: '1',
        access_token: request.accessToken,
        v: '5.251',
      }).toString();
      const { response } = await (await this.fetch(url.toString())).json();
      if (Number.isSafeInteger(response?.count) && response.count >= 0) {
        points.push({
          metricKey: 'followers',
          label: 'Followers',
          valueMode: 'latest',
          value: response.count,
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
  ): Promise<FollowerPage> {
    const limit = Math.min(Math.max(query.limit, 1), 100);
    const offset = this.decodeFollowerCursor(query.cursor);
    const url = new URL('https://api.vk.com/method/users.getFollowers');
    url.search = new URLSearchParams({
      user_id: integration.internalId,
      offset: String(offset),
      count: String(limit),
      fields: 'screen_name,photo_200,status,counters',
      access_token: accessToken,
      v: '5.251',
    }).toString();

    const { response } = await (await this.fetch(url.toString())).json();
    const items = Array.isArray(response?.items) ? response.items : [];
    const nextOffset = offset + items.length;

    return {
      items: items.map((account: any) => ({
        id: String(account.id),
        name:
          [account.first_name, account.last_name].filter(Boolean).join(' ') ||
          account.screen_name ||
          String(account.id),
        ...(account.screen_name ? { username: account.screen_name } : {}),
        ...(this.httpUrl(account.photo_200)
          ? { picture: this.httpUrl(account.photo_200) }
          : {}),
        ...(account.screen_name
          ? {
            profileUrl: `https://vk.com/${encodeURIComponent(
              account.screen_name
            )}`,
          }
          : {}),
        ...(account.status ? { bio: account.status } : {}),
        ...(Number.isFinite(Number(account.counters?.followers))
          ? { followersCount: Number(account.counters.followers) }
          : {}),
      })),
      ...(Number.isSafeInteger(response?.count) && response.count >= 0
        ? { total: response.count }
        : {}),
      ...(nextOffset < response?.count
        ? { nextCursor: this.encodeFollowerCursor(nextOffset) }
        : {}),
      hasMore: nextOffset < response?.count,
    };
  }

  async resolveAudienceProfileFromUrl(
    accessToken: string,
    _integration: Integration,
    url: string
  ): Promise<Follower | null> {
    const target = this.parseVkProfileTarget(url);
    if (!target) {
      return null;
    }
    try {
      const apiUrl = new URL('https://api.vk.com/method/users.get');
      apiUrl.search = new URLSearchParams({
        user_ids: target,
        fields: 'screen_name,photo_200,status,counters',
        access_token: accessToken,
        v: '5.251',
      }).toString();
      const { response } = await (await this.fetch(apiUrl.toString())).json();
      const account = Array.isArray(response) ? response[0] : undefined;
      if (!account?.id) {
        return null;
      }
      return {
        id: String(account.id),
        name:
          [account.first_name, account.last_name].filter(Boolean).join(' ') ||
          account.screen_name ||
          String(account.id),
        ...(account.screen_name ? { username: account.screen_name } : {}),
        ...(this.httpUrl(account.photo_200)
          ? { picture: this.httpUrl(account.photo_200) }
          : {}),
        ...(account.screen_name
          ? {
            profileUrl: `https://vk.com/${encodeURIComponent(
              account.screen_name
            )}`,
          }
          : {
            profileUrl: `https://vk.com/id${encodeURIComponent(
              String(account.id)
            )}`,
          }),
        ...(account.status ? { bio: account.status } : {}),
        ...(Number.isFinite(Number(account.counters?.followers))
          ? { followersCount: Number(account.counters.followers) }
          : {}),
      };
    } catch {
      return null;
    }
  }

  private parseVkProfileTarget(raw: string): string | null {
    const trimmed = raw.trim().replace(/^@/, '');
    if (!trimmed) {
      return null;
    }
    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.includes('/')) {
      return /^[A-Za-z0-9._-]{1,64}$/.test(trimmed) ? trimmed : null;
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
    if (host !== 'vk.com' && host !== 'm.vk.com' && host !== 'vk.ru') {
      return null;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (!segments.length) {
      return null;
    }
    const slug = decodeURIComponent(segments[0]);
    if (/^id\d+$/i.test(slug)) {
      return slug.slice(2);
    }
    if (
      slug.toLowerCase().startsWith('club') ||
      slug.toLowerCase().startsWith('public') ||
      slug.toLowerCase().startsWith('event')
    ) {
      return null;
    }
    return /^[A-Za-z0-9._-]{1,64}$/.test(slug) ? slug : null;
  }

  maxLength() {
    return 2048;
  }

  async refreshToken(refresh: string): Promise<AuthTokenDetails> {
    const [oldRefreshToken, device_id] = refresh.split('&&&&');
    const formData = new FormData();
    formData.append('grant_type', 'refresh_token');
    formData.append('refresh_token', oldRefreshToken);
    formData.append('client_id', process.env.VK_ID!);
    formData.append('device_id', device_id);
    formData.append('state', makeId(32));
    formData.append('scope', this.scopes.join(' '));

    const { access_token, refresh_token, expires_in } = await (
      await this.fetch('https://id.vk.com/oauth2/auth', {
        method: 'POST',
        body: formData,
      })
    ).json();

    const newFormData = new FormData();
    newFormData.append('client_id', process.env.VK_ID!);
    newFormData.append('access_token', access_token);

    const {
      user: { user_id, first_name, last_name, avatar },
    } = await (
      await this.fetch('https://id.vk.com/oauth2/user_info', {
        method: 'POST',
        body: newFormData,
      })
    ).json();

    return {
      id: user_id,
      name: first_name + ' ' + last_name,
      accessToken: access_token,
      refreshToken: refresh_token + '&&&&' + device_id,
      expiresIn: dayjs().add(expires_in, 'seconds').unix() - dayjs().unix(),
      picture: avatar || '',
      username: first_name.toLowerCase(),
    };
  }

  async generateAuthUrl() {
    const state = makeId(32);
    const codeVerifier = randomBytes(64).toString('base64url');
    const challenge = Buffer.from(
      createHash('sha256').update(codeVerifier).digest()
    )
      .toString('base64')
      .replace(/=*$/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return {
      url:
        'https://id.vk.com/authorize' +
        `?response_type=code` +
        `&client_id=${process.env.VK_ID}` +
        `&code_challenge_method=S256` +
        `&code_challenge=${challenge}` +
        `&redirect_uri=${encodeURIComponent(
          `${process?.env.FRONTEND_URL?.indexOf('https') == -1
            ? `https://redirectmeto.com/${process?.env.FRONTEND_URL}`
            : `${process?.env.FRONTEND_URL}`
          }/integrations/social/vk`
        )}` +
        `&state=${state}` +
        `&scope=${encodeURIComponent(this.scopes.join(' '))}`,
      codeVerifier,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const [code, device_id] = params.code.split('&&&&');

    const formData = new FormData();
    formData.append('client_id', process.env.VK_ID!);
    formData.append('grant_type', 'authorization_code');
    formData.append('code_verifier', params.codeVerifier);
    formData.append('device_id', device_id);
    formData.append('code', code);
    formData.append(
      'redirect_uri',
      `${process?.env.FRONTEND_URL?.indexOf('https') == -1
        ? `https://redirectmeto.com/${process?.env.FRONTEND_URL}`
        : `${process?.env.FRONTEND_URL}`
      }/integrations/social/vk`
    );

    const { access_token, scope, refresh_token, expires_in } = await (
      await this.fetch('https://id.vk.com/oauth2/auth', {
        method: 'POST',
        body: formData,
      })
    ).json();

    const newFormData = new FormData();
    newFormData.append('client_id', process.env.VK_ID!);
    newFormData.append('access_token', access_token);

    const {
      user: { user_id, first_name, last_name, avatar },
    } = await (
      await this.fetch('https://id.vk.com/oauth2/user_info', {
        method: 'POST',
        body: newFormData,
      })
    ).json();

    return {
      id: user_id,
      name: first_name + ' ' + last_name,
      accessToken: access_token,
      refreshToken: refresh_token + '&&&&' + device_id,
      expiresIn: dayjs().add(expires_in, 'seconds').unix() - dayjs().unix(),
      picture: avatar || '',
      username: first_name.toLowerCase(),
    };
  }

  private async uploadMedia(
    userId: string,
    accessToken: string,
    post: PostDetails
  ): Promise<{ id: string; type: string }[]> {
    return await Promise.all(
      (post?.media || []).map(async (media) => {
        const all = await (
          await this.fetch(
            hasExtension(media.path, 'mp4')
              ? `https://api.vk.com/method/video.save?access_token=${accessToken}&v=5.251`
              : `https://api.vk.com/method/photos.getWallUploadServer?owner_id=${userId}&access_token=${accessToken}&v=5.251`
          )
        ).json();

        const { data } = await this.getSsrfSafeAxios().get(media.path!, {
          responseType: 'stream',
        });

        const slash = media.path.split('/').at(-1);

        const formData = new FormDataNew();
        formData.append('photo', data, {
          filename: slash,
          contentType: mime.lookup(slash!) || '',
        });
        const value = (
          await this.getSsrfSafeAxios().post(
            all.response.upload_url,
            formData,
            {
              headers: {
                ...formData.getHeaders(),
              },
            }
          )
        ).data;

        if (hasExtension(media.path, 'mp4')) {
          return {
            id: all.response.video_id,
            type: 'video',
          };
        }

        const formSend = new FormData();
        formSend.append('photo', value.photo);
        formSend.append('server', value.server);
        formSend.append('hash', value.hash);

        const { id } = (
          await (
            await fetch(
              `https://api.vk.com/method/photos.saveWallPhoto?access_token=${accessToken}&v=5.251`,
              {
                method: 'POST',
                body: formSend,
              }
            )
          ).json()
        ).response[0];

        return {
          id,
          type: 'photo',
        };
      })
    );
  }

  async post(
    userId: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;

    // Upload media for the first post
    const mediaList = await this.uploadMedia(userId, accessToken, firstPost);

    const body = new FormData();
    body.append('message', firstPost.message);

    if (mediaList.length) {
      body.append(
        'attachments',
        mediaList.map((p) => `${p.type}${userId}_${p.id}`).join(',')
      );
    }

    const { response } = await (
      await this.fetch(
        `https://api.vk.com/method/wall.post?v=5.251&access_token=${accessToken}&client_id=${process.env.VK_ID}`,
        {
          method: 'POST',
          body,
        }
      )
    ).json();

    return [
      {
        id: firstPost.id,
        postId: String(response?.post_id),
        releaseURL: `https://vk.com/feed?w=wall${userId}_${response?.post_id}`,
        status: 'completed',
      },
    ];
  }

  async comment(
    userId: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;

    // Upload media for the comment
    const mediaList = await this.uploadMedia(userId, accessToken, commentPost);

    const body = new FormData();
    body.append('message', commentPost.message);
    body.append('post_id', postId);

    if (mediaList.length) {
      body.append(
        'attachments',
        mediaList.map((p) => `${p.type}${userId}_${p.id}`).join(',')
      );
    }

    const { response } = await (
      await this.fetch(
        `https://api.vk.com/method/wall.createComment?v=5.251&access_token=${accessToken}&client_id=${process.env.VK_ID}`,
        {
          method: 'POST',
          body,
        }
      )
    ).json();

    return [
      {
        id: commentPost.id,
        postId: String(response?.comment_id),
        releaseURL: `https://vk.com/feed?w=wall${userId}_${postId}`,
        status: 'completed',
      },
    ];
  }
}

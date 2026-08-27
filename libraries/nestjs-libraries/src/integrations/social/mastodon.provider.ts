import {
  AuthTokenDetails,
  ChannelAnalyticsCaptureRequest,
  ChannelAnalyticsCapturePage,
  Follower,
  FollowerPage,
  FollowerQuery,
  FollowerSort,
  MemberPostsPage,
  MemberPostsQuery,
  MemberPostMedia,
  PendingCheckResponse,
  PostDetails,
  PostResponse,
  PublishedPostEditInput,
  SocialProvider,
  paginateDailyAnalyticsCapture,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { API_ORDER_FOLLOWER_SORTS } from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  BadBody,
  RefreshToken,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { timer } from '@gitroom/helpers/utils/timer';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Integration } from '@prisma/client';
import { number, string } from 'yup';
import FormDataUpload from 'form-data';
import { PassThrough, Readable } from 'stream';

dayjs.extend(utc);

// Travels through the workflow history between postPending, checkPostStatus
// and finalizePost - keep it small JSON (the instance url, media ids and the
// status content). The url makes checkPostStatus / finalizePost work the same
// for the default instance and custom instances.
type MastodonPendingData = {
  url: string;
  message: string;
  mediaIds: string[];
  idempotencyKey: string;
};

export class MastodonProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5; // Mastodon instances typically have generous limits
  identifier = 'mastodon';
  name = 'Mastodon';
  analyticsSnapshot = {
    capture: (request: ChannelAnalyticsCaptureRequest) =>
      this.captureAnalyticsSnapshot(request),
  };
  isBetweenSteps = false;
  scopes = ['write:statuses', 'profile', 'write:media'];
  editor = 'normal' as const;
  followerSorts: FollowerSort[] = API_ORDER_FOLLOWER_SORTS;

  private mastodonInstanceUrl() {
    return new URL(process.env.MASTODON_URL || 'https://mastodon.social');
  }

  protected resolveMastodonInstanceUrl(_integration?: Integration) {
    return this.mastodonInstanceUrl();
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
      const instance = this.resolveMastodonInstanceUrl(request.integration);
      const url = new URL(
        `/api/v1/accounts/${encodeURIComponent(
          request.integration.internalId
        )}`,
        instance
      );
      const response = await this.fetch(url.toString(), {
        headers: { Authorization: `Bearer ${request.accessToken}` },
      });
      const account = await response.json();
      const followers = Number(account?.followers_count);
      if (Number.isFinite(followers) && followers >= 0) {
        points.push({
          metricKey: 'followers',
          label: 'Followers',
          valueMode: 'latest',
          value: followers,
          day,
        });
      }
    } catch {
      // Leave points empty when the account lookup fails.
    }
    return paginateDailyAnalyticsCapture(
      request,
      { fromDay: day, toDay: day },
      points
    );
  }

  private decodeFollowerCursor(cursor?: string) {
    if (!cursor) {
      return {};
    }

    try {
      const value = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8')
      ) as Record<string, unknown>;
      const allowed = ['max_id', 'min_id', 'since_id'];

      return allowed.reduce<Record<string, string>>((params, key) => {
        if (
          typeof value[key] === 'string' &&
          value[key].length > 0 &&
          value[key].length <= 128
        ) {
          params[key] = value[key];
        }
        return params;
      }, {});
    } catch {
      return {};
    }
  }

  private encodeFollowerCursor(url: string | undefined) {
    if (!url) {
      return undefined;
    }

    try {
      const link = new URL(url);
      const cursor = ['max_id', 'min_id', 'since_id'].reduce<
        Record<string, string>
      >((params, key) => {
        const value = link.searchParams.get(key);
        if (value) {
          params[key] = value;
        }
        return params;
      }, {});

      return Object.keys(cursor).length
        ? Buffer.from(JSON.stringify(cursor)).toString('base64url')
        : undefined;
    } catch {
      return undefined;
    }
  }

  private followerLink(header: string | null, relation: 'next' | 'prev') {
    if (!header) {
      return undefined;
    }

    const link = header
      .split(',')
      .map((part) => part.trim())
      .find((part) => new RegExp(`rel="?${relation}"?`).test(part));
    return link?.match(/<([^>]+)>/)?.[1];
  }

  async followers(
    integration: Integration,
    accessToken: string,
    query: FollowerQuery
  ): Promise<FollowerPage> {
    const url = new URL(
      `/api/v1/accounts/${encodeURIComponent(
        integration.internalId
      )}/followers`,
      this.mastodonInstanceUrl()
    );
    const limit = Math.min(Math.max(query.limit, 1), 80);
    url.searchParams.set('limit', String(limit));
    for (const [key, value] of Object.entries(
      this.decodeFollowerCursor(query.cursor)
    )) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const accounts = (await response.json()) as any[];

    return {
      items: (Array.isArray(accounts) ? accounts : []).map((account) => ({
        id: String(account.id),
        name: account.display_name || account.acct || String(account.id),
        ...(account.acct ? { username: account.acct } : {}),
        ...(this.httpUrl(account.avatar)
          ? { picture: this.httpUrl(account.avatar) }
          : {}),
        ...(this.httpUrl(account.url)
          ? { profileUrl: this.httpUrl(account.url) }
          : {}),
        ...(account.note
          ? {
              bio: String(account.note)
                .replace(/<[^>]*>/g, '')
                .trim(),
            }
          : {}),
        ...(Number.isFinite(Number(account.followers_count))
          ? { followersCount: Number(account.followers_count) }
          : {}),
        ...(Number.isFinite(Number(account.following_count))
          ? { followingCount: Number(account.following_count) }
          : {}),
        ...(account.created_at ? { accountCreatedAt: account.created_at } : {}),
      })),
      ...(this.encodeFollowerCursor(
        this.followerLink(response.headers.get('link'), 'next')
      )
        ? {
            nextCursor: this.encodeFollowerCursor(
              this.followerLink(response.headers.get('link'), 'next')
            ),
          }
        : {}),
      ...(this.encodeFollowerCursor(
        this.followerLink(response.headers.get('link'), 'prev')
      )
        ? {
            previousCursor: this.encodeFollowerCursor(
              this.followerLink(response.headers.get('link'), 'prev')
            ),
          }
        : {}),
      hasMore: !!this.encodeFollowerCursor(
        this.followerLink(response.headers.get('link'), 'next')
      ),
    };
  }

  async followAudienceMember(
    _integration: Integration,
    accessToken: string,
    externalId: string
  ): Promise<void> {
    const url = new URL(
      `/api/v1/accounts/${encodeURIComponent(externalId)}/follow`,
      this.mastodonInstanceUrl()
    );
    const response = await this.fetch(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new BadBody(
        'Could not follow on Mastodon',
        undefined,
        {} as BodyInit
      );
    }
  }

  async unfollowAudienceMember(
    _integration: Integration,
    accessToken: string,
    externalId: string
  ): Promise<void> {
    const url = new URL(
      `/api/v1/accounts/${encodeURIComponent(externalId)}/unfollow`,
      this.mastodonInstanceUrl()
    );
    const response = await this.fetch(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new BadBody(
        'Could not unfollow on Mastodon',
        undefined,
        {} as BodyInit
      );
    }
  }

  async resolveAudienceProfileFromUrl(
    accessToken: string,
    integration: Integration,
    url: string
  ): Promise<Follower | null> {
    const target = this.parseMastodonProfileTarget(url, integration);
    if (!target) {
      return null;
    }
    try {
      const lookupUrl = new URL('/api/v1/accounts/lookup', target.instance);
      lookupUrl.searchParams.set('acct', target.acct);
      const response = await this.fetch(lookupUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        return null;
      }
      const account = (await response.json()) as any;
      if (!account?.id) {
        return null;
      }
      return {
        id: String(account.id),
        name: account.display_name || account.acct || String(account.id),
        ...(account.acct ? { username: account.acct } : {}),
        ...(this.httpUrl(account.avatar)
          ? { picture: this.httpUrl(account.avatar) }
          : {}),
        ...(this.httpUrl(account.url)
          ? { profileUrl: this.httpUrl(account.url) }
          : {}),
        ...(account.note
          ? {
              bio: String(account.note)
                .replace(/<[^>]*>/g, '')
                .trim(),
            }
          : {}),
        ...(Number.isFinite(Number(account.followers_count))
          ? { followersCount: Number(account.followers_count) }
          : {}),
        ...(Number.isFinite(Number(account.following_count))
          ? { followingCount: Number(account.following_count) }
          : {}),
        ...(account.created_at ? { accountCreatedAt: account.created_at } : {}),
      };
    } catch {
      return null;
    }
  }

  private parseMastodonProfileTarget(
    raw: string,
    integration: Integration
  ): { instance: URL; acct: string } | null {
    const trimmed = raw.trim().replace(/^@/, '');
    if (!trimmed) {
      return null;
    }
    const connected = this.resolveMastodonInstanceUrl(integration);
    if (trimmed.includes('@') && !trimmed.includes('/')) {
      const [local, domain] = trimmed.split('@');
      if (!local || !domain) {
        return null;
      }
      return {
        instance: connected,
        acct: `${local}@${domain}`,
      };
    }
    let parsed: URL;
    try {
      parsed = new URL(
        /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
      );
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    const atSegment = segments.find((segment) => segment.startsWith('@'));
    if (!atSegment) {
      return null;
    }
    const local = decodeURIComponent(atSegment).replace(/^@/, '');
    if (!local) {
      return null;
    }
    const instance = new URL(`${parsed.protocol}//${parsed.host}`);
    const sameHost =
      instance.hostname.replace(/^www\./i, '').toLowerCase() ===
      connected.hostname.replace(/^www\./i, '').toLowerCase();
    return {
      instance: connected,
      acct: sameHost ? local : `${local}@${instance.hostname}`,
    };
  }

  async memberPosts(
    _integration: Integration,
    accessToken: string,
    externalId: string,
    query: MemberPostsQuery
  ): Promise<MemberPostsPage> {
    const url = new URL(
      `/api/v1/accounts/${encodeURIComponent(externalId)}/statuses`,
      this.mastodonInstanceUrl()
    );
    const limit = Math.min(Math.max(query.limit, 1), 40);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('exclude_replies', 'false');
    for (const [key, value] of Object.entries(
      this.decodeFollowerCursor(query.cursor)
    )) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const statuses = (await response.json()) as Array<{
      id: string | number;
      content?: string;
      created_at?: string;
      url?: string;
      media_attachments?: Array<{
        type?: string;
        url?: string;
        preview_url?: string;
      }>;
    }>;

    const items = (Array.isArray(statuses) ? statuses : []).map((status) => {
      const media: MemberPostMedia[] =
        status.media_attachments?.flatMap((attachment) => {
          const mediaUrl = this.httpUrl(
            attachment.url || attachment.preview_url
          );
          if (!mediaUrl) {
            return [];
          }
          const mediaType: MemberPostMedia['type'] | undefined =
            attachment.type === 'video' || attachment.type === 'gifv'
              ? 'video'
              : attachment.type === 'image'
              ? 'image'
              : undefined;
          return mediaType
            ? [{ url: mediaUrl, type: mediaType }]
            : [{ url: mediaUrl }];
        }) ?? [];

      return {
        externalId: String(status.id),
        url: this.httpUrl(status.url) ?? String(status.id),
        content: String(status.content ?? '')
          .replace(/<[^>]*>/g, '')
          .trim(),
        publishedAt: status.created_at ?? new Date().toISOString(),
        ...(media.length ? { media } : {}),
      };
    });

    const nextLink = this.followerLink(response.headers.get('link'), 'next');
    const nextCursor = this.encodeFollowerCursor(nextLink);

    return {
      items,
      ...(nextCursor ? { nextCursor } : {}),
      hasMore: !!nextCursor,
    };
  }

  profileUrl(integration: Integration) {
    const instance = process.env.MASTODON_URL || 'https://mastodon.social';
    return integration.profile
      ? `${instance.replace(/\/$/, '')}/@${encodeURIComponent(
          integration.profile
        )}`
      : undefined;
  }

  maxLength() {
    return 500;
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    if (body.includes('Your login is currently disabled')) {
      return {
        type: 'refresh-token',
        value: 'Your login is currently disabled',
      };
    }

    if (body.includes('not finished processing')) {
      return {
        type: 'bad-body',
        value:
          'The media was still processing when the post was published, please try again',
      };
    }

    if (body.includes('could not be found')) {
      return {
        type: 'bad-body',
        value:
          'The uploaded media expired before the post was published, please post again',
      };
    }

    return undefined;
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
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
  protected generateUrlDynamic(
    customUrl: string,
    state: string,
    clientId: string,
    url: string
  ) {
    return `${customUrl}/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
      `${url}/integrations/social/mastodon`
    )}&scope=${this.scopes.join('+')}&state=${state}`;
  }

  async generateAuthUrl() {
    const state = makeId(6);
    const url = this.generateUrlDynamic(
      process.env.MASTODON_URL || 'https://mastodon.social',
      state,
      process.env.MASTODON_CLIENT_ID!,
      process.env.FRONTEND_URL!
    );
    return {
      url,
      codeVerifier: makeId(10),
      state,
    };
  }

  protected async dynamicAuthenticate(
    clientId: string,
    clientSecret: string,
    url: string,
    code: string
  ) {
    const form = new FormData();
    form.append('client_id', clientId);
    form.append('client_secret', clientSecret);
    form.append('code', code);
    form.append('grant_type', 'authorization_code');
    form.append(
      'redirect_uri',
      `${process.env.FRONTEND_URL}/integrations/social/mastodon`
    );
    form.append('scope', this.scopes.join(' '));

    const tokenInformation = await (
      await this.fetch(`${url}/oauth/token`, {
        method: 'POST',
        body: form,
      })
    ).json();

    const personalInformation = await (
      await this.fetch(`${url}/api/v1/accounts/verify_credentials`, {
        headers: {
          Authorization: `Bearer ${tokenInformation.access_token}`,
        },
      })
    ).json();

    return {
      id: personalInformation.id,
      name: personalInformation.display_name || personalInformation.acct,
      accessToken: tokenInformation.access_token,
      refreshToken: 'null',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      picture: personalInformation?.avatar || '',
      username: personalInformation.username,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    return this.dynamicAuthenticate(
      process.env.MASTODON_CLIENT_ID!,
      process.env.MASTODON_CLIENT_SECRET!,
      process.env.MASTODON_URL || 'https://mastodon.social',
      params.code
    );
  }

  async uploadFile(
    instanceUrl: string,
    fileUrl: string,
    accessToken: string,
    alt?: string
  ) {
    // The file is streamed straight from storage into the Mastodon upload
    // request instead of being buffered in memory. Both requests keep the
    // SSRF-safe dispatcher because the URLs are not fully under our control,
    // and the whole request is rebuilt per attempt by runStreamedUpload since
    // a consumed stream can't be replayed.
    const media = await this.runStreamedUpload<{ id: string }>(async () => {
      const fileResponse = await fetch(fileUrl, {
        // identity encoding so content-length matches the streamed bytes
        headers: { 'accept-encoding': 'identity' },
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });
      if (!fileResponse.ok || !fileResponse.body) {
        throw new Error(`Failed to fetch media: ${fileResponse.statusText}`);
      }
      const contentLength = Number(
        fileResponse.headers.get('content-length') || 0
      );

      const form = new FormDataUpload();
      form.append('file', Readable.fromWeb(fileResponse.body as any), {
        filename: fileUrl.split('/').pop()?.split('?')[0] || 'file',
        ...(contentLength ? { knownLength: contentLength } : {}),
      });
      if (alt) {
        form.append('description', alt);
      }

      const mediaResponse = await fetch(`${instanceUrl}/api/v1/media`, {
        method: 'POST',
        headers: {
          ...form.getHeaders(),
          // Some Mastodon front-ends reject chunked multipart, so send an
          // exact Content-Length whenever the source size is known.
          ...(contentLength
            ? { 'Content-Length': String(form.getLengthSync()) }
            : {}),
          Authorization: `Bearer ${accessToken}`,
        },
        // form-data is an old-style stream undici can't consume directly;
        // piping through a PassThrough turns it into a proper Readable.
        body: form.pipe(new PassThrough()),
        // Required by undici when streaming a request body.
        duplex: 'half',
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      } as any);

      if (
        mediaResponse.status !== 200 &&
        mediaResponse.status !== 201 &&
        mediaResponse.status !== 202
      ) {
        throw {
          response: {
            status: mediaResponse.status,
            data: await mediaResponse.text().catch(() => '{}'),
          },
        };
      }

      return (await mediaResponse.json()) as { id: string };
    }, this.identifier);

    return media.id;
  }

  protected async dynamicPostPending(
    id: string,
    accessToken: string,
    url: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;

    // Upload the media now; a 202 means the instance is still processing it
    // (videos, large GIFs) and attaching it to a status too early fails with
    // 422 - the wait moves to checkPostStatus. The status itself is only
    // created by finalizePost, so nothing here is irreversible.
    const uploadFiles = await Promise.all(
      firstPost?.media?.map((media) =>
        this.uploadFile(url, media.path, accessToken, media.alt)
      ) || []
    );

    return [
      {
        id: firstPost.id,
        releaseURL: '',
        postId: '',
        status: 'pending',
        pendingData: {
          url,
          message: firstPost.message,
          mediaIds: uploadFiles.filter(Boolean),
          // Statuses POSTs are deduplicated by Mastodon via Idempotency-Key.
          // Generated once per publish run: it rides pendingData through the
          // workflow history, so finalize retries within this run dedupe -
          // but an edited post re-published in a fresh run gets a new key
          // (the db post id alone would silently return the old status).
          idempotencyKey: `${firstPost.id}-${makeId(5)}`,
        } as MastodonPendingData,
      },
    ];
  }

  override async checkPostStatus(
    accessToken: string,
    pendingData: MastodonPendingData,
    integration: Integration
  ): Promise<PendingCheckResponse> {
    // Text-only statuses have no asynchronous processing step.
    if (!pendingData.mediaIds?.length) {
      return { status: 'ready', pendingData };
    }

    // GET /api/v1/media/:id answers 206 while the media is still processing
    // and 200 once it is ready - exactly the pending/ready split. this.fetch
    // treats 206 as an error, so use the raw fetch with the SSRF-safe
    // dispatcher (the instance URL is user-influenced for custom instances).
    for (const mediaId of pendingData.mediaIds) {
      let response: Response;
      try {
        response = await fetch(`${pendingData.url}/api/v1/media/${mediaId}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          // @ts-ignore - undici-only option; blocks SSRF to internal IPs
          dispatcher: getSsrfSafeDispatcher(),
        } as any);
      } catch (err) {
        // Transient status-check error: the media may finish processing just
        // fine, keep polling - if the instance stays broken the workflow
        // exhausts its checks and warns the user properly.
        return { status: 'pending', pendingData };
      }

      if (response.status === 206) {
        // consume the body so the undici socket is released between polls
        await response.text().catch(() => '');
        return { status: 'pending', pendingData };
      }

      if (response.status === 401) {
        throw new RefreshToken(
          this.identifier,
          await response.text().catch(() => '{}'),
          '{}'
        );
      }

      if (response.status === 404 || response.status === 410) {
        // The media GET only sees UNATTACHED media: after a finalize whose
        // outcome was lost, an already-published status makes its media 404
        // here. Never conclude "expired, post again" (that instruction is the
        // duplicate path) - keep checking the remaining media (a later 206
        // still wins) and let the idempotent finalize either dedupe into the
        // existing status or get Mastodon's verdict.
        await response.text().catch(() => '');
        continue;
      }

      if (response.status === 422) {
        throw new BadBody(
          this.identifier,
          await response.text().catch(() => '{}'),
          '{}',
          'The uploaded media expired before the post was published, please post again'
        );
      }

      await response.text().catch(() => '');

      if (response.status !== 200) {
        // Unknown answer on a read-only check: treat as transient.
        return { status: 'pending', pendingData };
      }
    }

    return { status: 'ready', pendingData };
  }

  override async finalizePost(
    accessToken: string,
    pendingData: MastodonPendingData,
    integration: Integration
  ): Promise<PendingCheckResponse> {
    const form = new FormData();
    form.append('status', pendingData.message);
    form.append('visibility', 'public');
    for (const file of pendingData.mediaIds || []) {
      form.append('media_ids[]', file);
    }

    const post = await (
      await this.fetch(`${pendingData.url}/api/v1/statuses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // Mastodon deduplicates statuses POSTs on this key (kept for about
          // an hour): a finalize retry after an unknown outcome returns the
          // already-created status instead of publishing twice. Guarded so a
          // missing key never serializes as the literal "undefined" header,
          // which would dedupe against an unrelated post.
          ...(pendingData.idempotencyKey
            ? { 'Idempotency-Key': pendingData.idempotencyKey }
            : {}),
        },
        body: form,
      })
    ).json();

    return {
      status: 'completed',
      postId: post.id,
      releaseURL: `${pendingData.url}/statuses/${post.id}`,
    };
  }

  // Old blocking behavior, kept for workflow versions before v1.0.6 that still
  // run and don't know how to resolve a `pending` response - they wait for the
  // media processing and create the status inside the activity like before.
  async dynamicPost(
    id: string,
    accessToken: string,
    url: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [response] = await this.dynamicPostPending(
      id,
      accessToken,
      url,
      postDetails
    );

    let pendingData = response.pendingData;
    const started = Date.now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // {} as Integration is safe here: checkPostStatus and finalizePost read
      // everything from pendingData (including the instance url) - keep it
      // that way if either method ever grows an integration dependency.
      const check = await this.checkPostStatus(
        accessToken,
        pendingData,
        {} as Integration
      );

      if (check.status === 'ready') {
        const finalize = await this.finalizePost(
          accessToken,
          check.pendingData,
          {} as Integration
        );

        if (finalize.status === 'completed') {
          return [
            {
              id: response.id,
              postId: finalize.postId,
              releaseURL: finalize.releaseURL,
              status: 'completed',
            },
          ];
        }

        pendingData = finalize.pendingData;
      } else if (check.status === 'completed') {
        return [
          {
            id: response.id,
            postId: check.postId,
            releaseURL: check.releaseURL,
            status: 'completed',
          },
        ];
      } else {
        pendingData = check.pendingData;
      }

      // Cap below the 10-minute activity timeout of the old workflows using
      // this method: failing here is safe (the status is only created once the
      // media is ready), timing the activity out is not - a retried activity
      // would upload and publish again.
      if (Date.now() - started > 8 * 60 * 1000) {
        throw new BadBody(
          this.identifier,
          '{}',
          '{}',
          'The media took too long to process, please try again'
        );
      }

      await timer(20000);
    }
  }

  async dynamicComment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    url: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    const replyToId = lastCommentId || postId;

    const uploadFiles = await Promise.all(
      commentPost?.media?.map((media) =>
        this.uploadFile(url, media.path, accessToken, media.alt)
      ) || []
    );

    const form = new FormData();
    form.append('status', commentPost.message);
    form.append('visibility', 'public');
    form.append('in_reply_to_id', replyToId);
    if (uploadFiles.length) {
      for (const file of uploadFiles) {
        form.append('media_ids[]', file);
      }
    }

    const post = await (
      await this.fetch(`${url}/api/v1/statuses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      })
    ).json();

    return [
      {
        id: commentPost.id,
        postId: post.id,
        releaseURL: `${url}/statuses/${post.id}`,
        status: 'completed',
      },
    ];
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return this.dynamicPost(
      id,
      accessToken,
      process.env.MASTODON_URL || 'https://mastodon.social',
      postDetails
    );
  }

  async postPending(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return this.dynamicPostPending(
      id,
      accessToken,
      process.env.MASTODON_URL || 'https://mastodon.social',
      postDetails
    );
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return this.dynamicComment(
      id,
      postId,
      lastCommentId,
      accessToken,
      process.env.MASTODON_URL || 'https://mastodon.social',
      postDetails
    );
  }

  supportsEdit(post: PublishedPostEditInput): boolean {
    return (
      post.state === 'PUBLISHED' &&
      !!post.releaseId &&
      post.releaseId !== 'missing'
    );
  }

  async editPost(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration,
    releaseId: string
  ): Promise<PostResponse[]> {
    return this.dynamicEdit(
      id,
      accessToken,
      process.env.MASTODON_URL || 'https://mastodon.social',
      postDetails,
      releaseId
    );
  }

  protected async dynamicEdit(
    id: string,
    accessToken: string,
    url: string,
    postDetails: PostDetails[],
    releaseId: string
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    if (!releaseId || releaseId === 'missing') {
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'This post cannot be edited on Mastodon because it has no platform id'
      );
    }

    const uploadFiles = await Promise.all(
      firstPost?.media?.map((media) =>
        this.uploadFile(url, media.path, accessToken, media.alt)
      ) || []
    );

    const pendingData: MastodonPendingData = {
      url,
      message: firstPost.message,
      mediaIds: uploadFiles.filter(Boolean),
      idempotencyKey: `${firstPost.id}-${makeId(5)}`,
    };

    const started = Date.now();
    let current = pendingData;
    while (true) {
      const check = await this.checkPostStatus(
        accessToken,
        current,
        {} as Integration
      );
      if (check.status === 'ready' || check.status === 'completed') {
        break;
      }

      current = check.pendingData;
      if (Date.now() - started > 8 * 60 * 1000) {
        throw new BadBody(
          this.identifier,
          '{}',
          '{}',
          'The media took too long to process, please try again'
        );
      }
      await timer(20000);
    }

    const form = new FormData();
    form.append('status', firstPost.message);
    for (const file of current.mediaIds || []) {
      form.append('media_ids[]', file);
    }

    const post = await (
      await this.fetch(`${url}/api/v1/statuses/${releaseId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      })
    ).json();

    return [
      {
        id: firstPost.id,
        postId: post.id || releaseId,
        releaseURL: post.url || `${url}/statuses/${post.id || releaseId}`,
        status: 'completed',
      },
    ];
  }
}

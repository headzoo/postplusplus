import {
  AuthTokenDetails,
  ChannelAnalyticsCaptureRequest,
  ChannelAnalyticsCapturePage,
  ChannelNoticeCategory,
  ChannelNoticeStatus,
  Follower,
  FollowerPage,
  FollowerQuery,
  FollowerSort,
  MemberPostsPage,
  MemberPostsQuery,
  PendingCheckResponse,
  PostDetails,
  PostResponse,
  SocialProvider,
  PostRulesCapabilityMetadata,
  PostRulesLoadMetricsResult,
  PostRulesRemovePostResult,
  PostRulesRepostResult,
  PostRulesAddPlugReplyResult,
  paginateDailyAnalyticsCapture,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { API_ORDER_FOLLOWER_SORTS } from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  BadBody,
  RefreshToken,
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  BskyAgent,
  RichText,
  AppBskyEmbedVideo,
  AppBskyVideoDefs,
  AtpAgent,
  BlobRef,
} from '@atproto/api';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Integration } from '@prisma/client';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import {
  getSsrfSafeAxios,
  getSsrfSafeDispatcher,
} from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import sharp from 'sharp';
import { Plug } from '@gitroom/helpers/decorators/plug.decorator';
import { timer } from '@gitroom/helpers/utils/timer';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';

dayjs.extend(utc);

async function reduceImageBySize(url: string, maxSizeKB = 976) {
  try {
    // Fetch the image from the URL
    const response = await getSsrfSafeAxios().get(url, {
      responseType: 'arraybuffer',
    });
    let imageBuffer = Buffer.from(response.data);

    // Use sharp to get the metadata of the image
    const metadata = await sharp(imageBuffer).metadata();
    let width = metadata.width!;
    let height = metadata.height!;

    // Resize iteratively until the size is below the threshold
    while (imageBuffer.length / 1024 > maxSizeKB) {
      width = Math.floor(width * 0.9); // Reduce dimensions by 10%
      height = Math.floor(height * 0.9);

      // Resize the image
      const resizedBuffer = await sharp(imageBuffer)
        .resize({ width, height })
        .toBuffer();

      imageBuffer = resizedBuffer;

      if (width < 10 || height < 10) break; // Prevent overly small dimensions
    }

    return { width, height, buffer: imageBuffer };
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

// Streams the video bytes to the Bluesky video service and returns the job
// status - it does NOT wait for the processing. The blob only exists once the
// job completes; a BlobRef can't survive JSON serialization through the
// workflow history, so callers re-read it from getVideoJobStatus when needed.
async function startVideoUpload(
  agent: AtpAgent,
  videoPath: string
): Promise<AppBskyVideoDefs.JobStatus> {
  const { data: serviceAuth } = await agent.com.atproto.server.getServiceAuth({
    aud: `did:web:${agent.dispatchUrl.host}`,
    lxm: 'com.atproto.repo.uploadBlob',
    exp: Date.now() / 1000 + 60 * 30, // 30 minutes
  });

  // The video is never buffered in memory: the size comes from a HEAD request
  // and the bytes are streamed straight from the source into the upload.
  const headResponse = await fetch(videoPath, {
    method: 'HEAD',
    // identity encoding so content-length matches the bytes the GET streams
    headers: { 'accept-encoding': 'identity' },
    // @ts-ignore - undici-only option; blocks SSRF to internal IPs
    dispatcher: getSsrfSafeDispatcher(),
  });
  const videoSize = Number(headResponse.headers.get('content-length') || 0);
  if (!headResponse.ok || !videoSize) {
    throw new BadBody(
      'bluesky',
      '{}',
      {} as any,
      'Could not determine the video size for Bluesky upload'
    );
  }

  const videoResponse = await fetch(videoPath, {
    headers: { 'accept-encoding': 'identity' },
    // @ts-ignore - undici-only option; blocks SSRF to internal IPs
    dispatcher: getSsrfSafeDispatcher(),
  });
  if (!videoResponse.ok || !videoResponse.body) {
    throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
  }

  console.log('Uploading video', videoPath, videoSize);

  const uploadUrl = new URL(
    'https://video.bsky.app/xrpc/app.bsky.video.uploadVideo'
  );
  uploadUrl.searchParams.append('did', agent.session!.did);
  uploadUrl.searchParams.append('name', videoPath.split('/').pop()!);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceAuth.token}`,
      'Content-Type': 'video/mp4',
      'Content-Length': videoSize.toString(),
    },
    body: videoResponse.body,
    // Required by undici when streaming a request body.
    duplex: 'half',
  } as any);

  const jobStatus = (await uploadResponse.json()) as AppBskyVideoDefs.JobStatus;
  console.log('JobId:', jobStatus.jobId);

  if (jobStatus.state === 'JOB_STATE_FAILED') {
    throw new BadBody(
      'bluesky',
      JSON.stringify({}),
      {} as any,
      'Could not upload video, job failed'
    );
  }

  return jobStatus;
}

// Single read of the processing job - the endpoint is public (no login), so
// status checks never spend Bluesky's strict createSession rate limits.
async function getVideoJobStatus(
  jobId: string
): Promise<AppBskyVideoDefs.JobStatus> {
  const videoAgent = new AtpAgent({ service: 'https://video.bsky.app' });
  const { data: status } = await videoAgent.app.bsky.video.getJobStatus({
    jobId,
  });
  return status.jobStatus;
}

// Blocking upload+wait, used by the paths that still resolve everything inside
// one activity (comments, and post() for pre-v1.0.6 workflows).
async function uploadVideo(
  agent: AtpAgent,
  videoPath: string
): Promise<AppBskyEmbedVideo.Main> {
  const jobStatus = await startVideoUpload(agent, videoPath);
  let blob: BlobRef | undefined = jobStatus.blob;

  let attempts = 0;
  const maxAttempts = 18; // ~9 minutes at 30s interval
  while (!blob) {
    if (attempts++ >= maxAttempts) {
      throw new BadBody(
        'bluesky',
        JSON.stringify({}),
        {} as any,
        'Video upload timed out, job did not complete'
      );
    }

    const status = await getVideoJobStatus(jobStatus.jobId);
    console.log('Status:', status.state, status.progress || '');
    if (status.blob) {
      blob = status.blob;
    }

    if (status.state === 'JOB_STATE_FAILED') {
      throw new BadBody(
        'bluesky',
        JSON.stringify({}),
        {} as any,
        'Could not upload video, job failed'
      );
    }

    await timer(30000);
  }

  console.log('posting video...');

  return {
    $type: 'app.bsky.embed.video',
    video: blob,
  } satisfies AppBskyEmbedVideo.Main;
}

// Travels through the workflow history between postPending, checkPostStatus
// and finalizePost - keep it small JSON: the video job id and the post
// content, never a BlobRef (it does not survive JSON serialization).
type BlueskyPendingData = {
  jobId: string; // empty for image-only posts (no asynchronous processing)
  message: string;
  media: { path: string; alt?: string }[];
  // Arm -> confirm -> publish handshake (same as the Facebook story flow):
  // finalizePost arms without mutating, checkPostStatus witnesses, and only a
  // witnessed attempt runs the create - so a create that dies with an unknown
  // outcome is detected instead of run again.
  attempting?: boolean;
  confirmed?: boolean;
  // Consecutive finalize preparation failures (login, image upload): bounded
  // so a dead integration fails with an accurate error instead of burning the
  // whole check budget and ending in a misleading "couldn't confirm" warning.
  prepFailures?: number;
};

const mapBlueskyNoticeReason = (
  reason: string
): ChannelNoticeCategory | undefined => {
  switch (reason) {
    case 'mention':
    case 'quote':
      return 'mention';
    case 'reply':
      return 'reply';
    case 'like':
    case 'like-via-repost':
      return 'like';
    case 'repost':
    case 'repost-via-repost':
      return 'repost';
    case 'follow':
      return 'follow';
    default:
      return undefined;
  }
};

@Rules(
  'Bluesky can have maximum 1 video or 4 pictures in one post, it can also be without attachments'
)
export class BlueskyProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 2; // Bluesky has moderate rate limits
  identifier = 'bluesky';
  name = 'Bluesky';
  analyticsSnapshot = {
    capture: (request: ChannelAnalyticsCaptureRequest) =>
      this.captureAnalyticsSnapshot(request),
  };
  toolTip =
    'We don’t currently support two-factor authentication. If it’s enabled on Bluesky, you’ll need to disable it.';
  isBetweenSteps = false;
  scopes = ['write:statuses', 'profile', 'write:media'];
  editor = 'normal' as const;
  followerSorts: FollowerSort[] = API_ORDER_FOLLOWER_SORTS;
  postRules = {
    metadata: () => this.getPostRulesMetadata(),
    loadMetrics: (
      integration: Integration,
      accessToken: string,
      externalPostId: string
    ) => this.loadPostRulesMetrics(integration, accessToken, externalPostId),
    removePost: (
      integration: Integration,
      accessToken: string,
      externalPostId: string
    ) => this.removePostViaRules(integration, accessToken, externalPostId),
    repost: (
      integration: Integration,
      accessToken: string,
      externalPostId: string
    ) => this.repostViaRules(integration, accessToken, externalPostId),
    addPlugReply: (
      integration: Integration,
      accessToken: string,
      externalPostId: string,
      content: string
    ) =>
      this.addPlugReplyViaRules(
        integration,
        accessToken,
        externalPostId,
        content
      ),
  };
  maxLength() {
    return 300;
  }

  profileUrl(integration: Integration) {
    return integration.profile
      ? `https://bsky.app/profile/${encodeURIComponent(integration.profile)}`
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
      const agent = await this.getAgent(request.integration);
      const { data: profile } = await agent.getProfile({
        actor: request.integration.internalId,
      });
      if (typeof profile?.followersCount === 'number') {
        points.push({
          metricKey: 'followers',
          label: 'Followers',
          valueMode: 'latest',
          value: profile.followersCount,
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
    const agent = await this.getAgent(integration);
    const { data } = await agent.app.bsky.graph.getFollowers({
      actor: integration.internalId,
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
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
      items: data.followers.map((profile) => ({
        id: profile.did,
        name: profile.displayName || profile.handle,
        username: profile.handle,
        ...(isHttpUrl(profile.avatar) ? { picture: profile.avatar } : {}),
        profileUrl: `https://bsky.app/profile/${encodeURIComponent(
          profile.handle
        )}`,
        ...(profile.description ? { bio: profile.description } : {}),
        ...(profile.createdAt ? { accountCreatedAt: profile.createdAt } : {}),
      })),
      ...(data.cursor ? { nextCursor: data.cursor } : {}),
      hasMore: !!data.cursor,
    };
  }

  async followAudienceMember(
    integration: Integration,
    _accessToken: string,
    externalId: string
  ): Promise<void> {
    const agent = await this.getAgent(integration);
    try {
      await agent.follow(externalId);
    } catch (error) {
      throw new BadBody(
        error instanceof Error ? error.message : 'Could not follow on Bluesky',
        undefined,
        {} as BodyInit
      );
    }
  }

  async unfollowAudienceMember(
    integration: Integration,
    _accessToken: string,
    externalId: string
  ): Promise<void> {
    const agent = await this.getAgent(integration);
    try {
      const { data: profile } = await agent.getProfile({ actor: externalId });
      const followUri = profile?.viewer?.following;
      if (!followUri) {
        return;
      }
      await agent.deleteFollow(followUri);
    } catch (error) {
      throw new BadBody(
        error instanceof Error
          ? error.message
          : 'Could not unfollow on Bluesky',
        undefined,
        {} as BodyInit
      );
    }
  }

  async resolveAudienceProfileFromUrl(
    _accessToken: string,
    integration: Integration,
    url: string
  ): Promise<Follower | null> {
    const actor = this.parseBlueskyProfileActor(url);
    if (!actor) {
      return null;
    }
    try {
      const agent = await this.getAgent(integration);
      const { data: profile } = await agent.getProfile({ actor });
      if (!profile?.did) {
        return null;
      }
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
        id: profile.did,
        name: profile.displayName || profile.handle,
        username: profile.handle,
        ...(isHttpUrl(profile.avatar) ? { picture: profile.avatar } : {}),
        profileUrl: `https://bsky.app/profile/${encodeURIComponent(
          profile.handle
        )}`,
        ...(profile.description ? { bio: profile.description } : {}),
        ...(profile.createdAt ? { accountCreatedAt: profile.createdAt } : {}),
      };
    } catch {
      return null;
    }
  }

  private parseBlueskyProfileActor(raw: string): string | null {
    const trimmed = raw.trim().replace(/^@/, '');
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith('did:')) {
      return trimmed;
    }
    if (
      !/^https?:\/\//i.test(trimmed) &&
      !trimmed.includes('/') &&
      trimmed.includes('.')
    ) {
      return trimmed;
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
    if (host !== 'bsky.app') {
      return null;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0] !== 'profile' || !segments[1]) {
      return null;
    }
    return decodeURIComponent(segments[1]);
  }

  async memberPosts(
    integration: Integration,
    _accessToken: string,
    externalId: string,
    query: MemberPostsQuery
  ): Promise<MemberPostsPage> {
    const agent = await this.getAgent(integration);
    const limit = Math.min(Math.max(query.limit, 1), 100);
    const { data } = await agent.app.bsky.feed.getAuthorFeed({
      actor: externalId,
      limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const items = data.feed.flatMap((item) => {
      const post = item.post;
      if (!post?.uri) {
        return [];
      }
      const record = post.record as { text?: string } | undefined;
      const rkey = post.uri.split('/').pop();
      const handle = post.author?.handle;
      const url =
        handle && rkey
          ? `https://bsky.app/profile/${encodeURIComponent(
              handle
            )}/post/${encodeURIComponent(rkey)}`
          : `https://bsky.app/profile/${encodeURIComponent(externalId)}`;

      const embed = post.embed as
        | {
            images?: Array<{ fullsize?: string; thumb?: string }>;
            video?: { playlist?: string };
          }
        | undefined;
      const media = [
        ...(embed?.images?.flatMap((image) => {
          const imageUrl = image.fullsize || image.thumb;
          return imageUrl ? [{ url: imageUrl, type: 'image' as const }] : [];
        }) ?? []),
        ...(embed?.video?.playlist
          ? [{ url: embed.video.playlist, type: 'video' as const }]
          : []),
      ];

      return [
        {
          externalId: rkey || post.cid,
          url,
          content: record?.text ?? '',
          publishedAt: post.indexedAt ?? new Date().toISOString(),
          ...(media.length ? { media } : {}),
        },
      ];
    });

    return {
      items,
      ...(data.cursor ? { nextCursor: data.cursor } : {}),
      hasMore: !!data.cursor,
    };
  }

  async channelNotices(
    integration: Integration,
    _accessToken: string,
    since: Date
  ): Promise<ChannelNoticeStatus> {
    try {
      const agent = await this.getAgent(integration);
      const { data } = await agent.app.bsky.notification.listNotifications({
        limit: 100,
      });

      const categories: Partial<Record<ChannelNoticeCategory, number>> = {};
      let unreadCount = 0;

      for (const notification of data.notifications) {
        if (!dayjs(notification.indexedAt).isAfter(since)) {
          continue;
        }

        if (notification.isRead) {
          continue;
        }

        const category = mapBlueskyNoticeReason(notification.reason);
        if (!category) {
          continue;
        }

        unreadCount += 1;
        categories[category] = (categories[category] || 0) + 1;
      }

      return {
        state: 'ok',
        unreadCount,
        categories,
      };
    } catch (err) {
      if (err instanceof RefreshToken) {
        throw err;
      }
      return { state: 'unavailable' };
    }
  }

  override async checkValidity(
    posts: Array<ValidityMedia[]>
  ): Promise<string | true> {
    if (
      posts?.some(
        (p) =>
          p?.some((a) => (a?.path?.indexOf?.('mp4') ?? -1) > -1) &&
          (p?.length ?? 0) > 1
      )
    ) {
      return 'You can only upload one video per post.';
    }

    if (posts?.some((p) => (p?.length ?? 0) > 4)) {
      return 'There can be maximum 4 pictures in a post.';
    }
    return true;
  }

  async customFields() {
    return [
      {
        key: 'service',
        label: 'Service',
        defaultValue: 'https://bsky.social',
        validation: `/^(https?:\\/\\/)?((([a-zA-Z0-9\\-_]{1,256}\\.[a-zA-Z]{2,6})|(([0-9]{1,3}\\.){3}[0-9]{1,3}))(:[0-9]{1,5})?)(\\/[^\\s]*)?$/`,
        type: 'text' as const,
      },
      {
        key: 'identifier',
        label: 'Identifier',
        validation: `/^.+$/`,
        type: 'text' as const,
      },
      {
        key: 'password',
        label: 'Password',
        validation: `/^.{3,}$/`,
        type: 'password' as const,
      },
    ];
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

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = JSON.parse(Buffer.from(params.code, 'base64').toString());

    // Bluesky talks to a user-supplied service URL via BskyAgent (not our
    // `this.fetch`), so the undici SSRF dispatcher can't intercept it. Validate
    // the URL here — the connection chokepoint — so an internal/private address
    // can never be saved as an integration. Opt-out matches the dispatcher env.
    if (
      process.env.DISABLE_SSRF_PROTECTION !== 'true' &&
      !(await isSafePublicHttpsUrl(body.service))
    ) {
      return 'Invalid service URL: must be a public HTTPS address';
    }

    try {
      const agent = new BskyAgent({
        service: body.service,
      });

      const {
        data: { accessJwt, refreshJwt, handle, did },
      } = await agent.login({
        identifier: body.identifier,
        password: body.password,
      });

      const profile = await agent.getProfile({
        actor: did,
      });

      return {
        refreshToken: refreshJwt,
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: accessJwt,
        id: did,
        name: profile.data.displayName!,
        picture: profile?.data?.avatar || '',
        username: profile.data.handle!,
      };
    } catch (e) {
      console.log(e);
      return 'Invalid credentials';
    }
  }

  private async getAgent(integration: Integration) {
    const body = JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
    const agent = new BskyAgent({
      service: body.service,
    });

    try {
      await agent.login({
        identifier: body.identifier,
        password: body.password,
      });
    } catch (err) {
      throw new RefreshToken('bluesky', JSON.stringify(err), {} as BodyInit);
    }

    return agent;
  }

  private async uploadMediaForPost(
    agent: BskyAgent,
    post: PostDetails
  ): Promise<{ embed: any; images: any[] }> {
    // Separate images and videos
    const imageMedia =
      post.media?.filter((p) => !hasExtension(p.path, 'mp4')) || [];
    const videoMedia =
      post.media?.filter((p) => hasExtension(p.path, 'mp4')) || [];

    // Upload images
    const images = await Promise.all(
      imageMedia.map(async (p) => {
        const { buffer, width, height } = await reduceImageBySize(p.path);
        return {
          width,
          height,
          buffer: await agent.uploadBlob(new Blob([buffer])),
        };
      })
    );

    // Upload videos (only one video per post is supported by Bluesky)
    let videoEmbed: AppBskyEmbedVideo.Main | null = null;
    if (videoMedia.length > 0) {
      videoEmbed = await uploadVideo(agent, videoMedia[0].path);
    }

    // Determine embed based on media types
    let embed: any = {};
    if (videoEmbed) {
      embed = videoEmbed;
    } else if (images.length > 0) {
      embed = {
        $type: 'app.bsky.embed.images',
        images: images.map((p, index) => ({
          alt: imageMedia?.[index]?.alt || '',
          image: p.buffer.data.blob,
          aspectRatio: {
            width: p.width,
            height: p.height,
          },
        })),
      };
    }

    return { embed, images };
  }

  async postPending(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const videoMedia =
      firstPost.media?.filter((p) => hasExtension(p.path, 'mp4')) || [];

    // Only the video has an asynchronous processing step: start its upload job
    // now, the wait moves to checkPostStatus. Images are uploaded by
    // finalizePost (their BlobRefs can't survive JSON serialization through
    // the workflow history). Nothing here is irreversible - an unused video
    // job leaves no post behind.
    let jobId = '';
    if (videoMedia.length > 0) {
      const agent = await this.getAgent(integration);
      const jobStatus = await startVideoUpload(agent, videoMedia[0].path);
      jobId = jobStatus.jobId;
    }

    return [
      {
        id: firstPost.id,
        releaseURL: '',
        postId: '',
        status: 'pending',
        pendingData: {
          jobId,
          message: firstPost.message,
          media: (firstPost.media || []).map((m) => ({
            path: m.path,
            alt: m.alt || '',
          })),
        } as BlueskyPendingData,
      },
    ];
  }

  override async checkPostStatus(
    accessToken: string,
    pendingData: BlueskyPendingData,
    integration: Integration
  ): Promise<PendingCheckResponse> {
    // A confirmed create attempt died without reporting its result: never run
    // the create again - stop with an explicit warning instead.
    if (pendingData.attempting && pendingData.confirmed) {
      throw new BadBody(
        'bluesky',
        JSON.stringify({}),
        {} as any,
        'Bluesky may have already published this post, please check your account before posting again to avoid duplicates'
      );
    }

    // witness the armed create so finalizePost knows the attempt is uniquely
    // accounted for before it mutates anything
    const witness = (): PendingCheckResponse =>
      pendingData.attempting && !pendingData.confirmed
        ? {
            status: 'ready',
            pendingData: { ...pendingData, confirmed: true },
          }
        : { status: 'ready', pendingData };

    // Image-only posts have no asynchronous processing step.
    if (!pendingData.jobId) {
      return witness();
    }

    let status: AppBskyVideoDefs.JobStatus;
    try {
      status = await getVideoJobStatus(pendingData.jobId);
    } catch (err) {
      if (err instanceof RefreshToken) {
        throw err;
      }

      // Transient status-check error: the job may finish processing just
      // fine, keep polling - if the video service stays broken the workflow
      // exhausts its checks and warns the user properly.
      return { status: 'pending', pendingData };
    }

    if (status.state === 'JOB_STATE_FAILED') {
      throw new BadBody(
        'bluesky',
        JSON.stringify(status),
        {} as any,
        'Could not upload video, job failed'
      );
    }

    if (status.blob) {
      return witness();
    }

    return { status: 'pending', pendingData };
  }

  override async finalizePost(
    accessToken: string,
    pendingData: BlueskyPendingData,
    integration: Integration
  ): Promise<PendingCheckResponse> {
    // Create with an arm -> confirm -> publish handshake: the create only runs
    // after checkPostStatus witnessed the intent, so a run that dies
    // mid-create is detectable and the post is never published twice.
    if (!pendingData.attempting || !pendingData.confirmed) {
      return {
        status: 'pending',
        pendingData: { ...pendingData, attempting: true, confirmed: false },
      };
    }

    // Everything up to the create itself is preparation: none of it mutates
    // the account, so a failure here must NOT leave the confirmed handshake
    // armed - the next check would report a false "may already be published"
    // warning. Disarm and hand back to the workflow to try again instead; the
    // only unknown-outcome window left is agent.post below.
    let agent: BskyAgent;
    let embed: any = {};
    let rt: RichText;
    try {
      agent = await this.getAgent(integration);

      if (pendingData.jobId) {
        // Re-read the blob from the job (a BlobRef never travels through the
        // workflow history).
        const status = await getVideoJobStatus(pendingData.jobId);

        if (status.state === 'JOB_STATE_FAILED') {
          throw new BadBody(
            'bluesky',
            JSON.stringify(status),
            {} as any,
            'Could not upload video, job failed'
          );
        }

        if (!status.blob) {
          // The blob disappeared between the check and now (or the check was
          // skipped): hand back to the workflow to keep polling.
          return {
            status: 'pending',
            pendingData: {
              ...pendingData,
              attempting: false,
              confirmed: false,
            },
          };
        }

        embed = {
          $type: 'app.bsky.embed.video',
          video: status.blob,
        } satisfies AppBskyEmbedVideo.Main;
      } else {
        const built = await this.uploadMediaForPost(agent, {
          media: pendingData.media,
        } as PostDetails);
        embed = built.embed;
      }

      rt = new RichText({
        text: pendingData.message,
      });

      await rt.detectFacets(agent);
    } catch (err) {
      // Explicit verdicts keep their meaning: a failed video job fails the
      // post, an invalid login goes through the refresh-token flow.
      if (err instanceof BadBody || err instanceof RefreshToken) {
        throw err;
      }

      // Repeated preparation failures mean the integration is broken, not
      // flaky: fail with an accurate message - nothing was ever created, so
      // this is safe and beats exhausting the check budget into a misleading
      // "check your account" warning.
      if ((pendingData.prepFailures || 0) >= 4) {
        throw new BadBody(
          'bluesky',
          JSON.stringify({}),
          {} as any,
          'Could not prepare the post for Bluesky, nothing was published, please try again'
        );
      }

      // Transient preparation error, nothing was created: disarm so the
      // workflow keeps polling and a later cycle re-arms.
      return {
        status: 'pending',
        pendingData: {
          ...pendingData,
          attempting: false,
          confirmed: false,
          prepFailures: (pendingData.prepFailures || 0) + 1,
        },
      };
    }

    let uri: string;
    try {
      // @ts-ignore
      const created = await agent.post({
        text: rt.text,
        facets: rt.facets,
        createdAt: new Date().toISOString(),
        ...(Object.keys(embed).length > 0 ? { embed } : {}),
      });
      uri = created.uri;
    } catch (err: any) {
      // A definite 4xx rejection (invalid record, payload too large) means
      // the post was NOT created: fail it properly instead of leaving the
      // armed handshake to report a false "may already be published" warning.
      // Ambiguous answers (network errors, 5xx, 429) stay on the conservative
      // unknown-outcome path. No 408 exclusion: the xrpc client maps every
      // status it does not know - including 408 - to 400 before we see it.
      const status = err?.status;
      if (
        typeof status === 'number' &&
        status >= 400 &&
        status < 500 &&
        status !== 429
      ) {
        throw new BadBody(
          'bluesky',
          JSON.stringify(err?.error || err?.message || {}),
          {} as any,
          'Bluesky rejected the post, nothing was published, please check the content and try again'
        );
      }

      throw err;
    }

    return {
      status: 'completed',
      postId: uri,
      releaseURL: `https://bsky.app/profile/${integration.internalId}/post/${uri
        .split('/')
        .pop()}`,
    };
  }

  // Old blocking behavior, kept for workflow versions before v1.0.6 that still
  // run and don't know how to resolve a `pending` response - they wait for the
  // processing and create the post inside the activity like before.
  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [response] = await this.postPending(
      id,
      accessToken,
      postDetails,
      integration
    );

    let pendingData = response.pendingData;
    const started = Date.now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Cap below the 10-minute activity timeout of the old workflows using
      // this method: failing here is safe (the post is only created once the
      // video is processed), timing the activity out is not - a retried
      // activity would upload and publish again.
      if (Date.now() - started > 8 * 60 * 1000) {
        throw new BadBody(
          'bluesky',
          JSON.stringify({}),
          {} as any,
          'Video upload timed out, job did not complete'
        );
      }

      const check = await this.checkPostStatus(
        accessToken,
        pendingData,
        integration
      );

      if (check.status === 'pending') {
        pendingData = check.pendingData;
        await timer(20000);
        continue;
      }

      const result =
        check.status === 'ready'
          ? await this.finalizePost(accessToken, check.pendingData, integration)
          : check;

      if (result.status === 'completed') {
        return [
          {
            id: response.id,
            postId: result.postId,
            status: 'completed',
            releaseURL: result.releaseURL,
          },
        ];
      }

      pendingData = result.pendingData;

      // An armed pending just loops into the witnessing check; a de-armed one
      // is a transient preparation failure (login, image upload) - back off
      // before retrying instead of hammering the login endpoint.
      if (!(result.pendingData as BlueskyPendingData)?.attempting) {
        await timer(20000);
      }
    }
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const agent = await this.getAgent(integration);
    const [commentPost] = postDetails;

    const { embed } = await this.uploadMediaForPost(agent, commentPost);

    const rt = new RichText({
      text: commentPost.message,
    });

    await rt.detectFacets(agent);

    // Get the parent post info to get its CID
    const parentUri = lastCommentId || postId;

    // Fetch the parent post to get its CID
    const parentThread = await agent.getPostThread({
      uri: parentUri,
      depth: 0,
    });

    const parentPost =
      'post' in parentThread.data.thread
        ? parentThread.data.thread.post
        : undefined;
    const parentCid = parentPost?.cid;
    const replyRoot = (
      parentPost?.record as
        | { reply?: { root?: { uri?: string; cid?: string } } }
        | undefined
    )?.reply?.root;
    const rootUri = replyRoot?.uri || postId;
    const rootCid = replyRoot?.cid || parentCid;

    // @ts-ignore
    const { cid, uri, commit } = await agent.post({
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
      ...(Object.keys(embed).length > 0 ? { embed } : {}),
      reply: {
        root: {
          uri: rootUri,
          cid: rootCid,
        },
        parent: {
          uri: parentUri,
          cid: parentCid,
        },
      },
    });

    return [
      {
        id: commentPost.id,
        postId: uri,
        status: 'completed',
        releaseURL: `https://bsky.app/profile/${id}/post/${uri
          .split('/')
          .pop()}`,
      },
    ];
  }

  private getPostRulesMetadata(): PostRulesCapabilityMetadata {
    return {
      actions: {
        remove: true,
        autoRepost: true,
        autoPlug: true,
        notify: true,
      },
      metrics: {
        likes: true,
        replies: true,
      },
    };
  }

  private async loadPostRulesMetrics(
    integration: Integration,
    accessToken: string,
    externalPostId: string
  ): Promise<PostRulesLoadMetricsResult> {
    try {
      const agent = await this.getAgent(integration);
      const getThread = await agent.getPostThread({
        uri: externalPostId,
        depth: 0,
      });

      // @ts-ignore
      const post = getThread.data.thread.post;
      const likeCount = post?.likeCount || 0;
      const replyCount = post?.replyCount;

      return {
        status: 'success',
        metrics: {
          likes: likeCount,
          ...(typeof replyCount === 'number' ? { replies: replyCount } : {}),
        },
      };
    } catch (err: any) {
      if (err?.status === 404 || err?.error === 'NotFound') {
        return { status: 'not_found' };
      }
      if (err?.status === 401 || err?.status === 403) {
        return { status: 'auth_error' };
      }
      return {
        status: 'retryable_failure',
        reason: err?.message || 'Unknown error',
      };
    }
  }

  private async removePostViaRules(
    integration: Integration,
    accessToken: string,
    externalPostId: string
  ): Promise<PostRulesRemovePostResult> {
    try {
      const agent = await this.getAgent(integration);
      await agent.deletePost(externalPostId);
      return { status: 'removed' };
    } catch (err: any) {
      if (err?.status === 404 || err?.error === 'NotFound') {
        return { status: 'already_absent' };
      }
      if (err?.status === 401 || err?.status === 403) {
        return { status: 'auth_error' };
      }
      return {
        status: 'retryable_failure',
        reason: err?.message || 'Unknown error',
      };
    }
  }

  private async repostViaRules(
    integration: Integration,
    accessToken: string,
    externalPostId: string
  ): Promise<PostRulesRepostResult> {
    try {
      const agent = await this.getAgent(integration);
      const getThread = await agent.getPostThread({
        uri: externalPostId,
        depth: 0,
      });

      await timer(2000);
      await agent.repost(
        // @ts-ignore
        getThread.data.thread.post?.uri,
        // @ts-ignore
        getThread.data.thread.post?.cid
      );
      return {
        status: 'reposted',
        remoteReleaseId: externalPostId,
      };
    } catch (err: any) {
      if (err?.message?.includes('already exists')) {
        return { status: 'already_reposted' };
      }
      if (err?.status === 401 || err?.status === 403) {
        return { status: 'auth_error' };
      }
      return {
        status: 'retryable_failure',
        reason: err?.message || 'Unknown error',
      };
    }
  }

  private async addPlugReplyViaRules(
    integration: Integration,
    accessToken: string,
    externalPostId: string,
    content: string
  ): Promise<PostRulesAddPlugReplyResult> {
    try {
      const agent = await this.getAgent(integration);
      const getThread = await agent.getPostThread({
        uri: externalPostId,
        depth: 0,
      });

      await timer(2000);
      const rt = new RichText({
        text: stripHtmlValidation('normal', content, true),
      });

      const result = await agent.post({
        text: rt.text,
        facets: rt.facets,
        createdAt: new Date().toISOString(),
        reply: {
          root: {
            // @ts-ignore
            uri: getThread.data.thread.post?.uri,
            // @ts-ignore
            cid: getThread.data.thread.post?.cid,
          },
          parent: {
            // @ts-ignore
            uri: getThread.data.thread.post?.uri,
            // @ts-ignore
            cid: getThread.data.thread.post?.cid,
          },
        },
      });

      return {
        status: 'added',
        remoteReleaseId: result.uri,
      };
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        return { status: 'auth_error' };
      }
      return {
        status: 'retryable_failure',
        reason: err?.message || 'Unknown error',
      };
    }
  }

  @Plug({
    identifier: 'bluesky-autoRepostPost',
    title: 'Auto Repost Posts',
    description:
      'When a post reached a certain number of likes, repost it to increase engagement (1 week old posts)',
    runEveryMilliseconds: 21600000,
    totalRuns: 3,
    fields: [
      {
        name: 'likesAmount',
        type: 'number',
        placeholder: 'Amount of likes',
        description: 'The amount of likes to trigger the repost',
        validation: /^\d+$/,
      },
    ],
  })
  async autoRepostPost(
    integration: Integration,
    id: string,
    fields: { likesAmount: string }
  ) {
    const metricsResult = await this.loadPostRulesMetrics(
      integration,
      '', // accessToken not used for Bluesky (uses customInstanceDetails)
      id
    );

    if (
      metricsResult.status === 'success' &&
      metricsResult.metrics.likes! >= +fields.likesAmount
    ) {
      const result = await this.repostViaRules(integration, '', id);
      return (
        result.status === 'reposted' || result.status === 'already_reposted'
      );
    }

    return false;
  }

  @Plug({
    identifier: 'bluesky-autoPlugPost',
    title: 'Auto plug post',
    description:
      'When a post reached a certain number of likes, add another post to it so you followers get a notification about your promotion',
    runEveryMilliseconds: 21600000,
    totalRuns: 3,
    fields: [
      {
        name: 'likesAmount',
        type: 'number',
        placeholder: 'Amount of likes',
        description: 'The amount of likes to trigger the repost',
        validation: /^\d+$/,
      },
      {
        name: 'post',
        type: 'richtext',
        placeholder: 'Post to plug',
        description: 'Message content to plug',
        validation: /^[\s\S]{3,}$/g,
      },
    ],
  })
  async autoPlugPost(
    integration: Integration,
    id: string,
    fields: { likesAmount: string; post: string }
  ) {
    const metricsResult = await this.loadPostRulesMetrics(integration, '', id);

    if (
      metricsResult.status === 'success' &&
      metricsResult.metrics.likes! >= +fields.likesAmount
    ) {
      const result = await this.addPlugReplyViaRules(
        integration,
        '',
        id,
        fields.post
      );
      return result.status === 'added';
    }

    return false;
  }

  override async mention(
    token: string,
    d: { query: string },
    id: string,
    integration: Integration
  ) {
    const body = JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );

    const agent = new BskyAgent({
      service: body.service,
    });

    await agent.login({
      identifier: body.identifier,
      password: body.password,
    });

    const list = await agent.searchActors({
      q: d.query,
    });

    return list.data.actors.map((p) => ({
      label: p.displayName,
      id: p.handle,
      image: p.avatar,
    }));
  }

  mentionFormat(idOrHandle: string, name: string) {
    return `@${idOrHandle}`;
  }
}

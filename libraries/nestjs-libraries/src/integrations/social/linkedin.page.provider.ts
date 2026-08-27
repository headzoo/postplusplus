import {
  AnalyticsData,
  AuthTokenDetails,
  ChannelAnalyticsCapturePage,
  ChannelAnalyticsCaptureRequest,
  paginateDailyAnalyticsCapture,
  PostDetails,
  PostResponse,
  SocialProvider,
  PostRulesCapabilityMetadata,
  PostRulesLoadMetricsResult,
  PostRulesRemovePostResult,
  PostRulesRepostResult,
  PostRulesAddPlugReplyResult,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { LinkedinProvider } from '@gitroom/nestjs-libraries/integrations/social/linkedin.provider';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Integration } from '@prisma/client';
import { Plug } from '@gitroom/helpers/decorators/plug.decorator';
import { timer } from '@gitroom/helpers/utils/timer';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

dayjs.extend(utc);

@Rules(
  'LinkedIn can have maximum one attachment when selecting video, when choosing a carousel on LinkedIn minimum amount of attachment must be two, and only pictures, if uploading a video, LinkedIn can have only one attachment'
)
export class LinkedinPageProvider
  extends LinkedinProvider
  implements SocialProvider
{
  override identifier = 'linkedin-page';
  analyticsSnapshot = {
    capture: (request: ChannelAnalyticsCaptureRequest) =>
      this.captureAnalyticsSnapshot(request),
  };
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
  override name = 'LinkedIn Page';
  override isBetweenSteps = true;
  override refreshWait = true;
  override maxConcurrentJob = 2; // LinkedIn Page has professional posting limits
  override scopes = [
    'openid',
    'profile',
    'w_member_social',
    'r_basicprofile',
    'rw_organization_admin',
    'w_organization_social',
    'r_organization_social',
  ];

  override editor = 'normal' as const;

  override profileUrl(integration: Integration) {
    return integration.profile
      ? `https://www.linkedin.com/company/${encodeURIComponent(
          integration.profile
        )}`
      : undefined;
  }

  override async refreshToken(
    refresh_token: string
  ): Promise<AuthTokenDetails> {
    const {
      access_token: accessToken,
      expires_in,
      refresh_token: refreshToken,
    } = await (
      await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token,
          client_id: process.env.LINKEDIN_CLIENT_ID!,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        }),
      })
    ).json();

    const { vanityName } = await (
      await fetch('https://api.linkedin.com/v2/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    const {
      name,
      sub: id,
      picture,
    } = await (
      await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    return {
      id,
      accessToken,
      refreshToken,
      expiresIn: expires_in,
      name,
      picture,
      username: vanityName,
    };
  }

  override async addComment(
    integration: Integration,
    originalIntegration: Integration,
    postId: string,
    information: any
  ) {
    return super.addComment(
      integration,
      originalIntegration,
      postId,
      information,
      false
    );
  }

  override async repostPostUsers(
    integration: Integration,
    originalIntegration: Integration,
    postId: string,
    information: any
  ) {
    return super.repostPostUsers(
      integration,
      originalIntegration,
      postId,
      information,
      false
    );
  }

  override async generateAuthUrl() {
    const state = makeId(6);
    const codeVerifier = makeId(30);
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&prompt=none&client_id=${
      process.env.LINKEDIN_CLIENT_ID
    }&redirect_uri=${encodeURIComponent(
      `${process.env.FRONTEND_URL}/integrations/social/linkedin-page`
    )}&state=${state}&scope=${encodeURIComponent(this.scopes.join(' '))}`;
    return {
      url,
      codeVerifier,
      state,
    };
  }

  async companies(accessToken: string) {
    const { elements, ...all } = await (
      await fetch(
        'https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationalTarget~(localizedName,vanityName,logoV2(original~:playableStreams))))',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202601',
          },
        }
      )
    ).json();

    return (elements || []).map((e: any) => ({
      id: e.organizationalTarget.split(':').pop(),
      page: e.organizationalTarget.split(':').pop(),
      username: e['organizationalTarget~'].vanityName,
      name: e['organizationalTarget~'].localizedName,
      picture:
        e['organizationalTarget~'].logoV2?.['original~']?.elements?.[0]
          ?.identifiers?.[0]?.identifier,
    }));
  }

  async reConnect(
    id: string,
    requiredId: string,
    accessToken: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    const information = await this.fetchPageInformation(accessToken, {
      page: requiredId,
    });

    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
    };
  }

  async fetchPageInformation(accessToken: string, params: { page: string }) {
    const pageId = params.page;
    const data = await (
      await fetch(
        `https://api.linkedin.com/v2/organizations/${pageId}?projection=(id,localizedName,vanityName,logoV2(original~:playableStreams))`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
    ).json();

    return {
      id: data.id,
      name: data.localizedName,
      access_token: accessToken,
      picture:
        data?.logoV2?.['original~']?.elements?.[0]?.identifiers?.[0].identifier,
      username: data.vanityName,
    };
  }

  override async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('code', params.code);
    body.append(
      'redirect_uri',
      `${process.env.FRONTEND_URL}/integrations/social/linkedin-page`
    );
    body.append('client_id', process.env.LINKEDIN_CLIENT_ID!);
    body.append('client_secret', process.env.LINKEDIN_CLIENT_SECRET!);

    const {
      access_token: accessToken,
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope,
    } = await (
      await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      })
    ).json();

    this.checkScopes(this.scopes, scope);

    const {
      name,
      sub: id,
      picture,
    } = await (
      await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    const { vanityName } = await (
      await fetch('https://api.linkedin.com/v2/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    return {
      id: id,
      accessToken,
      refreshToken,
      expiresIn,
      name,
      picture,
      username: vanityName,
    };
  }

  override async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return super.post(id, accessToken, postDetails, integration, 'company');
  }

  // checkPostStatus / finalizePost are inherited as-is: the company context
  // travels inside pendingData (postType), set here once.
  override async postPending(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return super.postPending(
      id,
      accessToken,
      postDetails,
      integration,
      'company'
    );
  }

  override async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return super.comment(
      id,
      postId,
      lastCommentId,
      accessToken,
      postDetails,
      integration,
      'company'
    );
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const endDate = dayjs().unix() * 1000;
    const startDate = dayjs().subtract(date, 'days').unix() * 1000;

    const { elements }: { elements: Root[]; paging: any } = await (
      await fetch(
        `https://api.linkedin.com/v2/organizationPageStatistics?q=organization&organization=${encodeURIComponent(
          `urn:li:organization:${id}`
        )}&timeIntervals=(timeRange:(start:${startDate},end:${endDate}),timeGranularityType:DAY)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Linkedin-Version': '202601',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )
    ).json();

    const { elements: elements2 }: { elements: Root[]; paging: any } = await (
      await fetch(
        `https://api.linkedin.com/v2/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(
          `urn:li:organization:${id}`
        )}&timeIntervals=(timeRange:(start:${startDate},end:${endDate}),timeGranularityType:DAY)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Linkedin-Version': '202601',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )
    ).json();

    const { elements: elements3 }: { elements: Root[]; paging: any } = await (
      await fetch(
        `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(
          `urn:li:organization:${id}`
        )}&timeIntervals=(timeRange:(start:${startDate},end:${endDate}),timeGranularityType:DAY)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Linkedin-Version': '202601',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )
    ).json();

    const analytics = [...elements2, ...elements, ...elements3].reduce(
      (all, current) => {
        if (
          typeof current?.totalPageStatistics?.views?.allPageViews
            ?.pageViews !== 'undefined'
        ) {
          all['Page Views'].push({
            total: current.totalPageStatistics.views.allPageViews.pageViews,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });
        }

        if (
          typeof current?.followerGains?.organicFollowerGain !== 'undefined'
        ) {
          all['Organic Followers'].push({
            total: current?.followerGains?.organicFollowerGain,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });
        }

        if (typeof current?.followerGains?.paidFollowerGain !== 'undefined') {
          all['Paid Followers'].push({
            total: current?.followerGains?.paidFollowerGain,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });
        }

        if (typeof current?.totalShareStatistics !== 'undefined') {
          all['Clicks'].push({
            total: current?.totalShareStatistics.clickCount,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });

          all['Shares'].push({
            total: current?.totalShareStatistics.shareCount,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });

          all['Engagement'].push({
            total: current?.totalShareStatistics.engagement,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });

          all['Comments'].push({
            total: current?.totalShareStatistics.commentCount,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });
        }

        return all;
      },
      {
        'Page Views': [] as any[],
        Clicks: [] as any[],
        Shares: [] as any[],
        Engagement: [] as any[],
        Comments: [] as any[],
        'Organic Followers': [] as any[],
        'Paid Followers': [] as any[],
      }
    );

    return Object.keys(analytics).map((key) => ({
      label: key,
      data: analytics[
        key as 'Page Views' | 'Organic Followers' | 'Paid Followers'
      ],
      percentageChange: 5,
    }));
  }

  private async captureAnalyticsSnapshot(
    request: ChannelAnalyticsCaptureRequest
  ): Promise<ChannelAnalyticsCapturePage> {
    const toDay = dayjs.utc(request.toDay || request.snapshotAt).startOf('day');
    const fromDay = dayjs
      .utc(
        request.fromDay || dayjs.utc(request.snapshotAt).subtract(180, 'day')
      )
      .startOf('day');
    const endDate = toDay.unix() * 1000;
    const startDate = fromDay.unix() * 1000;
    const headers = {
      Authorization: `Bearer ${request.accessToken}`,
      'Linkedin-Version': '202601',
      'X-Restli-Protocol-Version': '2.0.0',
    };
    const organization = encodeURIComponent(
      `urn:li:organization:${request.integration.internalId}`
    );
    const timeIntervals = `(timeRange:(start:${startDate},end:${endDate}),timeGranularityType:DAY)`;
    const responses = await Promise.all(
      [
        `organizationPageStatistics?q=organization&organization=${organization}&timeIntervals=${timeIntervals}`,
        `organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${organization}&timeIntervals=${timeIntervals}`,
        `organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${organization}&timeIntervals=${timeIntervals}`,
      ].map((path) => fetch(`https://api.linkedin.com/v2/${path}`, { headers }))
    );
    const [page, followers, shares] = await Promise.all(
      responses.map((response) => response.json())
    );
    if (
      responses.some((response) => !response.ok) ||
      [page, followers, shares].some(
        (body) => body?.serviceErrorCode || (body?.message && !body?.elements)
      )
    ) {
      throw new Error('LinkedIn analytics request failed');
    }
    const points: any[] = [];
    const push = (
      element: any,
      metricKey: string,
      label: string,
      value: unknown,
      valueMode: 'sum' | 'average' = 'sum',
      displayUnit?: 'percentage',
      multiplier = 1
    ) => {
      if (typeof value === 'number') {
        points.push({
          metricKey,
          label,
          valueMode,
          ...(displayUnit ? { displayUnit } : {}),
          value: value * multiplier,
          day: dayjs.utc(element.timeRange.start).format('YYYY-MM-DD'),
        });
      }
    };
    for (const element of page.elements || []) {
      push(
        element,
        'page_views',
        'Page Views',
        element.totalPageStatistics?.views?.allPageViews?.pageViews
      );
    }
    for (const element of followers.elements || []) {
      push(
        element,
        'organic_followers',
        'Organic Followers',
        element.followerGains?.organicFollowerGain
      );
      push(
        element,
        'paid_followers',
        'Paid Followers',
        element.followerGains?.paidFollowerGain
      );
    }
    for (const element of shares.elements || []) {
      const statistics = element.totalShareStatistics;
      push(element, 'clicks', 'Clicks', statistics?.clickCount);
      push(element, 'shares', 'Shares', statistics?.shareCount);
      push(
        element,
        'engagement_rate',
        'Engagement Rate',
        statistics?.engagement,
        'average',
        'percentage',
        100
      );
      push(element, 'comments', 'Comments', statistics?.commentCount);
    }

    try {
      const networkResponse = await fetch(
        `https://api.linkedin.com/v2/networkSizes/urn:li:organization:${request.integration.internalId}?edgeType=CompanyFollowedByMember`,
        { headers }
      );
      const networkBody = await networkResponse.json();
      if (
        networkResponse.ok &&
        typeof networkBody?.firstDegreeSize === 'number'
      ) {
        points.push({
          metricKey: 'followers',
          label: 'Followers',
          valueMode: 'latest' as const,
          value: networkBody.firstDegreeSize,
          day: toDay.format('YYYY-MM-DD'),
        });
      }
    } catch {
      // Keep gain metrics when the total follower lookup fails.
    }

    return paginateDailyAnalyticsCapture(
      request,
      {
        fromDay: fromDay.format('YYYY-MM-DD'),
        toDay: toDay.format('YYYY-MM-DD'),
      },
      points
    );
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const endDate = dayjs().unix() * 1000;
    const startDate = dayjs().subtract(date, 'days').unix() * 1000;

    // Fetch share statistics for the specific post
    const shareStatsUrl = `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(
      `urn:li:organization:${integrationId}`
    )}&shares=List(${encodeURIComponent(
      postId
    )})&timeIntervals=(timeRange:(start:${startDate},end:${endDate}),timeGranularityType:DAY)`;

    const { elements: shareElements }: { elements: PostShareStatElement[] } =
      await (
        await fetch(shareStatsUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'LinkedIn-Version': '202601',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        })
      ).json();

    // Also fetch social actions (likes, comments, shares) for the specific post
    let socialActions: SocialActionsResponse | null = null;
    try {
      const socialActionsUrl = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(
        postId
      )}`;
      socialActions = await (
        await fetch(socialActionsUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'LinkedIn-Version': '202601',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        })
      ).json();
    } catch (e) {
      // Social actions may not be available for all posts
    }

    // Process share statistics into time series data
    const analytics = (shareElements || []).reduce(
      (all, current) => {
        if (typeof current?.totalShareStatistics !== 'undefined') {
          const dateStr = dayjs(current.timeRange.start).format('YYYY-MM-DD');

          all['Impressions'].push({
            total: current.totalShareStatistics.impressionCount || 0,
            date: dateStr,
          });

          all['Unique Impressions'].push({
            total: current.totalShareStatistics.uniqueImpressionsCount || 0,
            date: dateStr,
          });

          all['Clicks'].push({
            total: current.totalShareStatistics.clickCount || 0,
            date: dateStr,
          });

          all['Likes'].push({
            total: current.totalShareStatistics.likeCount || 0,
            date: dateStr,
          });

          all['Comments'].push({
            total: current.totalShareStatistics.commentCount || 0,
            date: dateStr,
          });

          all['Shares'].push({
            total: current.totalShareStatistics.shareCount || 0,
            date: dateStr,
          });

          all['Engagement'].push({
            total: current.totalShareStatistics.engagement || 0,
            date: dateStr,
          });
        }
        return all;
      },
      {
        Impressions: [] as { total: number; date: string }[],
        'Unique Impressions': [] as { total: number; date: string }[],
        Clicks: [] as { total: number; date: string }[],
        Likes: [] as { total: number; date: string }[],
        Comments: [] as { total: number; date: string }[],
        Shares: [] as { total: number; date: string }[],
        Engagement: [] as { total: number; date: string }[],
      }
    );

    // If no time series data but we have social actions, create a single data point
    if (
      Object.values(analytics).every((arr) => arr.length === 0) &&
      socialActions
    ) {
      const today = dayjs().format('YYYY-MM-DD');
      analytics['Likes'].push({
        total: socialActions.likesSummary?.totalLikes || 0,
        date: today,
      });
      analytics['Comments'].push({
        total: socialActions.commentsSummary?.totalFirstLevelComments || 0,
        date: today,
      });
    }

    // Filter out empty analytics
    const result = Object.entries(analytics)
      .filter(([_, data]) => data.length > 0)
      .map(([label, data]) => ({
        label,
        data,
        percentageChange: 0,
      }));

    return result as any;
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
      const {
        likesSummary: { totalLikes },
        commentsSummary,
      } = await (
        await this.fetch(
          `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(
            externalPostId
          )}`,
          {
            method: 'GET',
            headers: {
              'X-Restli-Protocol-Version': '2.0.0',
              'Content-Type': 'application/json',
              'LinkedIn-Version': '202601',
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )
      ).json();

      return {
        status: 'success',
        metrics: {
          likes: totalLikes,
          ...(typeof commentsSummary?.totalFirstLevelComments === 'number'
            ? { replies: commentsSummary.totalFirstLevelComments }
            : {}),
        },
      };
    } catch (err: any) {
      if (err?.status === 404) {
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
      await this.fetch(
        `https://api.linkedin.com/rest/posts/${externalPostId}`,
        {
          method: 'DELETE',
          headers: {
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json',
            'LinkedIn-Version': '202601',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      return { status: 'removed' };
    } catch (err: any) {
      if (err?.status === 404) {
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
      await timer(2000);
      await this.fetch(`https://api.linkedin.com/rest/posts`, {
        body: JSON.stringify({
          author: `urn:li:organization:${integration.internalId}`,
          commentary: '',
          visibility: 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
          reshareContext: {
            parent: externalPostId,
          },
        }),
        method: 'POST',
        headers: {
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
          'LinkedIn-Version': '202601',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return {
        status: 'reposted',
        remoteReleaseId: externalPostId,
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

  private async addPlugReplyViaRules(
    integration: Integration,
    accessToken: string,
    externalPostId: string,
    content: string
  ): Promise<PostRulesAddPlugReplyResult> {
    try {
      await timer(2000);
      await this.fetch(
        `https://api.linkedin.com/v2/socialActions/${decodeURIComponent(
          externalPostId
        )}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            actor: `urn:li:organization:${integration.internalId}`,
            object: externalPostId,
            message: {
              text: this.fixText(content),
            },
          }),
        }
      );
      return {
        status: 'added',
        remoteReleaseId: externalPostId,
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
    identifier: 'linkedin-page-autoRepostPost',
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
      integration.token,
      id
    );

    if (
      metricsResult.status === 'success' &&
      metricsResult.metrics.likes! >= +fields.likesAmount
    ) {
      const result = await this.repostViaRules(
        integration,
        integration.token,
        id
      );
      return result.status === 'reposted';
    }

    return false;
  }

  @Plug({
    identifier: 'linkedin-page-autoPlugPost',
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
    const metricsResult = await this.loadPostRulesMetrics(
      integration,
      integration.token,
      id
    );

    if (
      metricsResult.status === 'success' &&
      metricsResult.metrics.likes! >= +fields.likesAmount
    ) {
      const result = await this.addPlugReplyViaRules(
        integration,
        integration.token,
        id,
        fields.post
      );
      return result.status === 'added';
    }

    return false;
  }
}

export interface Root {
  pageStatisticsByIndustryV2: any[];
  pageStatisticsBySeniority: any[];
  organization: string;
  pageStatisticsByGeoCountry: any[];
  pageStatisticsByTargetedContent: any[];
  totalPageStatistics: TotalPageStatistics;
  pageStatisticsByStaffCountRange: any[];
  pageStatisticsByFunction: any[];
  pageStatisticsByGeo: any[];
  followerGains: { organicFollowerGain: number; paidFollowerGain: number };
  timeRange: TimeRange;
  totalShareStatistics: {
    uniqueImpressionsCount: number;
    shareCount: number;
    engagement: number;
    clickCount: number;
    likeCount: number;
    impressionCount: number;
    commentCount: number;
  };
}

export interface TotalPageStatistics {
  clicks: Clicks;
  views: Views;
}

export interface Clicks {
  mobileCustomButtonClickCounts: any[];
  desktopCustomButtonClickCounts: any[];
}

export interface Views {
  mobileProductsPageViews: MobileProductsPageViews;
  allDesktopPageViews: AllDesktopPageViews;
  insightsPageViews: InsightsPageViews;
  mobileAboutPageViews: MobileAboutPageViews;
  allMobilePageViews: AllMobilePageViews;
  productsPageViews: ProductsPageViews;
  desktopProductsPageViews: DesktopProductsPageViews;
  jobsPageViews: JobsPageViews;
  peoplePageViews: PeoplePageViews;
  overviewPageViews: OverviewPageViews;
  mobileOverviewPageViews: MobileOverviewPageViews;
  lifeAtPageViews: LifeAtPageViews;
  desktopOverviewPageViews: DesktopOverviewPageViews;
  mobileCareersPageViews: MobileCareersPageViews;
  allPageViews: AllPageViews;
  careersPageViews: CareersPageViews;
  mobileJobsPageViews: MobileJobsPageViews;
  mobileLifeAtPageViews: MobileLifeAtPageViews;
  desktopJobsPageViews: DesktopJobsPageViews;
  desktopPeoplePageViews: DesktopPeoplePageViews;
  aboutPageViews: AboutPageViews;
  desktopAboutPageViews: DesktopAboutPageViews;
  mobilePeoplePageViews: MobilePeoplePageViews;
  desktopCareersPageViews: DesktopCareersPageViews;
  desktopInsightsPageViews: DesktopInsightsPageViews;
  desktopLifeAtPageViews: DesktopLifeAtPageViews;
  mobileInsightsPageViews: MobileInsightsPageViews;
}

export interface MobileProductsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface AllDesktopPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface InsightsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileAboutPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface AllMobilePageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface ProductsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopProductsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface JobsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface PeoplePageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface OverviewPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileOverviewPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface LifeAtPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopOverviewPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileCareersPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface AllPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface CareersPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileJobsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileLifeAtPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopJobsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopPeoplePageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface AboutPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopAboutPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobilePeoplePageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopCareersPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopInsightsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopLifeAtPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileInsightsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

// Post analytics interfaces
export interface PostShareStatElement {
  organizationalEntity: string;
  share: string;
  totalShareStatistics: {
    uniqueImpressionsCount: number;
    shareCount: number;
    engagement: number;
    clickCount: number;
    likeCount: number;
    impressionCount: number;
    commentCount: number;
  };
  timeRange: TimeRange;
}

export interface SocialActionsResponse {
  likesSummary?: {
    totalLikes: number;
    likedByCurrentUser: boolean;
  };
  commentsSummary?: {
    totalFirstLevelComments: number;
    commentsState: string;
  };
}

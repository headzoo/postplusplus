import { Injectable } from '@nestjs/common';
import {
  Activity,
  ActivityMethod,
  TemporalService,
} from 'nestjs-temporal-core';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import {
  NotificationService,
  NotificationType,
} from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { Integration, Post, State } from '@prisma/client';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { AuthTokenDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { timer } from '@gitroom/helpers/utils/timer';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { LogsService } from '@gitroom/nestjs-libraries/database/prisma/logs/logs.service';
import { runWithPostHttpLogContext } from '@gitroom/nestjs-libraries/database/prisma/logs/http-log.context';
import { WebhookHttpLogSource } from '@prisma/client';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  integrationIdentity,
  webhookTargetIdentity,
} from '@gitroom/nestjs-libraries/database/prisma/logs/http-log.serialize';
import { TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
  postId as postIdSearchParam,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { PipelinePlugService } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.plug.service';
import {
  getPublishFileSinkDirectory,
  sinkOutboundPublish,
} from '@gitroom/nestjs-libraries/integrations/publish.file.sink';
import { PostRulesExecutionService } from '@gitroom/nestjs-libraries/database/prisma/rules/post-rules.execution.service';
import { AdminScheduleLogService } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.service';

// Drops fields the workflow and downstream activities never read — biggest wins are `error` (grows per retry) and `childrenPost` (Prisma side-loads it on every recursive row).
function slimPost(post: any) {
  if (!post) return post;
  const {
    error,
    childrenPost,
    tags,
    description,
    title,
    submittedForOrderId,
    submittedForOrganizationId,
    submittedForOrder,
    submittedForOrganization,
    lastMessageId,
    parentPostId,
    approvedSubmitForOrder,
    deletedAt,
    createdAt,
    updatedAt,
    payoutProblems,
    comments,
    errors,
    ...rest
  } = post;
  return rest;
}

@Injectable()
@Activity()
export class PostActivity {
  constructor(
    private _postService: PostsService,
    private _notificationService: NotificationService,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _webhookService: WebhooksService,
    private _logsService: LogsService,
    private _temporalService: TemporalService,
    private _subscriptionService: SubscriptionService,
    private _pipelinePlugService: PipelinePlugService,
    private _postRulesExecutionService: PostRulesExecutionService,
    private _adminScheduleLogService: AdminScheduleLogService
  ) {}

  @ActivityMethod()
  async getIntegrationById(orgId: string, id: string) {
    return this._integrationService.getIntegrationById(orgId, id);
  }

  @ActivityMethod()
  async searchForMissingThreeHoursPosts() {
    const list = await this._postService.searchForMissingThreeHoursPosts();
    for (const post of list) {
      await this._temporalService.client
        .getRawClient()
        .workflow.signalWithStart('postWorkflowV109', {
          workflowId: `post_${post.id}`,
          taskQueue: 'main',
          signal: 'poke',
          workflowIdConflictPolicy: 'USE_EXISTING',
          signalArgs: [],
          args: [
            {
              taskQueue: post.integration.providerIdentifier
                .split('-')[0]
                .toLowerCase(),
              postId: post.id,
              organizationId: post.organizationId,
            },
          ],
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: postIdSearchParam,
              value: post.id,
            },
            {
              key: organizationId,
              value: post.organizationId,
            },
          ]),
        });
    }
    await this._adminScheduleLogService.append({
      scheduleKey: 'missing-post-recovery',
      message:
        list.length > 0
          ? `Missing post recovery poked ${list.length} post(s)`
          : 'Missing post recovery found no posts to poke',
      meta: { poked: list.length },
    });
  }

  @ActivityMethod()
  async updatePost(id: string, postId: string, releaseURL: string) {
    await this._postService.updatePost(id, postId, releaseURL);
  }

  @ActivityMethod()
  async getPost(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return false;
      }
    }
    const post = await this._postService.getPostById(postId, orgId);
    if (post.deletedAt) {
      return false;
    }

    return post;
  }

  @ActivityMethod()
  async getPostsList(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return [];
      }
    }

    const getPosts = await this._postService.getPostsRecursively(
      postId,
      true,
      orgId
    );
    if (!getPosts || getPosts.length === 0 || getPosts[0].parentPostId) {
      return [];
    }

    return getPosts.map(slimPost);
  }

  @ActivityMethod()
  async isCommentable(integration: Integration) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    return !!getIntegration.comment;
  }

  @ActivityMethod()
  async postComment(
    postId: string,
    lastPostId: string | undefined,
    integration: Integration,
    posts: Post[]
  ) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    const mappedPosts = await Promise.all(
      (newPosts || []).map(async (p) => ({
        id: p.id,
        message: stripHtmlValidation(
          getIntegration.editor,
          p.content,
          true,
          false,
          !/<\/?[a-z][\s\S]*>/i.test(p.content),
          getIntegration.mentionFormat
        ),
        settings: JSON.parse(p.settings || '{}'),
        media: await this._postService.updateMedia(
          p.id,
          JSON.parse(p.image || '[]'),
          getIntegration?.convertToJPEG || false
        ),
      }))
    );

    if (getPublishFileSinkDirectory()) {
      const filename = await sinkOutboundPublish({
        action: 'comment',
        provider: integration.providerIdentifier,
        integrationId: integration.id,
        internalId: integration.internalId,
        name: integration.name,
        posts: mappedPosts,
        extra: { postId, lastPostId },
      });
      console.log(
        `Publish file sink: wrote ${filename} for ${integration.providerIdentifier} comment`
      );
      return mappedPosts.map((p) => ({
        id: p.id,
        postId: filename,
        releaseURL: filename,
        status: 'completed',
      }));
    }

    return this.withPostHttpLog(integration, posts[0]?.id || postId, () =>
      getIntegration.comment(
        integration.internalId,
        postId,
        lastPostId,
        integration.token,
        mappedPosts,
        integration
      )
    );
  }

  @ActivityMethod()
  async postSocial(integration: Integration, posts: Post[]) {
    return this.postSocialInternal(integration, posts, false);
  }

  // Used by postWorkflowV106 and up: providers that implement `postPending`
  // return a `pending` response the workflow resolves via checkPostStatus /
  // finalizePost. Older workflow versions keep calling `postSocial` and get
  // the old blocking behavior.
  @ActivityMethod()
  async postSocialPending(integration: Integration, posts: Post[]) {
    return this.postSocialInternal(integration, posts, true);
  }

  private async postSocialInternal(
    integration: Integration,
    posts: Post[],
    allowPending: boolean
  ) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        integration.organizationId
      );

      if (!subscription) {
        throw new Error('No active subscription found for this organization.');
      }
    }

    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    const mappedPosts = await Promise.all(
      (newPosts || []).map(async (p, index) => ({
        id: p.id,
        message: stripHtmlValidation(
          getIntegration.editor,
          p.content,
          true,
          false,
          !/<\/?[a-z][\s\S]*>/i.test(p.content),
          getIntegration.mentionFormat
        ),
        settings: JSON.parse(p.settings || '{}'),
        media: await this._postService.updateMedia(
          p.id,
          JSON.parse(p.image || '[]'),
          getIntegration?.convertToJPEG || false
        ),
        ...(index === 0 && p.reference
          ? { reference: p.reference as any }
          : {}),
      }))
    );

    let postNow;
    if (getPublishFileSinkDirectory()) {
      const filename = await sinkOutboundPublish({
        action: 'post',
        provider: integration.providerIdentifier,
        integrationId: integration.id,
        internalId: integration.internalId,
        name: integration.name,
        posts: mappedPosts,
      });
      console.log(
        `Publish file sink: wrote ${filename} for ${integration.providerIdentifier} post`
      );
      postNow = mappedPosts.map((p) => ({
        id: p.id,
        postId: filename,
        releaseURL: filename,
        status: 'completed',
      }));
    } else if (allowPending && getIntegration.postPending) {
      postNow = await this.withPostHttpLog(integration, posts[0]?.id, () =>
        getIntegration.postPending!(
          integration.internalId,
          integration.token,
          mappedPosts,
          integration
        )
      );
    } else {
      postNow = await this.withPostHttpLog(integration, posts[0]?.id, () =>
        getIntegration.post(
          integration.internalId,
          integration.token,
          mappedPosts,
          integration
        )
      );
    }

    // The post is already published at this point: the streak is best-effort,
    // failing the activity here would retry it and publish again.
    try {
      await this._temporalService.client
        .getRawClient()
        .workflow.start('streakWorkflow', {
          args: [{ organizationId: integration.organizationId }],
          workflowId: `streak_${integration.organizationId}`,
          taskQueue: 'main',
          workflowIdConflictPolicy: 'TERMINATE_EXISTING',
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: organizationId,
              value: integration.organizationId,
            },
          ]),
        });
    } catch (err) {
      /**empty**/
    }

    return postNow;
  }

  @ActivityMethod()
  async editPost(integration: Integration, posts: Post[]) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        integration.organizationId
      );

      if (!subscription) {
        throw new Error('No active subscription found for this organization.');
      }
    }

    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (!getIntegration.editPost) {
      throw new Error(
        `Editing published posts is not supported for ${integration.providerIdentifier}`
      );
    }

    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    const mappedPosts = await Promise.all(
      (newPosts || []).map(async (p) => ({
        id: p.id,
        message: stripHtmlValidation(
          getIntegration.editor,
          p.content,
          true,
          false,
          !/<\/?[a-z][\s\S]*>/i.test(p.content),
          getIntegration.mentionFormat
        ),
        settings: JSON.parse(p.settings || '{}'),
        media: await this._postService.updateMedia(
          p.id,
          JSON.parse(p.image || '[]'),
          getIntegration?.convertToJPEG || false
        ),
      }))
    );

    const releaseId = posts[0]?.releaseId;
    if (!releaseId || releaseId === 'missing') {
      throw new Error(
        'This post cannot be edited because it has no platform id'
      );
    }

    if (getPublishFileSinkDirectory()) {
      const filename = await sinkOutboundPublish({
        action: 'edit',
        provider: integration.providerIdentifier,
        integrationId: integration.id,
        internalId: integration.internalId,
        name: integration.name,
        posts: mappedPosts,
        extra: { releaseId },
      });
      console.log(
        `Publish file sink: wrote ${filename} for ${integration.providerIdentifier} edit`
      );
      return mappedPosts.map((p) => ({
        id: p.id,
        postId: filename,
        releaseURL: filename,
        status: 'completed',
      }));
    }

    return this.withPostHttpLog(integration, posts[0]?.id, () =>
      getIntegration.editPost!(
        integration.internalId,
        integration.token,
        mappedPosts,
        integration,
        releaseId
      )
    );
  }

  @ActivityMethod()
  async checkPostStatus(integration: Integration, pendingData: any) {
    if (getPublishFileSinkDirectory()) {
      const filename = await sinkOutboundPublish({
        action: 'checkPostStatus',
        provider: integration.providerIdentifier,
        integrationId: integration.id,
        internalId: integration.internalId,
        name: integration.name,
        extra: { pendingData },
      });
      console.log(
        `Publish file sink: wrote ${filename} for ${integration.providerIdentifier} checkPostStatus`
      );
      return {
        status: 'completed' as const,
        postId: filename,
        releaseURL: filename,
      };
    }

    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    return this.withPostHttpLog(integration, undefined, () =>
      getIntegration.checkPostStatus(
        integration.token,
        pendingData,
        integration
      )
    );
  }

  @ActivityMethod()
  async finalizePost(integration: Integration, pendingData: any) {
    if (getPublishFileSinkDirectory()) {
      const filename = await sinkOutboundPublish({
        action: 'finalizePost',
        provider: integration.providerIdentifier,
        integrationId: integration.id,
        internalId: integration.internalId,
        name: integration.name,
        extra: { pendingData },
      });
      console.log(
        `Publish file sink: wrote ${filename} for ${integration.providerIdentifier} finalizePost`
      );
      return {
        status: 'completed' as const,
        postId: filename,
        releaseURL: filename,
      };
    }

    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    return this.withPostHttpLog(integration, undefined, () =>
      getIntegration.finalizePost(integration.token, pendingData, integration)
    );
  }

  @ActivityMethod()
  async inAppNotification(
    orgId: string,
    subject: string,
    message: string,
    sendEmail = false,
    digest = false,
    type: NotificationType = 'success'
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      subject,
      message,
      sendEmail,
      digest,
      type
    );
  }

  @ActivityMethod()
  async globalPlugs(integration: Integration) {
    return this._postService.checkPlugs(
      integration.organizationId,
      integration.providerIdentifier,
      integration.id
    );
  }

  // Legacy V108 workflows still call these activity methods for in-flight Plug
  // executions. Public Plug APIs/UI were removed at Rules cutover; do not delete
  // until no V108 execution can invoke them.
  @ActivityMethod()
  async globalPlugsV107(postId: string, integration: Integration) {
    return this._pipelinePlugService.resolveGlobalPlugs(
      postId,
      integration.id,
      integration.providerIdentifier
    );
  }

  @ActivityMethod()
  async changeState(id: string, state: State, err?: any, body?: any) {
    await this._postService.changeState(id, state, err, body);
  }

  @ActivityMethod()
  async internalPlugs(integration: Integration, settings: any) {
    return this._postService.checkInternalPlug(
      integration,
      integration.organizationId,
      integration.id,
      settings
    );
  }

  @ActivityMethod()
  async sendWebhooks(postId: string, orgId: string, integrationId: string) {
    // Webhooks are best-effort and run after the post already published, so a
    // failure here must not fail the workflow.
    try {
      const webhooks = (await this._webhookService.getWebhooks(orgId)).filter(
        (f) => {
          return (
            f.integrations.length === 0 ||
            f.integrations.some((i) => i.integration.id === integrationId)
          );
        }
      );

      if (webhooks.length === 0) {
        return;
      }

      const post = await this._postService.getPostByForWebhookId(postId);
      const integration = await this._integrationService.getIntegrationById(
        orgId,
        integrationId
      );
      const source = integrationIdentity(
        integration?.name,
        integration?.profile
      );
      await Promise.all(
        webhooks.map(async (webhook) => {
          const headers = {
            'Content-Type': 'application/json',
          };
          const body = JSON.stringify(post);
          const target = webhookTargetIdentity(webhook.name, webhook.url);
          try {
            // webhook.url is validated at save time, but DNS can change
            // between then and now - pin resolution like every other
            // user-influenced outbound request.
            const response = await fetch(webhook.url, {
              method: 'POST',
              headers,
              body,
              // @ts-ignore — undici option, not in lib.dom fetch types
              dispatcher: getSsrfSafeDispatcher(),
            });
            await this._logsService.logOutboundWebhook({
              organizationId: orgId,
              webhookId: webhook.id,
              integrationId,
              source: WebhookHttpLogSource.ORG_WEBHOOK,
              method: 'POST',
              url: webhook.url,
              requestHeaders: headers,
              requestBody: body,
              response,
              sourceDisplayName: source.displayName,
              sourceUsername: source.username,
              targetDisplayName: target.displayName,
              targetUsername: target.username,
              eventType: 'post.create',
            });
          } catch (e) {
            await this._logsService.logOutboundWebhook({
              organizationId: orgId,
              webhookId: webhook.id,
              integrationId,
              source: WebhookHttpLogSource.ORG_WEBHOOK,
              method: 'POST',
              url: webhook.url,
              requestHeaders: headers,
              requestBody: body,
              error: e,
              sourceDisplayName: source.displayName,
              sourceUsername: source.username,
              targetDisplayName: target.displayName,
              targetUsername: target.username,
              eventType: 'post.create',
            });
          }
        })
      );
    } catch (err) {
      /**empty**/
    }
  }
  @ActivityMethod()
  async processPlug(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    return this._integrationService.processPlugs(data);
  }

  @ActivityMethod()
  async processPlugV107(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
    source: 'channel' | 'pipeline';
  }) {
    return this._integrationService.processPlugs(data);
  }

  @ActivityMethod()
  async resolvePostRulesV109(
    organizationId: string,
    postId: string,
    integrationId: string
  ) {
    const response = await this._postRulesExecutionService.resolveForPost({
      organizationId,
      postId,
      integrationId,
    });
    return response.items.map((item) => ({
      type: 'rule' as const,
      runId: item.runId,
      ruleId: item.ruleId,
      postId: item.postId,
      evaluationIndex: item.evaluationIndex,
      delay: item.delayMs,
    }));
  }

  @ActivityMethod()
  async processPostRuleV109(request: {
    organizationId: string;
    runId: string;
    ruleId: string;
    postId: string;
    evaluationIndex: number;
  }) {
    return this._postRulesExecutionService.processEvaluation(request);
  }

  @ActivityMethod()
  async processInternalPlug(data: {
    post: string;
    originalIntegration: string;
    integration: string;
    plugName: string;
    orgId: string;
    delay: number;
    information: any;
  }) {
    await this._integrationService.processInternalPlug(data);
  }

  @ActivityMethod()
  async refreshToken(
    integration: Integration
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration);
      return false;
    }
  }

  @ActivityMethod()
  async refreshTokenWithCause(
    integration: Integration,
    cause: string
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration,
        cause
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration, cause);
      return false;
    }
  }

  private withPostHttpLog<T>(
    integration: Integration,
    postId: string | undefined,
    run: () => Promise<T>
  ) {
    return runWithPostHttpLogContext(
      {
        organizationId: integration.organizationId,
        postId,
        integrationId: integration.id,
        provider: integration.providerIdentifier,
      },
      run
    );
  }
}

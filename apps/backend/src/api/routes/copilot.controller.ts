import {
  Logger,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Param,
} from '@nestjs/common';
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNodeHttpEndpoint,
} from '@copilotkit/runtime';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization, User } from '@prisma/client';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { MastraAgent } from '@ag-ui/mastra';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { Request, Response } from 'express';
import { RequestContext } from '@mastra/core/di';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import type { SelectedPipelineContext } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import type { HelpPageContext } from '@gitroom/nestjs-libraries/help/help.types';
import {
  formatFollowerPageContext,
  FollowerPageContext,
} from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';

export type UiIntegrationContext = {
  id: string;
  name: string;
  picture?: string | null;
  providerIdentifier: string;
  type: string;
  identifier?: string;
  editor?: 'none' | 'normal' | 'markdown' | 'html';
  display?: string;
};

export type ChannelsContext = {
  integrations: UiIntegrationContext[];
  pipeline: SelectedPipelineContext | null;
  followerPage: FollowerPageContext | null;
  helpPage: HelpPageContext | null;
  organization: string;
  user?: string;
  ui: 'true';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isUiIntegrationContext = (
  value: unknown
): value is UiIntegrationContext =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.providerIdentifier === 'string' &&
  typeof value.type === 'string';

const isSelectedPipelineContext = (
  value: unknown
): value is SelectedPipelineContext =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.timezone === 'string' &&
  typeof value.active === 'boolean' &&
  Array.isArray(value.channels) &&
  Array.isArray(value.contextDocuments);

const isFollowerPageContext = (value: unknown): value is FollowerPageContext =>
  isRecord(value) &&
  (value.kind === 'list' ||
    value.kind === 'detail' ||
    value.kind === 'timeline') &&
  typeof value.route === 'string' &&
  isRecord(value.channel) &&
  typeof value.channel.id === 'string' &&
  isRecord(value.pagination) &&
  typeof value.pagination.size === 'number' &&
  typeof value.pagination.number === 'number';

const isHelpPageContext = (value: unknown): value is HelpPageContext =>
  isRecord(value) &&
  value.open === true &&
  (value.view === 'catalog' || value.view === 'article') &&
  (value.slug === undefined || typeof value.slug === 'string') &&
  (value.hash === undefined || typeof value.hash === 'string') &&
  (value.title === undefined || typeof value.title === 'string') &&
  (value.searchQuery === undefined || typeof value.searchQuery === 'string');

@Controller('/copilot')
export class CopilotController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _mastraService: MastraService
  ) {}

  private getUiProperties(req: Request) {
    const properties = req.body?.variables?.properties;

    if (!isRecord(properties)) {
      return {
        integrations: [] as UiIntegrationContext[],
        pipeline: null,
        followerPage: null,
        helpPage: null,
      };
    }

    return {
      integrations: Array.isArray(properties.integrations)
        ? properties.integrations.filter(isUiIntegrationContext)
        : [],
      pipeline: isSelectedPipelineContext(properties.pipeline)
        ? properties.pipeline
        : null,
      followerPage: isFollowerPageContext(properties.followerPage)
        ? formatFollowerPageContext(properties.followerPage)
        : null,
      helpPage: isHelpPageContext(properties.helpPage)
        ? properties.helpPage
        : null,
    };
  }

  private createRequestContext(
    req: Request,
    organization: Organization,
    user?: User
  ) {
    const properties = this.getUiProperties(req);
    const requestContext = new RequestContext<ChannelsContext>();

    requestContext.set('integrations', properties.integrations);
    requestContext.set('pipeline', properties.pipeline);
    requestContext.set('followerPage', properties.followerPage);
    requestContext.set('helpPage', properties.helpPage);
    requestContext.set('organization', JSON.stringify(organization));
    if (user) {
      requestContext.set('user', JSON.stringify({ userId: user.id }));
    }
    requestContext.set('ui', 'true');

    return requestContext;
  }

  private async createRuntime(
    req: Request,
    organization: Organization,
    user?: User
  ) {
    const mastra = await this._mastraService.mastra();
    const requestContext = this.createRequestContext(req, organization, user);
    const agents = MastraAgent.getLocalAgents({
      resourceId: organization.id,
      mastra,
      requestContext: requestContext as any,
    });

    return new CopilotRuntime({ agents });
  }

  private hasOpenAiKey() {
    return (
      process.env.OPENAI_API_KEY !== undefined &&
      process.env.OPENAI_API_KEY !== ''
    );
  }

  @Post('/chat')
  async chatAgent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user?: User
  ) {
    if (!this.hasOpenAiKey()) {
      Logger.warn('OpenAI API key not set, chat functionality will not work');
      return;
    }

    const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
      endpoint: '/copilot/chat',
      runtime: await this.createRuntime(req, organization, user),
      serviceAdapter: new OpenAIAdapter({
        model: 'gpt-4.1',
      }),
    });

    return copilotRuntimeHandler(req, res);
  }

  @Post('/agent')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async agent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User
  ) {
    if (!this.hasOpenAiKey()) {
      Logger.warn('OpenAI API key not set, chat functionality will not work');
      return;
    }

    const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
      endpoint: '/copilot/agent',
      runtime: await this.createRuntime(req, organization, user),
      serviceAdapter: new OpenAIAdapter({
        model: 'gpt-4.1',
      }),
    });

    return copilotRuntimeHandler(req, res);
  }

  @Get('/credits')
  calculateCredits(
    @GetOrgFromRequest() organization: Organization,
    @Query('type') type: 'ai_images' | 'ai_videos'
  ) {
    return this._subscriptionService.checkCredits(
      organization,
      type || 'ai_images'
    );
  }

  @Get('/:thread/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getMessagesList(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string
  ): Promise<any> {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postiz').getMemory();
    try {
      return await memory.recall({
        resourceId: organization.id,
        threadId,
      });
    } catch (err) {
      Logger.warn(`Could not recall messages for thread ${threadId}: ${err}`);
      return { messages: [] };
    }
  }

  @Get('/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getList(@GetOrgFromRequest() organization: Organization) {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postiz').getMemory();
    const list = await memory.listThreads({
      filter: { resourceId: organization.id },
      perPage: 100000,
      page: 0,
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });

    return {
      threads: list.threads.map((p) => ({
        id: p.id,
        title: p.title,
      })),
    };
  }
}

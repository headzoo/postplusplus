import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import {
  followerCategoriesDescription,
  followerQueryWithChannelSchema,
  followerToolAnnotations,
  getFollowerToolContext,
  safeHttpUrl,
} from '@gitroom/nestjs-libraries/chat/tools/follower.tool.common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

@Injectable()
export class FollowersListTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'listFollowers';

  run() {
    return createTool({
      id: this.name,
      description: `List a bounded page of followers for one follower-capable channel. Sort keys must be advertised by listFollowerChannels; page-scoped sorts only order the fetched page, while database sorts use stored audience data. Custom-list pages (listId) can include people who now follow the channel; followedAt means they currently follow. Categories: ${followerCategoriesDescription}`,
      inputSchema: followerQueryWithChannelSchema,
      mcp: { annotations: { ...followerToolAnnotations, title: 'List followers' } },
      outputSchema: z.object({
        output: z.object({
          followers: z.array(z.object({
            id: z.string(),
            name: z.string(),
            username: z.string().optional(),
            picture: z.string().url().optional(),
            profileUrl: z.string().url().optional(),
            followedAt: z.string().optional(),
            relationshipGrade: z.number().nullable().optional(),
            myGrade: z.number().nullable().optional(),
            relationshipTriage: z.string().nullable().optional(),
          }).passthrough()),
          total: z.number().nullable(),
          nextCursor: z.string().optional(),
          previousCursor: z.string().optional(),
          hasMore: z.boolean(),
          window: z.string().optional(),
          tracking: z.any().optional(),
        }),
      }),
      execute: async (inputData, context) => {
        const { organization, actor } = getFollowerToolContext(inputData, context);
        const { channelId, ...query } = inputData;
        const page = await this._integrationService.getFollowers(
          organization,
          actor,
          channelId,
          query
        );
        return {
          output: {
            followers: page.items.map((follower) => ({
              ...follower,
              ...(safeHttpUrl(follower.picture) ? { picture: safeHttpUrl(follower.picture) } : {}),
              ...(safeHttpUrl(follower.profileUrl)
                ? { profileUrl: safeHttpUrl(follower.profileUrl) }
                : {}),
            })),
            total: page.total ?? null,
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
            ...(page.previousCursor ? { previousCursor: page.previousCursor } : {}),
            hasMore: page.hasMore,
            ...(page.window ? { window: page.window } : {}),
            ...(page.tracking ? { tracking: page.tracking } : {}),
          },
        };
      },
    });
  }
}

import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import {
  followerToolAnnotations,
  getFollowerToolContext,
  safeHttpUrl,
} from '@gitroom/nestjs-libraries/chat/tools/follower.tool.common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

@Injectable()
export class FollowersRecentTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) { }
  name = 'listRecentFollowers';

  run() {
    return createTool({
      id: this.name,
      description:
        'List stored recent followers for one follower-capable channel, ordered by followedAt descending. Uses database audience data only (not the live provider API). Optional withoutOutboundSinceFollow filters to people with no outbound channel interaction since they followed — use that for “who followed recently that I have not replied to?”. Only members with a stored followedAt in the window appear; follows before tracking or the first sync may be missing. “Replied” means outbound interaction on the channel, not a follow-back.',
      inputSchema: z.object({
        channelId: z.string().min(1).max(64),
        sinceDays: z.number().int().min(1).max(90).optional().default(30),
        limit: z.number().int().min(1).max(100).optional().default(20),
        cursor: z.string().min(1).max(2048).optional(),
        withoutOutboundSinceFollow: z.boolean().optional().default(false),
      }),
      mcp: {
        annotations: {
          ...followerToolAnnotations,
          title: 'List recent followers',
        },
      },
      outputSchema: z.object({
        output: z.object({
          followers: z.array(
            z
              .object({
                id: z.string(),
                name: z.string(),
                username: z.string().optional(),
                picture: z.string().url().optional(),
                profileUrl: z.string().url().optional(),
                followedAt: z.string().optional(),
                lastInboundAt: z.string().optional(),
                lastOutboundAt: z.string().optional(),
                engagedNotYet: z.boolean().optional(),
                interactionCount: z.number().optional(),
              })
              .passthrough()
          ),
          nextCursor: z.string().optional(),
          hasMore: z.boolean(),
          tracking: z.any().optional(),
        }),
      }),
      execute: async (inputData, context) => {
        const { organization, actor } = getFollowerToolContext(
          inputData,
          context
        );
        const page = await this._integrationService.getRecentFollowers(
          organization,
          actor,
          inputData.channelId,
          {
            sinceDays: inputData.sinceDays,
            limit: inputData.limit,
            ...(inputData.cursor ? { cursor: inputData.cursor } : {}),
            withoutOutboundSinceFollow:
              inputData.withoutOutboundSinceFollow === true,
          }
        );
        return {
          output: {
            followers: page.items.map((follower) => ({
              ...follower,
              ...(safeHttpUrl(follower.picture)
                ? { picture: safeHttpUrl(follower.picture) }
                : {}),
              ...(safeHttpUrl(follower.profileUrl)
                ? { profileUrl: safeHttpUrl(follower.profileUrl) }
                : {}),
            })),
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
            hasMore: page.hasMore,
            ...(page.tracking ? { tracking: page.tracking } : {}),
          },
        };
      },
    });
  }
}

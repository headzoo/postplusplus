import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import {
  followerSelectorWithChannelSchema,
  followerToolAnnotations,
  getFollowerToolContext,
  safeHttpUrl,
} from '@gitroom/nestjs-libraries/chat/tools/follower.tool.common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

@Injectable()
export class FollowerDetailTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'getFollowerDetail';

  run() {
    return createTool({
      id: this.name,
      description:
        'Get one follower profile by external id or normalized username, including bounded notes, recent interactions, relationship-grade snapshots, and an optional UI user’s personal grade. MCP calls are actorless, so myGrade is null.',
      inputSchema: followerSelectorWithChannelSchema,
      mcp: {
        annotations: {
          ...followerToolAnnotations,
          title: 'Get follower detail',
        },
      },
      outputSchema: z.object({
        output: z.object({
          follower: z
            .object({
              id: z.string(),
              name: z.string(),
              picture: z.string().url().optional(),
              profileUrl: z.string().url().optional(),
            })
            .passthrough(),
          notes: z.array(
            z.object({
              id: z.string(),
              content: z.string(),
              author: z.object({ id: z.string(), name: z.string() }),
              createdAt: z.string(),
              updatedAt: z.string(),
            })
          ),
          interactions: z.array(
            z.object({
              id: z.string(),
              kind: z.string(),
              direction: z.string(),
              timestamp: z.string(),
              relatedObjectId: z.string().optional(),
            })
          ),
          relationship: z.any(),
          myGrade: z.number().nullable(),
          tracking: z.any().optional(),
        }),
      }),
      execute: async (inputData, context) => {
        const { organization, actor } = getFollowerToolContext(
          inputData,
          context
        );
        const details = await this._integrationService.getFollowerMemberDetails(
          organization,
          actor,
          inputData.channelId,
          inputData.externalId,
          inputData.username
        );
        return {
          output: {
            ...details,
            follower: {
              ...details.follower,
              ...(safeHttpUrl(details.follower.picture)
                ? { picture: safeHttpUrl(details.follower.picture) }
                : {}),
              ...(safeHttpUrl(details.follower.profileUrl)
                ? { profileUrl: safeHttpUrl(details.follower.profileUrl) }
                : {}),
            },
          },
        };
      },
    });
  }
}

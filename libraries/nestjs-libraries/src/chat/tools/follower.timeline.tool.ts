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
export class FollowerTimelineTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'getFollowerTimeline';

  run() {
    return createTool({
      id: this.name,
      description:
        'Get a bounded page from a follower’s public content timeline, where the selected channel supports it. Supply exactly one follower external id or normalized username.',
      inputSchema: followerSelectorWithChannelSchema.and(
        z.object({
          limit: z.number().int().min(1).max(100).optional().default(20),
          cursor: z.string().min(1).max(2048).optional(),
        })
      ),
      mcp: {
        annotations: {
          ...followerToolAnnotations,
          title: 'Get follower timeline',
        },
      },
      outputSchema: z.object({
        output: z.object({
          items: z.array(
            z.object({
              externalId: z.string(),
              url: z.string().url(),
              content: z.string(),
              publishedAt: z.string(),
              media: z
                .array(
                  z.object({
                    url: z.string().url(),
                    type: z.enum(['image', 'video']).optional(),
                  })
                )
                .optional(),
            })
          ),
          hasMore: z.boolean(),
          nextCursor: z.string().optional(),
        }),
      }),
      execute: async (inputData, context) => {
        const { organization } = getFollowerToolContext(inputData, context);
        const page = await this._integrationService.getFollowerMemberTimeline(
          organization,
          inputData.channelId,
          inputData.externalId,
          inputData.username,
          inputData.limit,
          inputData.cursor
        );
        return {
          output: {
            items: page.items
              .map((item) => {
                const url = safeHttpUrl(item.url);
                if (!url) {
                  return undefined;
                }
                return {
                  ...item,
                  url,
                  ...(item.media
                    ? {
                        media: item.media
                          .map((media) => ({
                            ...media,
                            url: safeHttpUrl(media.url),
                          }))
                          .filter(
                            (media): media is typeof media & { url: string } =>
                              !!media.url
                          ),
                      }
                    : {}),
                };
              })
              .filter((item): item is NonNullable<typeof item> => !!item),
            hasMore: page.hasMore,
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
          },
        };
      },
    });
  }
}

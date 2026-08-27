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
export class FollowerChannelsTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'listFollowerChannels';

  run() {
    return createTool({
      id: this.name,
      description:
        'Discover social channels in this organization that support read-only follower and audience queries. Use the returned channel id with follower tools. Tracking indicates how fresh interaction-based scores and categories are.',
      inputSchema: z.object({}),
      mcp: {
        annotations: {
          ...followerToolAnnotations,
          title: 'List follower channels',
        },
      },
      outputSchema: z.object({
        output: z.array(
          z.object({
            id: z.string(),
            name: z.string().nullable().optional(),
            platform: z.string(),
            display: z.string().optional(),
            picture: z.string().url().optional(),
            sorts: z.array(
              z.object({
                key: z.string(),
                label: z.string(),
                directions: z.array(z.string()),
                defaultDirection: z.string(),
                scope: z.string().optional(),
                requiresWindow: z.boolean().optional(),
              })
            ),
            tracking: z.any().optional(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        const { organization } = getFollowerToolContext(inputData, context);
        const channels = await this._integrationService.getFollowerChannels(
          organization
        );
        return {
          output: channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            platform: channel.identifier,
            ...(channel.display ? { display: channel.display } : {}),
            ...(safeHttpUrl(channel.picture)
              ? { picture: safeHttpUrl(channel.picture) }
              : {}),
            sorts: channel.sorts,
            ...(channel.tracking ? { tracking: channel.tracking } : {}),
          })),
        };
      },
    });
  }
}

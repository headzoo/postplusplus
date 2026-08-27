import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import {
  followerToolAnnotations,
  getFollowerToolContext,
} from '@gitroom/nestjs-libraries/chat/tools/follower.tool.common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

@Injectable()
export class FollowerListsTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'listFollowerLists';

  run() {
    return createTool({
      id: this.name,
      description:
        'List named, organization-managed follower lists for one channel. Use a returned list id with listFollowers; listId cannot be combined with audience or triage filters.',
      inputSchema: z.object({
        channelId: z.string().min(1).max(64),
      }),
      mcp: {
        annotations: {
          ...followerToolAnnotations,
          title: 'List follower lists',
        },
      },
      outputSchema: z.object({
        output: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            createdAt: z.string(),
            updatedAt: z.string(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        const { organization } = getFollowerToolContext(inputData, context);
        return {
          output: await this._integrationService.listFollowerLists(
            organization,
            inputData.channelId
          ),
        };
      },
    });
  }
}

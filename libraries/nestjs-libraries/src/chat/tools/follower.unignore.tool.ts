import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import {
  followerWriteToolAnnotations,
  getFollowerToolContext,
  requireFollowerWriteActor,
} from '@gitroom/nestjs-libraries/chat/tools/follower.tool.common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

@Injectable()
export class FollowerUnignoreTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'unignoreFollower';

  run() {
    return createTool({
      id: this.name,
      description:
        'Clear the ignored state for one audience member so they can appear in default follower views again. Resolve them via listFollowers with audience=ignored or getFollowerDetail first.',
      inputSchema: z.object({
        channelId: z.string().min(1).max(64),
        externalId: z.string().min(1).max(512),
      }),
      mcp: {
        annotations: {
          ...followerWriteToolAnnotations,
          title: 'Unignore follower',
          idempotentHint: true,
        },
      },
      outputSchema: z.object({
        output: z.object({
          ok: z.literal(true),
          channelId: z.string(),
          externalId: z.string(),
        }),
      }),
      execute: async (inputData, context) => {
        const { organization, actor } = getFollowerToolContext(
          inputData,
          context
        );
        requireFollowerWriteActor(actor);
        await this._integrationService.unignoreFollowerMember(
          organization,
          inputData.channelId,
          inputData.externalId
        );
        return {
          output: {
            ok: true as const,
            channelId: inputData.channelId,
            externalId: inputData.externalId,
          },
        };
      },
    });
  }
}

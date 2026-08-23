import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import {
  followerWriteToolAnnotations,
  getFollowerToolContext,
  requireFollowerWriteActor,
} from '@gitroom/nestjs-libraries/chat/tools/follower.tool.common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import z from 'zod';

@Injectable()
export class FollowerIgnoreTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'ignoreFollower';

  run() {
    return createTool({
      id: this.name,
      description:
        'Mark one audience member as ignored so they hide from default follower views. Confirm the person with the user before calling. Resolve them via listFollowers or getFollowerDetail first.',
      inputSchema: z.object({
        channelId: z.string().min(1).max(64),
        externalId: z.string().min(1).max(512),
      }),
      mcp: {
        annotations: {
          ...followerWriteToolAnnotations,
          title: 'Ignore follower',
          destructiveHint: true,
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
        const writeActor = requireFollowerWriteActor(actor);
        await this._integrationService.ignoreFollowerMember(
          organization,
          { id: writeActor.userId } as User,
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

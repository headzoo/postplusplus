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
export class FollowerListAddMemberTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'addFollowerListMember';

  run() {
    return createTool({
      id: this.name,
      description:
        'Add one audience member to a named follower list by external id. Resolve listId via listFollowerLists and the person via listFollowers or getFollowerDetail first.',
      inputSchema: z.object({
        channelId: z.string().min(1).max(64),
        listId: z.string().min(1).max(64),
        externalId: z.string().min(1).max(512),
      }),
      mcp: {
        annotations: {
          ...followerWriteToolAnnotations,
          title: 'Add follower list member',
          idempotentHint: true,
        },
      },
      outputSchema: z.object({
        output: z.object({
          ok: z.literal(true),
          channelId: z.string(),
          listId: z.string(),
          externalId: z.string(),
        }),
      }),
      execute: async (inputData, context) => {
        const { organization, actor } = getFollowerToolContext(
          inputData,
          context
        );
        const writeActor = requireFollowerWriteActor(actor);
        await this._integrationService.addFollowerListMember(
          organization,
          { id: writeActor.userId } as User,
          inputData.channelId,
          inputData.listId,
          inputData.externalId
        );
        return {
          output: {
            ok: true as const,
            channelId: inputData.channelId,
            listId: inputData.listId,
            externalId: inputData.externalId,
          },
        };
      },
    });
  }
}

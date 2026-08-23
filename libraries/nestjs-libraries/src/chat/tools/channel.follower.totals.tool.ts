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
export class ChannelFollowerTotalsTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) { }
  name = 'summarizeChannelFollowerTotals';

  run() {
    return createTool({
      id: this.name,
      description:
        'Return platform follower/subscriber totals from analytics snapshots for one or many channels (including channels without Followers CRM). Prefer this for “how many followers do I have?”. Omitting channelIds returns all active social channels in the org (max 50 when filtered). Totals are null when unsupported, not yet captured, or unavailable—do not invent totals or sum CRM categories.',
      inputSchema: z.object({
        channelIds: z
          .array(z.string().min(1).max(64))
          .min(1)
          .max(50)
          .optional(),
      }),
      mcp: {
        annotations: {
          ...followerToolAnnotations,
          title: 'Summarize channel follower totals',
        },
      },
      outputSchema: z.object({
        output: z.array(
          z.object({
            channelId: z.string(),
            name: z.string(),
            platform: z.string(),
            total: z.number().nullable(),
            asOf: z.string().nullable(),
            label: z.string().nullable(),
            reason: z
              .enum(['unsupported', 'not_captured', 'unavailable'])
              .nullable(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        const { organization } = getFollowerToolContext(inputData, context);
        const channels = await this._integrationService.getChannelAudienceTotals(
          organization,
          inputData.channelIds
        );
        return { output: channels };
      },
    });
  }
}

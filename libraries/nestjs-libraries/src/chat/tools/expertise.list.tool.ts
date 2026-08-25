import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { listExpertise } from '@gitroom/nestjs-libraries/channel-strategies/expertise.registry';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

const expertiseMetadataSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  strategyTags: z.array(z.string()),
  fileSize: z.number(),
});

@Injectable()
export class ExpertiseListTool implements AgentToolInterface {
  name = 'listExpertise';

  run() {
    return createTool({
      id: 'listExpertise',
      description: `
This tool lists Post++ engagement expertise playbooks as metadata only (id, slug, name, description, tags, strategyTags, fileSize).
Use it to discover built-in craft guidance before calling readExpertise.
It never returns Markdown content.
`,
      inputSchema: z.object({}),
      mcp: {
        annotations: {
          title: 'List Engagement Expertise',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        output: z.array(expertiseMetadataSchema),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);

        return {
          output: listExpertise(),
        };
      },
    });
  }
}

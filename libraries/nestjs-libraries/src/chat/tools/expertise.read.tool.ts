import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import {
  listExpertise,
  readExpertise,
} from '@gitroom/nestjs-libraries/channel-strategies/expertise.registry';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

const readExpertiseInputSchema = z.object({
  slug: z
    .string()
    .describe(
      'The canonical expertise slug from listExpertise (for example reciprocal-mutual-deepening)'
    ),
});

@Injectable()
export class ExpertiseReadTool implements AgentToolInterface {
  name = 'readExpertise';

  run() {
    return createTool({
      id: 'readExpertise',
      description: `
This tool reads the Markdown content of one built-in Post++ engagement expertise playbook.
Use listExpertise first to see playbook metadata (slug, name, description, tags, strategyTags).
Pass the canonical slug from listExpertise.
Read only playbooks relevant to the user's request — do not read every playbook.
`,
      inputSchema: readExpertiseInputSchema,
      mcp: {
        annotations: {
          title: 'Read Engagement Expertise',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        output: z.object({
          id: z.string(),
          slug: z.string(),
          name: z.string(),
          description: z.string(),
          tags: z.array(z.string()),
          strategyTags: z.array(z.string()),
          fileSize: z.number(),
          content: z.string(),
        }),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);

        const content = readExpertise(inputData.slug);
        const metadata = listExpertise().find(
          (entry) => entry.slug === inputData.slug
        )!;

        return {
          output: {
            ...metadata,
            content,
          },
        };
      },
    });
  }
}

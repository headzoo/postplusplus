import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { searchHelpTopics } from '@gitroom/nestjs-libraries/help/help.registry';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

const helpTopicMetadataSchema = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  headings: z.array(
    z.object({
      level: z.number(),
      title: z.string(),
      anchor: z.string(),
    })
  ),
});

const searchHelpInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Natural-language search query for product help topics'),
});

@Injectable()
export class HelpSearchTool implements AgentToolInterface {
  name = 'searchHelp';

  run() {
    return createTool({
      id: 'searchHelp',
      description: `
This tool searches Post++ product help topics by title, headings, and excerpts.
Prefer this tool first when answering how-to questions while Help mode is active.
It returns metadata only — call readHelpArticle with a matching slug for the full Markdown body.
`,
      inputSchema: searchHelpInputSchema,
      mcp: {
        annotations: {
          title: 'Search Help Topics',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        output: z.array(helpTopicMetadataSchema),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        return { output: searchHelpTopics(inputData.query) };
      },
    });
  }
}

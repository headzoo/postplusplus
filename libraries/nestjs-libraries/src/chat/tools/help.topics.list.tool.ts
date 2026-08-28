import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { listHelpTopics } from '@gitroom/nestjs-libraries/help/help.registry';
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

@Injectable()
export class HelpTopicsListTool implements AgentToolInterface {
  name = 'listHelpTopics';

  run() {
    return createTool({
      id: 'listHelpTopics',
      description: `
This tool lists Post++ product help topics as metadata only (slug, title, excerpt, headings).
Use it to browse available how-to docs when the user asks broadly about the product.
It never returns Markdown content — use searchHelp or readHelpArticle for that.
`,
      inputSchema: z.object({}),
      mcp: {
        annotations: {
          title: 'List Help Topics',
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
        return { output: listHelpTopics() };
      },
    });
  }
}

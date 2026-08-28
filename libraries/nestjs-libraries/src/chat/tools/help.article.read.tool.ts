import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { readHelpArticle } from '@gitroom/nestjs-libraries/help/help.registry';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

const readHelpArticleInputSchema = z.object({
  slug: z
    .string()
    .describe(
      'The canonical help topic slug from listHelpTopics or searchHelp'
    ),
  hash: z
    .string()
    .optional()
    .describe(
      'Optional heading anchor from the topic headings list (for example scheduling)'
    ),
});

@Injectable()
export class HelpArticleReadTool implements AgentToolInterface {
  name = 'readHelpArticle';

  run() {
    return createTool({
      id: 'readHelpArticle',
      description: `
This tool reads the Markdown content of one Post++ product help topic.
Use searchHelp or listHelpTopics first to discover the slug.
Optionally pass a heading hash/anchor; hashValid indicates whether that section exists.
Read only topics relevant to the user's question — do not read every topic.
`,
      inputSchema: readHelpArticleInputSchema,
      mcp: {
        annotations: {
          title: 'Read Help Article',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        output: z.object({
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
          markdown: z.string(),
          hash: z.string().optional(),
          hashValid: z.boolean(),
          href: z.string(),
        }),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const article = readHelpArticle(inputData.slug, inputData.hash);
        const href = inputData.hash
          ? `/help/${article.slug}#${inputData.hash}`
          : `/help/${article.slug}`;

        return {
          output: {
            slug: article.slug,
            title: article.title,
            excerpt: article.excerpt,
            headings: article.headings,
            markdown: article.markdown,
            hash: article.hash,
            hashValid: article.hashValid,
            href,
          },
        };
      },
    });
  }
}

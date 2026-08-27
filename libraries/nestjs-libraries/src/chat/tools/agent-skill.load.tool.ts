import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { ContextDocumentService } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.service';
import { SKILL_SLUG_PATTERN } from '@gitroom/nestjs-libraries/upload/context-document.upload.validation';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

const loadSkillInputSchema = z.object({
  slug: z
    .string()
    .regex(
      SKILL_SLUG_PATTERN,
      'Provide the canonical skill slug using [a-z0-9-]+ without a slash or filename.'
    )
    .describe(
      'Canonical skill slug such as campaign-review, not /campaign-review'
    ),
});

@Injectable()
export class AgentSkillLoadTool implements AgentToolInterface {
  constructor(private _contextDocumentService: ContextDocumentService) {}
  name = 'loadSkill';

  run() {
    return createTool({
      id: 'loadSkill',
      description: `
This tool loads one organization agent skill by canonical slug and returns its Markdown procedure.
Use listSkills to discover available slugs. Pass only the slug (for example campaign-review), never a filename or /command.
Load only the skills you need; do not load every skill body.
`,
      inputSchema: loadSkillInputSchema,
      mcp: {
        annotations: {
          title: 'Load Organization Agent Skill',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        output: z.object({
          slug: z.string(),
          command: z.string(),
          id: z.string(),
          name: z.string(),
          content: z.string(),
          fileSize: z.number(),
          updatedAt: z.string(),
          isLarge: z.boolean(),
          warning: z.string().optional(),
        }),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        const skill = await this._contextDocumentService.getSkillBySlug(
          organizationId,
          inputData.slug
        );

        return {
          output: {
            slug: skill.slug,
            command: skill.command,
            id: skill.id,
            name: skill.name,
            content: skill.content,
            fileSize: skill.fileSize,
            updatedAt: new Date(skill.updatedAt).toISOString(),
            isLarge: skill.isLarge,
            ...(skill.warning ? { warning: skill.warning } : {}),
          },
        };
      },
    });
  }
}

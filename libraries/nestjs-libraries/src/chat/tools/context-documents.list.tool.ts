import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { ContextDocumentService } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.service';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

const contextDocumentMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  fileSize: z.number(),
  updatedAt: z.string(),
  isLarge: z.boolean(),
  warning: z.string().optional(),
});

@Injectable()
export class ContextDocumentsListTool implements AgentToolInterface {
  constructor(private _contextDocumentService: ContextDocumentService) {}
  name = 'listContextDocuments';

  run() {
    return createTool({
      id: 'listContextDocuments',
      description: `
This tool lists organization context documents as metadata only (id, name, description, fileSize, updatedAt).
Use it to discover brand, tone, audience, or other org guidance before calling readContextDocument.
It never returns Markdown content, and it excludes agent skills (*.skill.md).
`,
      inputSchema: z.object({}),
      mcp: {
        annotations: {
          title: 'List Context Documents',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        output: z.array(contextDocumentMetadataSchema),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        const documents =
          await this._contextDocumentService.listStandardDocuments(
            organizationId
          );

        return {
          output: documents.map((document) => ({
            id: document.id,
            name: document.name,
            description: document.description ?? null,
            fileSize: document.fileSize,
            updatedAt: new Date(document.updatedAt).toISOString(),
            isLarge: document.isLarge,
            ...(document.warning ? { warning: document.warning } : {}),
          })),
        };
      },
    });
  }
}

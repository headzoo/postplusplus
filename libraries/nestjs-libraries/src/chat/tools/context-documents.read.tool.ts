import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { ContextDocumentService } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

const readContextDocumentInputSchema = z
  .object({
    documentId: z
      .string()
      .optional()
      .describe('The context document id from listContextDocuments'),
    name: z
      .string()
      .optional()
      .describe('The exact context document name from listContextDocuments'),
  })
  .refine((input) => Boolean(input.documentId) !== Boolean(input.name), {
    message: 'Provide exactly one of documentId or name.',
  });

@Injectable()
export class ContextDocumentReadTool implements AgentToolInterface {
  constructor(private _contextDocumentService: ContextDocumentService) {}
  name = 'readContextDocument';

  run() {
    return createTool({
      id: 'readContextDocument',
      description: `
This tool reads the Markdown content of one organization context document.
Use listContextDocuments first to see document metadata (id, name, description).
Pass exactly one of documentId or exact name.
Read only documents relevant to the user's request — do not read every document.
`,
      inputSchema: readContextDocumentInputSchema,
      mcp: {
        annotations: {
          title: 'Read Context Document',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        output: z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().nullable(),
          content: z.string(),
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

        const document = inputData.documentId
          ? await this._contextDocumentService.getDocumentById(
              organizationId,
              inputData.documentId
            )
          : await this._contextDocumentService.getDocumentByName(
              organizationId,
              inputData.name!
            );

        return {
          output: {
            id: document.id,
            name: document.name,
            description: document.description ?? null,
            content: document.content,
            updatedAt: new Date(document.updatedAt).toISOString(),
            isLarge: document.isLarge,
            ...(document.warning ? { warning: document.warning } : {}),
          },
        };
      },
    });
  }
}

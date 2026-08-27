import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { ContextDocumentService } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

const readPipelineContextDocumentInputSchema = z
  .object({
    pipelineId: z
      .string()
      .describe('The pipeline id from the listPipelines tool'),
    documentId: z
      .string()
      .optional()
      .describe('The attached context document id from listPipelines'),
    name: z
      .string()
      .optional()
      .describe('The exact attached context document name from listPipelines'),
  })
  .refine((input) => Boolean(input.documentId) !== Boolean(input.name), {
    message: 'Provide exactly one of documentId or name.',
  });

@Injectable()
export class PipelineContextDocumentReadTool implements AgentToolInterface {
  constructor(private _contextDocumentService: ContextDocumentService) {}
  name = 'readPipelineContextDocument';

  run() {
    return createTool({
      id: 'readPipelineContextDocument',
      description: `
This tool reads the Markdown content of one context document attached to a pipeline.
Use listPipelines first to see attached document metadata (id, name, description, fileSize, updatedAt).
Pass the pipeline id and exactly one of documentId or exact name for an attached document.
Read only documents relevant to the user's requested pipeline content — do not read every attachment.
`,
      inputSchema: readPipelineContextDocumentInputSchema,
      mcp: {
        annotations: {
          title: 'Read Pipeline Context Document',
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

        const document =
          await this._contextDocumentService.getAttachedDocumentForPipeline(
            organizationId,
            inputData.pipelineId,
            {
              documentId: inputData.documentId,
              name: inputData.name,
            }
          );

        return {
          output: {
            id: document.id,
            name: document.name,
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

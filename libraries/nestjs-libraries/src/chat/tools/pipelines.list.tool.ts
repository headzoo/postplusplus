import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { PipelineService } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class PipelinesListTool implements AgentToolInterface {
  constructor(private _pipelineService: PipelineService) { }
  name = 'listPipelines';

  run() {
    return createTool({
      id: 'listPipelines',
      description: `This tool lists the organization's pipelines (content queues with weekly schedules). Each pipeline may include attached contextDocuments metadata (id, name, description, fileSize, updatedAt) only — use readPipelineContextDocument to load the Markdown content for one relevant attached document before drafting pipeline content. Use a pipeline id with listPostsByPipeline to inspect queued posts, or with enqueuePipelinePost to compose and enqueue new content for every channel on that pipeline.`,
      inputSchema: z.object({}),
      mcp: {
        annotations: {
          title: 'List Pipelines',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        output: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            timezone: z.string(),
            active: z.boolean(),
            queueCount: z.number(),
            nextSlot: z.string().optional(),
            projectedEnqueueFor: z.string().optional(),
            channels: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                platform: z.string(),
                picture: z.string().nullable().optional(),
              })
            ),
            contextDocuments: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                description: z.string().nullable().optional(),
                fileSize: z.number(),
                updatedAt: z.string(),
              })
            ),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        const pipelines = await this._pipelineService.getPipelines(
          organizationId
        );

        return {
          output: pipelines.map((pipeline) => ({
            id: pipeline.id,
            name: pipeline.name,
            timezone: pipeline.timezone,
            active: pipeline.active,
            queueCount: pipeline.queueCount,
            nextSlot: pipeline.nextSlot
              ? new Date(pipeline.nextSlot).toISOString()
              : undefined,
            projectedEnqueueFor: pipeline.projectedEnqueueFor
              ? new Date(pipeline.projectedEnqueueFor).toISOString()
              : undefined,
            channels: (pipeline.channels || []).map((channel: any) => ({
              id: channel.id,
              name: channel.name,
              platform: channel.identifier,
              picture: channel.picture,
            })),
            contextDocuments: (pipeline.contextDocuments || []).map(
              (document: {
                id: string;
                name: string;
                description?: string | null;
                fileSize: number;
                updatedAt: Date | string;
              }) => ({
                id: document.id,
                name: document.name,
                description: document.description ?? null,
                fileSize: document.fileSize,
                updatedAt: new Date(document.updatedAt).toISOString(),
              })
            ),
          })),
        };
      },
    });
  }
}

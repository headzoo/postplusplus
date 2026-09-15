import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class GenerateImageTool implements AgentToolInterface {
  private storage = UploadFactory.createStorage();

  constructor(private _mediaService: MediaService) {}
  name = 'generateImageTool';

  run() {
    return createTool({
      id: 'generateImageTool',
      description: `Generate an image to use in a post. When generating for a Pipeline, pass pipelineId from listPipelines; the current Pipeline reference images are used by default. Set usePipelineReferences to false only when the user explicitly asks for an off-brand result. If no pipelineId is provided and no Pipeline is selected in-app, generation is prompt-only. In case the user specified a platform that requires attachment and attachment was not provided, ask if they want to generate a picture of a video.`,
      mcp: {
        annotations: {
          title: 'Generate Image',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        prompt: z.string(),
        pipelineId: z
          .string()
          .optional()
          .describe(
            'Pipeline id from listPipelines for reference-aware generation'
          ),
        usePipelineReferences: z
          .boolean()
          .default(true)
          .describe(
            'Use current Pipeline reference images. Set false only for an explicitly requested off-brand image.'
          ),
      }),
      outputSchema: z.object({
        id: z.string(),
        path: z.string(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );
        const selectedPipeline = (context?.requestContext as any)?.get(
          'pipeline'
        ) as { id?: string } | null;
        const pipelineId = inputData.pipelineId || selectedPipeline?.id;
        const usePipelineReferences = inputData.usePipelineReferences ?? true;
        const image = await this._mediaService.generateImage(
          inputData.prompt,
          org,
          undefined,
          pipelineId,
          usePipelineReferences
        );

        const file = await this.storage.uploadSimple(
          'data:image/png;base64,' + image
        );

        return this._mediaService.saveFile(org.id, file.split('/').pop(), file);
      },
    });
  }
}

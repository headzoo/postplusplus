import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, Injectable } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PipelineService } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { AllProvidersSettings } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/all.providers.settings';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import {
  ValidUrlExtension,
  ValidUrlPath,
} from '@gitroom/helpers/utils/valid.url.path';

const validUrlExtension = new ValidUrlExtension();
const validUrlPath = new ValidUrlPath();

// Same URL validation as MediaDto (valid.url.path) - each attachment must
// point to an allowed upload domain and a supported file extension.
const attachmentUrl = z
  .string()
  .refine((url) => validUrlPath.validate(url, {} as any), {
    message: validUrlPath.defaultMessage({} as any),
  })
  .refine((url) => validUrlExtension.validate(url, {} as any), {
    message: validUrlExtension.defaultMessage({} as any),
  });

const formatExceptionMessage = (error: unknown) => {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message: string | string[] }).message;
      return Array.isArray(message) ? message.join(', ') : message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Unable to enqueue post to pipeline';
};

@Injectable()
export class PipelineEnqueuePostTool implements AgentToolInterface {
  constructor(
    private _pipelineService: PipelineService,
    private _postsService: PostsService,
    private _integrationService: IntegrationService
  ) {}
  name = 'enqueuePipelinePost';

  run() {
    return createTool({
      id: 'enqueuePipelinePost',
      mcp: {
        annotations: {
          title: 'Enqueue Post to Pipeline',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      description: `
This tool enqueues composed multi-channel content into a pipeline queue.
Use listPipelines first to get the pipeline id and the exact channels required.
You must include exactly one channelPosts entry for every channel on that pipeline (same integration ids).
Publishing time is assigned by the pipeline schedule — do not pass a date.
Content is queued as a draft; the pipeline will schedule it into upcoming slots.

Always use integrationSchema for each platform before calling this tool.
If the tool returns errors, fix the parameters and retry without asking again.
`,
      inputSchema: z.object({
        pipelineId: z
          .string()
          .describe('The pipeline id from the listPipelines tool'),
        shortLink: z
          .boolean()
          .describe(
            'If the post has a link inside, we can ask the user if they want to add a short link'
          ),
        channelPosts: z
          .array(
            z.object({
              integrationId: z
                .string()
                .describe('The id of the integration (not internal id)'),
              isPremium: z
                .boolean()
                .describe(
                  "If the integration is X, return if it's premium or not"
                ),
              postsAndComments: z
                .array(
                  z.object({
                    content: z
                      .string()
                      .describe(
                        "The content of the post, HTML, Each line must be wrapped in <p> here is the possible tags: h1, h2, h3, u, strong, li, ul, p (you can't have u and strong together)"
                      ),
                    attachments: z
                      .array(attachmentUrl)
                      .describe('The image of the post (URLS)'),
                  })
                )
                .describe(
                  'first item is the post, every other item is the comments'
                ),
              settings: z
                .array(
                  z.object({
                    key: z
                      .string()
                      .describe('Name of the settings key to pass'),
                    value: z
                      .any()
                      .describe(
                        'Value of the key, always prefer the id then label if possible'
                      ),
                  })
                )
                .describe(
                  'This relies on the integrationSchema tool to get the settings [input:settings]'
                ),
            })
          )
          .describe(
            'One entry per pipeline channel; must match exactly the channels from listPipelines'
          ),
      }),
      outputSchema: z.object({
        output: z
          .object({
            queueItemId: z.string(),
            group: z.string(),
          })
          .or(z.object({ errors: z.string() })),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        try {
          const pipeline = await this._pipelineService.getPipeline(
            organizationId,
            inputData.pipelineId
          );

          const pipelineChannelIds = (pipeline.channels || [])
            .map((channel: { id: string }) => channel.id)
            .sort();
          const providedChannelIds = inputData.channelPosts
            .map((post) => post.integrationId)
            .sort();

          if (
            pipelineChannelIds.length !== providedChannelIds.length ||
            pipelineChannelIds.some(
              (id, index) => id !== providedChannelIds[index]
            )
          ) {
            return {
              errors: `Pipeline content must contain exactly these channel ids: ${pipelineChannelIds.join(
                ', '
              )}. Please fix it, and try enqueuePipelinePost again.`,
            };
          }

          const integrations = {} as Record<
            string,
            Awaited<ReturnType<IntegrationService['getIntegrationById']>>
          >;

          for (const platform of inputData.channelPosts) {
            const integration =
              await this._integrationService.getIntegrationById(
                organizationId,
                platform.integrationId
              );

            if (!integration) {
              return {
                errors: `Channel ${platform.integrationId} was not found. Please fix it, and try enqueuePipelinePost again.`,
              };
            }

            integrations[platform.integrationId] = integration;

            const settings = platform.settings.reduce(
              (acc: AllProvidersSettings, s: { key: string; value: any }) => ({
                ...acc,
                [s.key]: s.value,
              }),
              {} as AllProvidersSettings
            );

            const [validation] = await this._postsService.validatePosts(
              organizationId,
              [
                {
                  integration: { id: platform.integrationId },
                  settings,
                  value: platform.postsAndComments.map((p: any) => ({
                    content: p.content,
                    image: (p.attachments || []).map((path: string) => ({
                      path,
                    })),
                  })),
                },
              ]
            );

            if (validation.emptyContent) {
              return {
                errors: `${validation.name}: Your post should have at least one character or one image.`,
              };
            }

            if (!validation.valid) {
              return {
                errors: `${validation.name}: ${
                  validation.settingsError || 'Please fix your settings'
                }, please fix it, and try enqueuePipelinePost again.`,
              };
            }

            if (validation.errors !== true) {
              return {
                errors: `${validation.name}: ${validation.errors}, please fix it, and try enqueuePipelinePost again.`,
              };
            }

            if (validation.tooLong) {
              return {
                errors: `${validation.name}: The maximum characters is ${validation.maximumCharacters}, please fix it, and try enqueuePipelinePost again.`,
              };
            }
          }

          const result = await this._pipelineService.enqueue(organizationId, {
            pipelineId: inputData.pipelineId,
            post: {
              type: 'draft',
              shortLink: inputData.shortLink,
              tags: [],
              posts: inputData.channelPosts.map((platform) => {
                const integration = integrations[platform.integrationId];

                return {
                  integration: { id: platform.integrationId },
                  settings: platform.settings.reduce(
                    (
                      acc: AllProvidersSettings,
                      s: { key: string; value: any }
                    ) => ({
                      ...acc,
                      [s.key]: s.value,
                    }),
                    {
                      __type: integration.providerIdentifier,
                    } as AllProvidersSettings
                  ),
                  value: platform.postsAndComments.map((p: any) => ({
                    content: p.content,
                    id: makeId(10),
                    delay: 0,
                    image: (p.attachments || []).map((path: string) => ({
                      id: makeId(10),
                      path,
                    })),
                  })),
                };
              }),
            },
          } as any);

          return {
            output: {
              queueItemId: result.id,
              group: result.group,
            },
          };
        } catch (error) {
          return {
            errors: `${formatExceptionMessage(
              error
            )}. Please fix it, and try enqueuePipelinePost again.`,
          };
        }
      },
    });
  }
}

import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import {
  FOLLOWER_LIST_MEMBER_WRITE_BATCH,
  followerWriteToolAnnotations,
  getFollowerToolContext,
  requireFollowerWriteActor,
} from '@gitroom/nestjs-libraries/chat/tools/follower.tool.common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';

const removeFollowerListMembersSchema = z
  .object({
    channelId: z.string().min(1).max(64),
    listId: z.string().min(1).max(64),
    externalIds: z
      .array(z.string().min(1).max(512))
      .min(1)
      .max(FOLLOWER_LIST_MEMBER_WRITE_BATCH)
      .optional(),
    onlyFollowing: z.literal(true).optional(),
  })
  .superRefine((value, ctx) => {
    const hasExternalIds = Array.isArray(value.externalIds);
    const onlyFollowing = value.onlyFollowing === true;
    if (hasExternalIds === onlyFollowing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either externalIds or onlyFollowing: true, not both',
      });
    }
    if (hasExternalIds && value.externalIds) {
      const unique = new Set(value.externalIds);
      if (unique.size !== value.externalIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'externalIds must be unique',
          path: ['externalIds'],
        });
      }
    }
  });

@Injectable()
export class FollowerListRemoveMembersTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'removeFollowerListMembers';

  run() {
    return createTool({
      id: this.name,
      description:
        'Remove members from a named follower list. Pass onlyFollowing: true to remove up to 50 current followers from the list per call (repeat while hasMore). Or pass up to 50 externalIds. Confirm list name and count with the user before calling. Resolve listId via listFollowerLists first.',
      inputSchema: removeFollowerListMembersSchema,
      mcp: {
        annotations: {
          ...followerWriteToolAnnotations,
          title: 'Remove follower list members',
          destructiveHint: true,
          idempotentHint: true,
        },
      },
      outputSchema: z.object({
        output: z.object({
          removed: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              username: z.string().optional(),
            })
          ),
          remaining: z.number().int().nonnegative(),
          hasMore: z.boolean(),
        }),
      }),
      execute: async (inputData, context) => {
        const { organization, actor } = getFollowerToolContext(
          inputData,
          context
        );
        requireFollowerWriteActor(actor);
        const result = await this._integrationService.removeFollowerListMembers(
          organization,
          inputData.channelId,
          inputData.listId,
          {
            ...(inputData.onlyFollowing
              ? { onlyFollowing: true as const }
              : { externalIds: inputData.externalIds }),
          }
        );
        return { output: result };
      },
    });
  }
}

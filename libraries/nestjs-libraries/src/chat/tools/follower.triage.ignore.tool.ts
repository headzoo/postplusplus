import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import {
  followerWriteToolAnnotations,
  getFollowerToolContext,
  requireFollowerWriteActor,
} from '@gitroom/nestjs-libraries/chat/tools/follower.tool.common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { LEAD_FIT_DISMISS_REASONS } from '@gitroom/nestjs-libraries/dtos/integrations/lead-fit-feedback.types';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import z from 'zod';

const triageValues = [
  'hot_lead',
  'mutual',
  'over_invested',
  'quiet',
  'lead',
  'engaged_not_yet',
] as const;

const ignoreFollowerTriageSchema = z
  .object({
    channelId: z.string().min(1).max(64),
    externalId: z.string().min(1).max(512),
    triage: z.enum(triageValues),
    reasons: z.array(z.enum(LEAD_FIT_DISMISS_REASONS)).min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.triage === 'lead' && (!value.reasons || !value.reasons.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Lead dismiss requires at least one reason',
        path: ['reasons'],
      });
    }
    if (value.triage !== 'lead' && value.reasons?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reasons are only valid when triage is lead',
        path: ['reasons'],
      });
    }
  });

@Injectable()
export class FollowerTriageIgnoreTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'ignoreFollowerTriage';

  run() {
    return createTool({
      id: this.name,
      description:
        'Dismiss a relationship triage badge or Lead for one audience member. For triage=lead, require at least one reason from wrong_topic, bio_wording, promotional, competitor, not_a_prospect. Confirm the person and reasons with the user before calling.',
      inputSchema: ignoreFollowerTriageSchema,
      mcp: {
        annotations: {
          ...followerWriteToolAnnotations,
          title: 'Dismiss follower triage',
          destructiveHint: true,
          idempotentHint: true,
        },
      },
      outputSchema: z.object({
        output: z.object({
          ok: z.literal(true),
          channelId: z.string(),
          externalId: z.string(),
          triage: z.enum(triageValues),
        }),
      }),
      execute: async (inputData, context) => {
        const { organization, actor } = getFollowerToolContext(
          inputData,
          context
        );
        const writeActor = requireFollowerWriteActor(actor);
        await this._integrationService.ignoreFollowerMemberTriage(
          organization,
          { id: writeActor.userId } as User,
          inputData.channelId,
          inputData.externalId,
          inputData.triage,
          inputData.reasons
        );
        return {
          output: {
            ok: true as const,
            channelId: inputData.channelId,
            externalId: inputData.externalId,
            triage: inputData.triage,
          },
        };
      },
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ChannelInteractionDirection,
  ChannelInteractionKind,
  Prisma,
} from '@prisma/client';
import { ChannelInteractionPostSnapshot } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

export type ConversationCursor = {
  eventAt: Date;
  id: string;
};

const conversationSelect = {
  id: true,
  integrationId: true,
  kind: true,
  eventAt: true,
  counterpartyExternalId: true,
  relatedObjectId: true,
  metadata: true,
  postSnapshot: true,
  snapshotCompleteness: true,
  integration: true,
} satisfies Prisma.ChannelInteractionEventSelect;

@Injectable()
export class ConversationRepository {
  constructor(
    private _conversation: PrismaRepository<'channelInteractionEvent'>
  ) {}

  async list(
    organizationId: string,
    options: {
      take?: number;
      cursor?: ConversationCursor;
      integrationId?: string;
    } = {}
  ) {
    const take = Math.min(Math.max(options.take ?? 20, 1), 100);
    const events =
      await this._conversation.model.channelInteractionEvent.findMany({
        where: {
          organizationId,
          direction: ChannelInteractionDirection.INBOUND,
          kind: {
            in: [ChannelInteractionKind.MENTION, ChannelInteractionKind.REPOST],
          },
          ...(options.integrationId
            ? { integrationId: options.integrationId }
            : {}),
          ...(options.cursor
            ? {
                OR: [
                  { eventAt: { lt: options.cursor.eventAt } },
                  {
                    eventAt: options.cursor.eventAt,
                    id: { lt: options.cursor.id },
                  },
                ],
              }
            : {}),
          integration: {
            is: { deletedAt: null, disabled: false },
          },
        },
        select: conversationSelect,
        orderBy: [{ eventAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
      });
    return {
      events: events.slice(0, take),
      next:
        events.length > take
          ? {
              eventAt: events[take - 1].eventAt,
              id: events[take - 1].id,
            }
          : undefined,
    };
  }

  findOwned(organizationId: string, eventId: string) {
    return this._conversation.model.channelInteractionEvent.findFirst({
      where: {
        id: eventId,
        organizationId,
        direction: ChannelInteractionDirection.INBOUND,
        kind: {
          in: [ChannelInteractionKind.MENTION, ChannelInteractionKind.REPOST],
        },
        integration: {
          is: { deletedAt: null, disabled: false },
        },
      },
      select: conversationSelect,
    });
  }

  async findOwnedMany(organizationId: string, eventIds: string[]) {
    if (!eventIds.length) return [];
    return this._conversation.model.channelInteractionEvent.findMany({
      where: {
        id: { in: eventIds },
        organizationId,
        direction: ChannelInteractionDirection.INBOUND,
        kind: {
          in: [ChannelInteractionKind.MENTION, ChannelInteractionKind.REPOST],
        },
        integration: {
          is: { deletedAt: null, disabled: false },
        },
      },
      select: conversationSelect,
    });
  }

  async updateSnapshot(
    organizationId: string,
    eventId: string,
    postSnapshot: ChannelInteractionPostSnapshot
  ) {
    const result =
      await this._conversation.model.channelInteractionEvent.updateMany({
        where: { id: eventId, organizationId },
        data: {
          postSnapshot: postSnapshot as Prisma.InputJsonValue,
          snapshotVersion: postSnapshot.version,
          snapshotCompleteness: postSnapshot.completeness,
        },
      });
    if (!result.count)
      throw new NotFoundException('Conversation was not found');
  }
}

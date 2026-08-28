import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelInteractionKind, Prisma } from '@prisma/client';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  ChannelInteractionCounterparty,
  ChannelInteractionPostSnapshot,
  ConversationActionDescriptors,
  ConversationCapability,
  ConversationEventContext,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { ChannelInteractionService } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.service';
import { ConversationRepository } from './conversation.repository';

const MAX_HYDRATION_EVENTS = 100;

type ConversationEvent = Awaited<
  ReturnType<ConversationRepository['findOwned']>
>;

@Injectable()
export class ConversationService {
  constructor(
    private _repository: ConversationRepository,
    private _integrationManager: IntegrationManager,
    private _channelInteractionService: ChannelInteractionService
  ) {}

  async list(
    organizationId: string,
    options: { limit?: number; cursor?: string; integrationId?: string } = {}
  ) {
    const page = await this._repository.list(organizationId, {
      take: options.limit,
      cursor: options.cursor ? this.decodeCursor(options.cursor) : undefined,
      integrationId: options.integrationId,
    });
    return {
      items: page.events.map((event) => this.serialize(event)),
      nextCursor: page.next
        ? this.encodeCursor(page.next.eventAt, page.next.id)
        : undefined,
    };
  }

  async hydrate(organizationId: string, eventIds: string[]) {
    const uniqueEventIds = [...new Set(eventIds)];
    if (uniqueEventIds.length > MAX_HYDRATION_EVENTS) {
      throw new BadRequestException(
        `At most ${MAX_HYDRATION_EVENTS} conversations can be hydrated`
      );
    }
    const events = await this._repository.findOwnedMany(
      organizationId,
      uniqueEventIds
    );
    const byIntegration = new Map<string, typeof events>();
    for (const event of events) {
      const group = byIntegration.get(event.integrationId) ?? [];
      group.push(event);
      byIntegration.set(event.integrationId, group);
    }

    const snapshots = new Map<string, ChannelInteractionPostSnapshot>();
    await Promise.all(
      [...byIntegration.values()].map(async (group) => {
        const [event] = group;
        const provider = this._integrationManager.getSocialIntegration(
          event.integration.providerIdentifier
        );
        if (!provider?.conversations || !event.integration.token) return;
        const requests = group.flatMap((candidate) => {
          const snapshot = this.readSnapshot(candidate.postSnapshot);
          const sourceExternalId =
            snapshot?.externalId ??
            provider.conversations.getHydrationSourceExternalId(
              this.eventContext(candidate)
            );
          return sourceExternalId &&
            this.supportsEvent(provider.conversations, candidate)
            ? [{ eventId: candidate.id, externalPostId: sourceExternalId }]
            : [];
        });
        if (!requests.length) return;
        try {
          const hydrated = await provider.conversations.hydrate(
            event.integration,
            event.integration.token,
            requests
          );
          for (const result of hydrated) {
            if (group.some((candidate) => candidate.id === result.eventId)) {
              try {
                snapshots.set(
                  result.eventId,
                  this._channelInteractionService.validatePostSnapshot(
                    result.postSnapshot
                  )
                );
              } catch {
                // A malformed provider response must never be persisted.
              }
            }
          }
        } catch {
          // Hydration enriches existing records; one channel failure must not
          // make unrelated channels unavailable.
        }
      })
    );

    await Promise.all(
      [...snapshots.entries()].map(([eventId, snapshot]) =>
        this._repository.updateSnapshot(organizationId, eventId, snapshot)
      )
    );
    const updated = await this._repository.findOwnedMany(
      organizationId,
      uniqueEventIds
    );
    return { items: updated.map((event) => this.serialize(event)) };
  }

  async repost(organizationId: string, eventId: string) {
    const event = await this._repository.findOwned(organizationId, eventId);
    if (!event) throw new NotFoundException('Conversation was not found');
    const snapshot = this.readSnapshot(event.postSnapshot);
    if (!snapshot) {
      throw new BadRequestException('Conversation post is unavailable');
    }
    const provider = this._integrationManager.getSocialIntegration(
      event.integration.providerIdentifier
    );
    if (
      !provider?.conversations ||
      !this.supportsEvent(provider.conversations, event)
    ) {
      throw new BadRequestException('Repost is not available for this channel');
    }
    const eligibility = provider.conversations.eligibility({
      integration: event.integration,
      event: this.eventContext(event),
      postSnapshot: snapshot,
    });
    if (!eligibility.canRepost || !eligibility.repostExternalId) {
      throw new BadRequestException(
        eligibility.repostReason ??
          'Repost is not available for this conversation'
      );
    }
    if (!event.integration.token) {
      throw new BadRequestException(
        'Channel posting credential is unavailable'
      );
    }
    return provider.conversations.repost(
      event.integration,
      event.integration.token,
      eligibility.repostExternalId
    );
  }

  private serialize(event: NonNullable<ConversationEvent>) {
    const snapshot = this.readSnapshot(event.postSnapshot);
    const provider = this._integrationManager.getSocialIntegration(
      event.integration.providerIdentifier
    );
    const actions =
      snapshot &&
      provider?.conversations &&
      this.supportsEvent(provider.conversations, event)
        ? provider.conversations.eligibility({
            integration: event.integration,
            event: this.eventContext(event),
            postSnapshot: snapshot,
          })
        : { canRepost: false };
    return {
      id: event.id,
      type: this.classify(event.kind, event.metadata),
      eventAt: event.eventAt.toISOString(),
      provider: event.integration.providerIdentifier,
      channel: {
        id: event.integration.id,
        name: event.integration.name,
        picture: event.integration.picture,
        username: event.integration.profile,
      },
      actor: snapshot?.author ?? { externalId: event.counterpartyExternalId },
      post: snapshot,
      snapshotState: snapshot?.completeness ?? 'missing',
      actions: this.sanitizeActions(actions),
    };
  }

  private classify(
    kind: ChannelInteractionKind,
    value: Prisma.JsonValue | null
  ) {
    if (kind === ChannelInteractionKind.REPOST) return 'repost';
    const metadata = this.readRecord(value);
    return metadata?.referenceType === 'quote' ? 'quote' : 'mention';
  }

  private readSnapshot(
    value: Prisma.JsonValue | null
  ): ChannelInteractionPostSnapshot | undefined {
    try {
      return this._channelInteractionService.validatePostSnapshot(
        value as ChannelInteractionPostSnapshot
      );
    } catch {
      return undefined;
    }
  }

  private readRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private sanitizeActions(
    actions: ConversationActionDescriptors
  ): ConversationActionDescriptors {
    return {
      ...(this.isHttpUrl(actions.likeUrl) ? { likeUrl: actions.likeUrl } : {}),
      ...(this.isHttpUrl(actions.replyUrl)
        ? { replyUrl: actions.replyUrl }
        : {}),
      canRepost: actions.canRepost === true,
      ...(actions.canQuote === true ? { canQuote: true } : {}),
      ...(typeof actions.repostReason === 'string' &&
      actions.repostReason.length <= 512
        ? { repostReason: actions.repostReason }
        : {}),
    };
  }

  private supportsEvent(
    capability: ConversationCapability | undefined,
    event: NonNullable<ConversationEvent>
  ) {
    return (
      !!capability &&
      capability.supported.kinds.includes(this.eventContext(event).kind)
    );
  }

  private eventContext(
    event: NonNullable<ConversationEvent>
  ): ConversationEventContext {
    const metadata = this.readRecord(event.metadata);
    return {
      kind: event.kind === ChannelInteractionKind.REPOST ? 'repost' : 'mention',
      ...(event.relatedObjectId
        ? { relatedObjectId: event.relatedObjectId }
        : {}),
      ...(metadata
        ? {
            metadata: Object.fromEntries(
              Object.entries(metadata).flatMap(([key, value]) =>
                typeof value === 'string' ? [[key, value]] : []
              )
            ),
          }
        : {}),
    };
  }

  private isHttpUrl(value: unknown) {
    try {
      return (
        typeof value === 'string' && /^https?:$/.test(new URL(value).protocol)
      );
    } catch {
      return false;
    }
  }

  private encodeCursor(eventAt: Date, id: string) {
    return Buffer.from(
      JSON.stringify({ eventAt: eventAt.toISOString(), id })
    ).toString('base64url');
  }

  private decodeCursor(cursor: string) {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8')
      ) as { eventAt?: unknown; id?: unknown };
      const eventAt =
        typeof decoded.eventAt === 'string' ? new Date(decoded.eventAt) : null;
      if (
        !eventAt ||
        Number.isNaN(eventAt.getTime()) ||
        typeof decoded.id !== 'string'
      ) {
        throw new Error('Invalid cursor');
      }
      return { eventAt, id: decoded.id };
    } catch {
      throw new BadRequestException('Invalid conversation cursor');
    }
  }
}

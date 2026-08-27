import { Injectable } from '@nestjs/common';
import {
  ChannelInteractionDirection,
  ChannelInteractionKind,
  ConversionAttributionMethod,
  ConversionEvaluationJob,
  ConversionEvent,
  ConversionJobKind,
  ConversionSource,
  Prisma,
} from '@prisma/client';
import {
  getChannelStrategy,
  isChannelStrategyId,
} from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.registry';
import {
  AmplificationConversionProfile,
  CustomerSupportConversionProfile,
  FollowerTransitionConversionProfile,
  WebsiteGoalConversionProfile,
} from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.types';
import { appendReservedParamsToText } from '@gitroom/helpers/utils/utm.params';
import { createHash, createHmac, randomBytes } from 'crypto';
import {
  decodeConversionCursor,
  encodeConversionCursor,
  MAX_CONVERSION_FUTURE_SKEW_MS,
  MAX_CONVERSION_GOAL_LENGTH,
  normalizeGoalAttributionUtm,
  parseUtcDateRange,
  sanitizeBoundedJson,
  STANDARD_UTM_FIELDS,
} from '@gitroom/nestjs-libraries/dtos/conversions/conversion.shared';
import { ConversionRepository } from './conversion.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_EVIDENCE_ID_LENGTH = 512;

type JobPayload = Record<string, unknown>;

class HistoricalStrategyUnavailableError extends Error {}

@Injectable()
export class ConversionService {
  constructor(private _repository: ConversionRepository) {}

  async prepareLeadCaptureLinks(input: {
    organizationId: string;
    integrationId: string;
    strategyId: string;
    strategyVersion: number;
    utmParams?: string | null;
    shortLinkDomain?: string;
    values: { id: string; content: string }[];
  }) {
    if (!isChannelStrategyId(input.strategyId)) {
      return input.values.map(({ content }) => content);
    }
    const strategy = getChannelStrategy(input.strategyId);
    if (strategy.version !== input.strategyVersion) {
      return input.values.map(({ content }) => content);
    }
    const profile = strategy.getConversionProfile();
    if (profile.kind !== 'website_goal') {
      return input.values.map(({ content }) => content);
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + profile.attributionWindowDays * DAY_MS
    );
    const normalizedUtm = normalizeGoalAttributionUtm(input.utmParams || '');
    const utmSnapshot = normalizedUtm?.snapshot;
    const utmFingerprint = normalizedUtm?.fingerprint;
    const attributions = new Map<
      string,
      {
        clickId: string;
        sourcePostItemId: string;
        destinationHash: string;
        strategyId: string;
        strategyVersion: number;
        utmFingerprint?: string;
        utmSnapshot?: string;
        expiresAt: Date;
      }
    >();

    const contents = input.values.map(({ id, content }) =>
      appendReservedParamsToText(
        content,
        (url) => {
          const canonicalDestination = this.canonicalDestination(url, profile);
          if (!canonicalDestination) return [];
          const clickId = this.clickId(
            input.organizationId,
            input.integrationId,
            input.strategyId,
            input.strategyVersion,
            id,
            canonicalDestination
          );
          attributions.set(clickId, {
            clickId,
            sourcePostItemId: id,
            destinationHash: createHash('sha256')
              .update(canonicalDestination)
              .digest('hex'),
            strategyId: input.strategyId,
            strategyVersion: input.strategyVersion,
            ...(utmFingerprint ? { utmFingerprint } : {}),
            ...(utmSnapshot ? { utmSnapshot } : {}),
            expiresAt,
          });
          return [[profile.clickIdParameter, clickId]];
        },
        input.shortLinkDomain
      )
    );

    for (const attribution of attributions.values()) {
      await this._repository.upsertClickAttribution(
        input.organizationId,
        input.integrationId,
        attribution
      );
    }
    return contents;
  }

  async evaluateJob(job: ConversionEvaluationJob) {
    if (!job.claimToken) {
      throw new Error('Conversion evaluation job must hold an active claim');
    }
    try {
      const strategy = this.resolveCapturedStrategy(
        job.strategyId,
        job.strategyVersion
      );
      const profile = strategy.getConversionProfile();
      const payload = this.payload(job.payload);
      let result: unknown = null;

      switch (profile.kind) {
        case 'follower_transition':
          if (job.kind === ConversionJobKind.MEMBERSHIP_TRANSITION) {
            result = await this.evaluateFollower(job, payload, profile);
          }
          break;
        case 'amplification':
          if (job.kind === ConversionJobKind.INTERACTION) {
            result = await this.evaluateAmplification(job, payload, profile);
          }
          break;
        case 'customer_support':
          if (job.kind === ConversionJobKind.INTERACTION) {
            result = await this.evaluateSupportInteraction(
              job,
              payload,
              profile
            );
          } else if (job.kind === ConversionJobKind.INFERRED_RESOLUTION) {
            result = await this.evaluateInferredResolution(
              job,
              payload,
              profile
            );
          }
          break;
        case 'website_goal':
          break;
      }

      await this._repository.completeJob(
        job.organizationId,
        job.id,
        job.claimToken
      );
      return { status: 'complete' as const, result };
    } catch (error) {
      const terminal = error instanceof HistoricalStrategyUnavailableError;
      await this._repository.retryOrFailJob(
        job.organizationId,
        job.id,
        job.claimToken,
        error,
        new Date(),
        terminal ? 1 : undefined
      );
      if (terminal) {
        return { status: 'failed' as const, error: error.message };
      }
      throw error;
    }
  }

  async ingestGoal(input: {
    organizationId: string;
    source: ConversionSource;
    eventId: string;
    integrationId?: string;
    goal: string;
    occurredAt?: Date;
    ppClickId?: string;
    utm?: Partial<
      Record<(typeof STANDARD_UTM_FIELDS)[number], string | undefined>
    >;
    actorExternalId?: string;
    userProperties?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    this.bounded(input.eventId, 'eventId');
    this.boundedGoal(input.goal);
    if (input.actorExternalId) {
      this.bounded(input.actorExternalId, 'actorExternalId');
    }
    const occurredAt = input.occurredAt ?? new Date();
    this.assertOccurredAt(occurredAt);
    const userProperties = sanitizeBoundedJson(
      input.userProperties,
      'userProperties'
    );
    const metadata = sanitizeBoundedJson(input.metadata, 'metadata');
    let attribution:
      | Awaited<
          ReturnType<
            ConversionRepository['findActiveClickAttributionByClickId']
          >
        >
      | Awaited<
          ReturnType<
            ConversionRepository['findActiveClickAttributionByUtmFingerprint']
          >
        >;
    let attributionMethod: ConversionAttributionMethod;

    if (input.ppClickId !== undefined) {
      const clickId = input.ppClickId.trim();
      this.bounded(clickId, 'ppClickId');
      attribution = await this._repository.findActiveClickAttributionByClickId(
        input.organizationId,
        clickId
      );
      if (!attribution) {
        throw new Error('Click attribution is invalid or expired');
      }
      if (
        input.integrationId &&
        input.integrationId !== attribution.integrationId
      ) {
        throw new Error('Click attribution does not match integration');
      }
      attributionMethod = ConversionAttributionMethod.CLICK_ID;
    } else {
      if (!input.integrationId) {
        throw new Error('integrationId is required for UTM attribution');
      }
      const integration = await this._repository.findOwnedIntegration(
        input.organizationId,
        input.integrationId
      );
      if (!integration) {
        throw new Error('Channel integration does not belong to organization');
      }
      if (!isChannelStrategyId(integration.strategyId)) {
        throw new Error('Integration strategy does not support website goals');
      }
      const strategy = getChannelStrategy(integration.strategyId);
      if (strategy.getConversionProfile().kind !== 'website_goal') {
        throw new Error('Integration strategy does not support website goals');
      }
      const normalizedUtm = normalizeGoalAttributionUtm(input.utm || {});
      if (!normalizedUtm) {
        throw new Error('UTM attribution requires normalized UTM fields');
      }
      attribution =
        await this._repository.findActiveClickAttributionByUtmFingerprint(
          input.organizationId,
          input.integrationId,
          normalizedUtm.fingerprint
        );
      if (!attribution) {
        throw new Error('UTM attribution is invalid or expired');
      }
      attributionMethod = ConversionAttributionMethod.UTM;
    }

    const strategy = this.resolveCapturedStrategy(
      attribution.strategyId,
      attribution.strategyVersion
    );
    const profile = strategy.getConversionProfile();
    if (profile.kind !== 'website_goal') {
      throw new Error('Captured attribution does not support website goals');
    }

    const result = await this._repository.insertEvent(
      input.organizationId,
      attribution.integrationId,
      {
        strategyId: attribution.strategyId,
        strategyVersion: attribution.strategyVersion,
        conversionType: profile.conversionType,
        source: input.source,
        sourceEventId: input.eventId,
        dedupeKey: `${input.source.toLowerCase()}:goal:${input.eventId}`,
        actorExternalId: input.actorExternalId,
        clickAttributionId: attribution.id,
        occurredAt,
        attributionWindowStart: attribution.createdAt,
        attributionWindowEnd: attribution.expiresAt,
        attributionMethod,
        dimensions: {
          goal: input.goal,
          ...(userProperties ? { userProperties } : {}),
        },
        ...(metadata ? { metadata } : {}),
      }
    );

    return {
      created: result.created,
      conversion: this.serializeEvent(result.event),
    };
  }

  async listConversions(
    organizationId: string,
    integrationId: string,
    options: {
      take?: number;
      cursor?: string;
      from?: string;
      to?: string;
      conversionType?: string;
      strategyId?: string;
    } = {}
  ) {
    const range =
      options.from && options.to
        ? parseUtcDateRange(options.from, options.to)
        : undefined;
    const cursor = options.cursor
      ? decodeConversionCursor(options.cursor)
      : undefined;
    const page = await this._repository.listEvents(
      organizationId,
      integrationId,
      {
        take: options.take,
        cursor,
        from: range?.from,
        to: range?.to,
        conversionType: options.conversionType,
        strategyId: options.strategyId,
      }
    );
    return {
      items: page.events.map((event) => this.serializeEvent(event)),
      nextCursor: page.next
        ? encodeConversionCursor(page.next.occurredAt, page.next.id)
        : undefined,
    };
  }

  async summarizeConversions(
    organizationId: string,
    integrationId: string,
    from: string,
    to: string
  ) {
    const range = parseUtcDateRange(from, to);
    const summary = await this._repository.summarizeEvents(
      organizationId,
      integrationId,
      range.from,
      range.to
    );
    return Object.entries(summary).map(([key, value]) => {
      const [day, conversionType] = key.split(':');
      return {
        day,
        conversionType,
        count: value.count,
        value: value.value.toString(),
      };
    });
  }

  async rotateConversionWebhookCredential(
    organizationId: string,
    integrationId: string
  ) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const lastFour = token.slice(-4);
    await this._repository.rotateWebhookCredential(
      organizationId,
      integrationId,
      tokenHash,
      lastFour
    );
    return { token };
  }

  async getConversionWebhookCredentialStatus(
    organizationId: string,
    integrationId: string
  ) {
    const status = await this._repository.getWebhookCredentialStatus(
      organizationId,
      integrationId
    );
    return {
      configured: !!status,
      lastFour: status?.lastFour ?? null,
      createdAt: status?.createdAt?.toISOString() ?? null,
      rotatedAt: status?.rotatedAt?.toISOString() ?? null,
    };
  }

  async verifyConversionWebhookCredential(
    organizationId: string,
    integrationId: string,
    bearerToken: string
  ) {
    if (!bearerToken.length || bearerToken.length > 512) {
      return false;
    }
    const tokenHash = createHash('sha256').update(bearerToken).digest('hex');
    const credential = await this._repository.findWebhookCredentialByTokenHash(
      organizationId,
      integrationId,
      tokenHash
    );
    return !!credential;
  }

  findIntegrationForConversionWebhook(integrationId: string) {
    return this._repository.findIntegrationForWebhook(integrationId);
  }

  async resolveSupportCasePublic(input: {
    organizationId: string;
    integrationId: string;
    caseId?: string;
    externalCaseKey?: string;
    eventId: string;
    resolvedAt?: Date;
    metadata?: Record<string, unknown>;
  }) {
    const metadata = sanitizeBoundedJson(input.metadata, 'metadata');
    const result = await this.resolveSupportCase({
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      caseId: input.caseId,
      externalCaseKey: input.externalCaseKey,
      eventId: input.eventId,
      resolvedAt: input.resolvedAt,
      metadata,
    });
    return {
      created: result.created,
      conversion: result.event ? this.serializeEvent(result.event) : null,
    };
  }

  serializeEvent(event: ConversionEvent) {
    return {
      id: event.id,
      integrationId: event.integrationId,
      strategyId: event.strategyId,
      strategyVersion: event.strategyVersion,
      conversionType: event.conversionType,
      source: event.source,
      sourceEventId: event.sourceEventId,
      actorExternalId: event.actorExternalId,
      occurredAt: event.occurredAt.toISOString(),
      ingestedAt: event.ingestedAt.toISOString(),
      attributionMethod: event.attributionMethod,
      attributionWindowStart: event.attributionWindowStart?.toISOString(),
      attributionWindowEnd: event.attributionWindowEnd?.toISOString(),
      value: event.value?.toString() ?? null,
      dimensions: event.dimensions ?? null,
      metadata: event.metadata ?? null,
    };
  }

  async resolveSupportCase(input: {
    organizationId: string;
    integrationId: string;
    caseId?: string;
    externalCaseKey?: string;
    eventId: string;
    resolvedAt?: Date;
    metadata?: Prisma.InputJsonValue;
  }) {
    this.bounded(input.eventId, 'eventId');
    if (!!input.caseId === !!input.externalCaseKey) {
      throw new Error('Provide exactly one support case reference');
    }
    const supportCase = await this._repository.findSupportCaseByReference(
      input.organizationId,
      input.integrationId,
      { caseId: input.caseId, externalCaseKey: input.externalCaseKey }
    );
    if (!supportCase) return { event: null, created: false };
    const resolvedAt = input.resolvedAt ?? new Date();
    this.assertOccurredAt(resolvedAt, 'resolvedAt');
    if (resolvedAt < supportCase.openedAt) {
      throw new Error('resolvedAt cannot be before the support case opened');
    }
    const strategy = this.resolveCapturedStrategy(
      supportCase.strategyId,
      supportCase.strategyVersion
    );
    const profile = strategy.getConversionProfile();
    if (
      profile.kind !== 'customer_support' ||
      !profile.explicitResolutionEnabled
    ) {
      return { event: null, created: false };
    }
    return this._repository.resolveSupportCaseWithEvent(
      input.organizationId,
      input.integrationId,
      {
        strategyId: supportCase.strategyId,
        strategyVersion: supportCase.strategyVersion,
      },
      {
        caseId: input.caseId,
        externalCaseKey: input.externalCaseKey,
        eventId: input.eventId,
        resolvedAt,
        conversionType: profile.resolutionConversionType,
        resolutionSource: 'explicit',
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }
    );
  }

  private async evaluateFollower(
    job: ConversionEvaluationJob,
    payload: JobPayload,
    profile: FollowerTransitionConversionProfile
  ) {
    const actorExternalId = this.string(payload, 'actorExternalId');
    const fromState = this.string(payload, 'fromState');
    const toState = this.string(payload, 'toState');
    const evidenceKey = this.string(payload, 'evidenceKey');
    if (fromState !== profile.fromState || toState !== profile.toState) {
      return null;
    }
    return this._repository.insertEvent(job.organizationId, job.integrationId, {
      strategyId: job.strategyId,
      strategyVersion: job.strategyVersion,
      conversionType: profile.conversionType,
      source: ConversionSource.DERIVED,
      sourceEventId: evidenceKey,
      dedupeKey: `membership-conversion:${job.id}`,
      actorExternalId,
      occurredAt: job.eventAt,
      dimensions: { fromState, toState },
    });
  }

  private async evaluateAmplification(
    job: ConversionEvaluationJob,
    payload: JobPayload,
    profile: AmplificationConversionProfile
  ) {
    const direction = this.string(payload, 'direction');
    const triggerKind = this.interactionKind(payload);
    if (
      direction !== ChannelInteractionDirection.INBOUND ||
      !profile.acceptedInboundKinds.includes(triggerKind)
    ) {
      return null;
    }
    const actorExternalId = this.string(payload, 'actorExternalId');
    const interactionEventId = this.string(payload, 'interactionEventId');
    const windowStart = new Date(
      job.eventAt.getTime() - profile.windowDays * DAY_MS
    );
    const interactions = await this._repository.getInteractionWindow(
      job.organizationId,
      job.integrationId,
      actorExternalId,
      windowStart,
      job.eventAt
    );
    const kindCounts: Record<string, number> = {};
    const activeDays = new Set<string>();
    let score = 0;
    for (const interaction of interactions) {
      if (interaction.direction !== ChannelInteractionDirection.INBOUND)
        continue;
      const kind = interaction.kind.toLowerCase() as typeof triggerKind;
      if (!profile.acceptedInboundKinds.includes(kind)) continue;
      const weight = profile.inboundKindWeights[kind] ?? 0;
      score += weight;
      kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;
      activeDays.add(interaction.eventAt.toISOString().slice(0, 10));
    }
    const state = {
      score,
      activeUtcDays: activeDays.size,
      windowStart: windowStart.toISOString(),
      windowEnd: job.eventAt.toISOString(),
      kindCounts,
    };
    if (
      score < profile.threshold ||
      activeDays.size < profile.minimumActiveUtcDays
    ) {
      await this._repository.updateDerivationState(
        job.organizationId,
        job.integrationId,
        {
          strategyId: job.strategyId,
          strategyVersion: job.strategyVersion,
          conversionType: profile.conversionType,
          subjectKey: actorExternalId,
        },
        (current) => ({
          lastEventAt:
            !current?.lastEventAt || current.lastEventAt < job.eventAt
              ? job.eventAt
              : current.lastEventAt,
          state,
        })
      );
      return null;
    }
    return this._repository.emitDerivedEventWithCooldown(
      job.organizationId,
      job.integrationId,
      {
        stateKey: {
          strategyId: job.strategyId,
          strategyVersion: job.strategyVersion,
          conversionType: profile.conversionType,
          subjectKey: actorExternalId,
        },
        actorExternalId,
        eventAt: job.eventAt,
        cooldownMs: profile.cooldownDays * DAY_MS,
        state,
        event: {
          strategyId: job.strategyId,
          strategyVersion: job.strategyVersion,
          conversionType: profile.conversionType,
          source: ConversionSource.DERIVED,
          sourceEventId: interactionEventId,
          dedupeKey: `amplification:${job.id}`,
          actorExternalId,
          interactionEventId,
          occurredAt: job.eventAt,
          attributionWindowStart: windowStart,
          attributionWindowEnd: job.eventAt,
          dimensions: state,
        },
      }
    );
  }

  private async evaluateSupportInteraction(
    job: ConversionEvaluationJob,
    payload: JobPayload,
    profile: CustomerSupportConversionProfile
  ) {
    const direction = this.string(payload, 'direction');
    const kind = this.interactionKind(payload);
    const actorExternalId = this.string(payload, 'actorExternalId');
    const interactionEventId = this.string(payload, 'interactionEventId');
    const externalCaseKey = this.supportCaseKey(payload, actorExternalId);
    const snapshot = {
      strategyId: job.strategyId,
      strategyVersion: job.strategyVersion,
    };
    if (
      direction === ChannelInteractionDirection.INBOUND &&
      profile.inboundKinds.includes(kind)
    ) {
      return this._repository.recordSupportInbound(
        job.organizationId,
        job.integrationId,
        snapshot,
        { externalCaseKey, actorExternalId, occurredAt: job.eventAt }
      );
    }
    if (
      direction === ChannelInteractionDirection.OUTBOUND &&
      profile.outboundKinds.includes(kind)
    ) {
      return this._repository.recordSupportOutbound(
        job.organizationId,
        job.integrationId,
        snapshot,
        {
          externalCaseKey,
          interactionEventId,
          actorExternalId,
          occurredAt: job.eventAt,
          slaMs: profile.firstResponseSlaHours * HOUR_MS,
          conversionType: profile.slaConversionType,
          ...(profile.inferredResolutionEnabled &&
          profile.inferredResolutionDelayHours !== null
            ? {
                inferredResolutionDelayMs:
                  profile.inferredResolutionDelayHours * HOUR_MS,
              }
            : {}),
        }
      );
    }
    return null;
  }

  private async evaluateInferredResolution(
    job: ConversionEvaluationJob,
    payload: JobPayload,
    profile: CustomerSupportConversionProfile
  ) {
    if (
      !profile.inferredResolutionEnabled ||
      profile.inferredResolutionDelayHours === null
    ) {
      return null;
    }
    const caseId = this.string(payload, 'supportCaseId');
    const externalCaseKey = this.string(payload, 'externalCaseKey');
    const expected = payload.expectedLastInboundAt;
    const expectedLastInboundAt =
      typeof expected === 'string' ? new Date(expected) : null;
    return this._repository.resolveSupportCaseWithEvent(
      job.organizationId,
      job.integrationId,
      { strategyId: job.strategyId, strategyVersion: job.strategyVersion },
      {
        caseId,
        externalCaseKey,
        eventId: job.id,
        resolvedAt: job.availableAt,
        conversionType: profile.resolutionConversionType,
        resolutionSource: 'inferred',
        expectedLastInboundAt,
      }
    );
  }

  private resolveCapturedStrategy(strategyId: string, version: number) {
    if (!isChannelStrategyId(strategyId)) {
      throw new HistoricalStrategyUnavailableError(
        `Unknown captured strategy ${strategyId}@${version}`
      );
    }
    const strategy = getChannelStrategy(strategyId);
    if (strategy.version !== version) {
      throw new HistoricalStrategyUnavailableError(
        `Unavailable captured strategy version ${strategyId}@${version}`
      );
    }
    return strategy;
  }

  private canonicalDestination(
    url: string,
    profile: WebsiteGoalConversionProfile
  ) {
    const hashIndex = url.indexOf('#');
    const urlWithoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
    try {
      const destination = new URL(urlWithoutHash);
      destination.searchParams.delete(profile.clickIdParameter);
      return destination.toString();
    } catch {
      return null;
    }
  }

  private clickId(
    organizationId: string,
    integrationId: string,
    strategyId: string,
    strategyVersion: number,
    sourcePostItemId: string,
    destination: string
  ) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is required for click attribution');
    }
    return createHmac('sha256', secret)
      .update(
        JSON.stringify([
          organizationId,
          integrationId,
          strategyId,
          strategyVersion,
          sourcePostItemId,
          destination,
        ])
      )
      .digest('base64url');
  }

  private payload(value: Prisma.JsonValue): JobPayload {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new Error('Conversion job payload must be an object');
    }
    return value as JobPayload;
  }

  private string(payload: JobPayload, key: string) {
    const value = payload[key];
    if (typeof value !== 'string') {
      throw new Error(`Conversion job payload is missing ${key}`);
    }
    this.bounded(value, key);
    return value;
  }

  private interactionKind(payload: JobPayload) {
    const value = this.string(payload, 'kind').toLowerCase();
    if (!['like', 'mention', 'repost', 'reply', 'follow'].includes(value)) {
      throw new Error(`Unsupported interaction kind ${value}`);
    }
    return value as 'like' | 'mention' | 'repost' | 'reply' | 'follow';
  }

  private supportCaseKey(payload: JobPayload, actorExternalId: string) {
    const conversation = payload.conversationExternalId;
    if (typeof conversation === 'string' && conversation.length) {
      this.bounded(conversation, 'conversationExternalId');
      return `conversation:${conversation}`;
    }
    return `actor:${actorExternalId}`;
  }

  private bounded(value: string, field: string) {
    if (!value.length || value.length > MAX_EVIDENCE_ID_LENGTH) {
      throw new Error(`${field} must be between 1 and 512 characters`);
    }
  }

  private boundedGoal(value: string) {
    if (!value.length || value.length > MAX_CONVERSION_GOAL_LENGTH) {
      throw new Error(
        `goal must be between 1 and ${MAX_CONVERSION_GOAL_LENGTH} characters`
      );
    }
  }

  private assertOccurredAt(value: Date, field = 'occurredAt') {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`${field} must be a valid timestamp`);
    }
    if (value.getTime() > Date.now() + MAX_CONVERSION_FUTURE_SKEW_MS) {
      throw new Error(`${field} is too far in the future`);
    }
  }
}

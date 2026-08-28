import { Injectable } from '@nestjs/common';
import {
  ConversionAttributionMethod,
  ConversionJobKind,
  ConversionJobStatus,
  ConversionSource,
  Prisma,
} from '@prisma/client';
import { randomUUID, timingSafeEqual } from 'crypto';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

const MAX_JOB_ATTEMPTS = 8;
const MAX_ERROR_LENGTH = 1_000;
const BASE_RETRY_DELAY_MS = 60_000;

export type ConversionEventInput = {
  strategyId: string;
  strategyVersion: number;
  conversionType: string;
  source: ConversionSource;
  sourceEventId?: string;
  dedupeKey: string;
  actorExternalId?: string;
  clickAttributionId?: string;
  interactionEventId?: string;
  supportCaseId?: string;
  occurredAt: Date;
  attributionWindowStart?: Date;
  attributionWindowEnd?: Date;
  attributionMethod?: ConversionAttributionMethod;
  value?: Prisma.Decimal | number | string;
  dimensions?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};

export type ConversionJobInput = {
  strategyId: string;
  strategyVersion: number;
  kind: ConversionJobKind;
  dedupeKey: string;
  payload: Prisma.InputJsonValue;
  eventAt: Date;
  availableAt?: Date;
};

export type ConversionDerivationStateKey = {
  strategyId: string;
  strategyVersion: number;
  conversionType: string;
  subjectKey: string;
};

type StrategySnapshot = {
  strategyId: string;
  strategyVersion: number;
};

export type ConvertedActorCursor = {
  lastConvertedAt: string;
  externalId: string;
};

export type ConvertedActorRow = {
  externalId: string;
  lastConvertedAt: Date;
  conversionCount: number;
  latestConversionType: string;
};

@Injectable()
export class ConversionRepository {
  constructor(
    private _conversion: PrismaRepository<
      | 'conversionEvent'
      | 'conversionClickAttribution'
      | 'conversionEvaluationJob'
      | 'conversionDerivationState'
      | 'conversionSupportCase'
      | 'conversionWebhookCredential'
      | 'channelInteractionEvent'
    >,
    private _integration: PrismaRepository<'integration'>,
    private _transaction: PrismaTransaction
  ) {}

  findOwnedIntegration(organizationId: string, integrationId: string) {
    return this._integration.model.integration.findFirst({
      where: { id: integrationId, organizationId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        strategyId: true,
        strategyVersion: true,
        type: true,
        disabled: true,
      },
    });
  }

  async insertEvent(
    organizationId: string,
    integrationId: string,
    input: ConversionEventInput
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      try {
        const event = await tx.conversionEvent.create({
          data: { organizationId, integrationId, ...input },
        });
        return { event, created: true };
      } catch (error) {
        if (!isUniqueError(error)) throw error;
        const event = await tx.conversionEvent.findFirst({
          where: { organizationId, integrationId, dedupeKey: input.dedupeKey },
        });
        if (!event) throw error;
        return { event, created: false };
      }
    });
  }

  async listEvents(
    organizationId: string,
    integrationId: string,
    options: {
      take?: number;
      cursor?: { occurredAt: Date; id: string };
      from?: Date;
      to?: Date;
      conversionType?: string;
      strategyId?: string;
    } = {}
  ) {
    await this.assertOwnedIntegration(
      this._conversion.model as Prisma.TransactionClient,
      organizationId,
      integrationId
    );
    const take = Math.min(Math.max(options.take ?? 50, 1), 100);
    const events = await this._conversion.model.conversionEvent.findMany({
      where: {
        organizationId,
        integrationId,
        occurredAt: {
          ...(options.from ? { gte: options.from } : {}),
          ...(options.to ? { lt: options.to } : {}),
        },
        ...(options.conversionType
          ? { conversionType: options.conversionType }
          : {}),
        ...(options.strategyId ? { strategyId: options.strategyId } : {}),
        ...(options.cursor
          ? {
              OR: [
                { occurredAt: { lt: options.cursor.occurredAt } },
                {
                  occurredAt: options.cursor.occurredAt,
                  id: { lt: options.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    return {
      events: events.slice(0, take),
      next:
        events.length > take
          ? {
              occurredAt: events[take - 1].occurredAt,
              id: events[take - 1].id,
            }
          : undefined,
    };
  }

  async countDistinctConvertedActorsWithProfiles(
    organizationId: string,
    integrationId: string,
    actorExternalIds?: string[]
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const groups = await tx.conversionEvent.groupBy({
        by: ['actorExternalId'],
        where: {
          organizationId,
          integrationId,
          actorExternalId: {
            not: null,
            ...(actorExternalIds?.length ? { in: actorExternalIds } : {}),
          },
        },
      });
      const ids = groups
        .map((group) => group.actorExternalId)
        .filter((value): value is string => !!value);
      if (!ids.length) {
        return 0;
      }
      return tx.channelAudienceMember.count({
        where: {
          organizationId,
          integrationId,
          externalId: { in: ids },
        },
      });
    });
  }

  async getConvertedActorsPage(
    organizationId: string,
    integrationId: string,
    options: {
      limit: number;
      cursor?: ConvertedActorCursor;
      actorExternalIds?: string[];
    }
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const limit = Math.min(Math.max(options.limit, 1), 100);
      const overfetch = Math.min(limit * 5, 500);
      const cursorDate = options.cursor
        ? new Date(options.cursor.lastConvertedAt)
        : undefined;
      const groups = await tx.conversionEvent.groupBy({
        by: ['actorExternalId'],
        where: {
          organizationId,
          integrationId,
          actorExternalId: {
            not: null,
            ...(options.actorExternalIds?.length
              ? { in: options.actorExternalIds }
              : {}),
          },
        },
        _max: { occurredAt: true },
        _count: { _all: true },
        orderBy: [{ _max: { occurredAt: 'desc' } }, { actorExternalId: 'asc' }],
        ...(options.cursor && cursorDate && !Number.isNaN(cursorDate.getTime())
          ? {
              having: {
                OR: [
                  {
                    occurredAt: {
                      _max: {
                        lt: cursorDate,
                      },
                    },
                  },
                  {
                    AND: [
                      {
                        occurredAt: {
                          _max: {
                            equals: cursorDate,
                          },
                        },
                      },
                      {
                        actorExternalId: {
                          gt: options.cursor!.externalId,
                        },
                      },
                    ],
                  },
                ],
              },
            }
          : {}),
        take: overfetch,
      });

      if (!groups.length) {
        return { items: [] as ConvertedActorRow[], hasMore: false };
      }

      const candidateIds = groups
        .map((group) => group.actorExternalId)
        .filter((value): value is string => !!value);
      const members = await tx.channelAudienceMember.findMany({
        where: {
          organizationId,
          integrationId,
          externalId: { in: candidateIds },
        },
        select: { externalId: true },
      });
      const memberIds = new Set(members.map((member) => member.externalId));
      const filteredGroups = groups.filter(
        (group) => group.actorExternalId && memberIds.has(group.actorExternalId)
      );
      const pageGroups = filteredGroups.slice(0, limit + 1);
      const hasMore = pageGroups.length > limit;
      const selectedGroups = pageGroups.slice(0, limit);

      const latestEvents = selectedGroups.length
        ? await tx.conversionEvent.findMany({
            where: {
              organizationId,
              integrationId,
              OR: selectedGroups.map((group) => ({
                actorExternalId: group.actorExternalId!,
                occurredAt: group._max.occurredAt!,
              })),
            },
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
            select: {
              actorExternalId: true,
              occurredAt: true,
              conversionType: true,
              id: true,
            },
          })
        : [];

      const latestTypeByActor = new Map<string, string>();
      for (const event of latestEvents) {
        if (
          !event.actorExternalId ||
          latestTypeByActor.has(event.actorExternalId)
        ) {
          continue;
        }
        latestTypeByActor.set(event.actorExternalId, event.conversionType);
      }

      const items: ConvertedActorRow[] = selectedGroups.map((group) => ({
        externalId: group.actorExternalId!,
        lastConvertedAt: group._max.occurredAt!,
        conversionCount: group._count._all,
        latestConversionType:
          latestTypeByActor.get(group.actorExternalId!) ?? 'unknown',
      }));

      return {
        items,
        hasMore: hasMore || filteredGroups.length > limit,
      };
    });
  }

  async summarizeEvents(
    organizationId: string,
    integrationId: string,
    from: Date,
    to: Date
  ) {
    await this.assertOwnedIntegration(
      this._conversion.model as Prisma.TransactionClient,
      organizationId,
      integrationId
    );
    const events = await this._conversion.model.conversionEvent.findMany({
      where: {
        organizationId,
        integrationId,
        occurredAt: { gte: from, lt: to },
      },
      select: { conversionType: true, occurredAt: true, value: true },
    });
    return events.reduce<
      Record<string, { count: number; value: Prisma.Decimal }>
    >((summary, event) => {
      const day = event.occurredAt.toISOString().slice(0, 10);
      const key = `${day}:${event.conversionType}`;
      const current = summary[key] || {
        count: 0,
        value: new Prisma.Decimal(0),
      };
      current.count++;
      current.value = current.value.plus(event.value || 0);
      summary[key] = current;
      return summary;
    }, {});
  }

  async upsertClickAttribution(
    organizationId: string,
    integrationId: string,
    input: {
      clickId: string;
      sourcePostItemId: string;
      destinationHash: string;
      strategyId: string;
      strategyVersion: number;
      utmFingerprint?: string;
      utmSnapshot?: string;
      expiresAt: Date;
    }
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const existing = await tx.conversionClickAttribution.findFirst({
        where: { organizationId, integrationId, clickId: input.clickId },
      });
      if (existing) {
        this.assertMatchingClickAttribution(existing, input);
        return { attribution: existing, created: false };
      }
      try {
        const attribution = await tx.conversionClickAttribution.create({
          data: { organizationId, integrationId, ...input },
        });
        return { attribution, created: true };
      } catch (error) {
        if (!isUniqueError(error)) throw error;
        const attribution = await tx.conversionClickAttribution.findFirst({
          where: { organizationId, integrationId, clickId: input.clickId },
        });
        if (!attribution) throw error;
        this.assertMatchingClickAttribution(attribution, input);
        return { attribution, created: false };
      }
    });
  }

  async findActiveClickAttribution(
    organizationId: string,
    integrationId: string,
    clickId: string,
    now = new Date()
  ) {
    await this.assertOwnedIntegration(
      this._conversion.model as Prisma.TransactionClient,
      organizationId,
      integrationId
    );
    return this._conversion.model.conversionClickAttribution.findFirst({
      where: { organizationId, integrationId, clickId, expiresAt: { gt: now } },
    });
  }

  findActiveClickAttributionByClickId(
    organizationId: string,
    clickId: string,
    now = new Date()
  ) {
    return this._conversion.model.conversionClickAttribution.findFirst({
      where: { organizationId, clickId, expiresAt: { gt: now } },
    });
  }

  async findActiveClickAttributionByUtmFingerprint(
    organizationId: string,
    integrationId: string,
    utmFingerprint: string,
    now = new Date()
  ) {
    await this.assertOwnedIntegration(
      this._conversion.model as Prisma.TransactionClient,
      organizationId,
      integrationId
    );
    return this._conversion.model.conversionClickAttribution.findFirst({
      where: {
        organizationId,
        integrationId,
        utmFingerprint,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findIntegrationForWebhook(integrationId: string) {
    return this._integration.model.integration.findFirst({
      where: { id: integrationId, deletedAt: null },
      select: { id: true, organizationId: true },
    });
  }

  async cleanupExpiredClickAttributions(now = new Date()) {
    return this._conversion.model.conversionClickAttribution.deleteMany({
      where: { expiresAt: { lte: now }, conversionEvents: { none: {} } },
    });
  }

  async enqueueJob(
    organizationId: string,
    integrationId: string,
    input: ConversionJobInput
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      try {
        const job = await tx.conversionEvaluationJob.create({
          data: {
            organizationId,
            integrationId,
            ...input,
            availableAt: input.availableAt || input.eventAt,
          },
        });
        return { job, created: true };
      } catch (error) {
        if (!isUniqueError(error)) throw error;
        const job = await tx.conversionEvaluationJob.findFirst({
          where: { organizationId, integrationId, dedupeKey: input.dedupeKey },
        });
        if (!job) throw error;
        return { job, created: false };
      }
    });
  }

  async claimDueJob(
    organizationId: string,
    now = new Date(),
    leaseMs = 5 * 60 * 1000
  ) {
    return this.inTransaction(async (tx) => {
      const staleBefore = new Date(now.getTime() - leaseMs);
      const job = await tx.conversionEvaluationJob.findFirst({
        where: {
          organizationId,
          OR: [
            { status: ConversionJobStatus.PENDING, availableAt: { lte: now } },
            {
              status: ConversionJobStatus.PROCESSING,
              claimedAt: { lte: staleBefore },
            },
          ],
          integration: { organizationId, deletedAt: null },
        },
        orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
      });
      if (!job) return null;
      const claimToken = randomUUID();
      const claimed = await tx.conversionEvaluationJob.updateMany({
        where: {
          id: job.id,
          organizationId,
          OR: [
            { status: ConversionJobStatus.PENDING, availableAt: { lte: now } },
            {
              status: ConversionJobStatus.PROCESSING,
              claimedAt: { lte: staleBefore },
            },
          ],
        },
        data: {
          status: ConversionJobStatus.PROCESSING,
          claimedAt: now,
          claimToken,
        },
      });
      if (!claimed.count) return null;
      return tx.conversionEvaluationJob.findFirst({
        where: { id: job.id, organizationId, claimToken },
      });
    });
  }

  async claimDueJobsBatch(
    limit: number,
    now = new Date(),
    leaseMs = 5 * 60 * 1000
  ) {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    const claimedJobs = [];
    for (let index = 0; index < boundedLimit; index++) {
      const claimed = await this.inTransaction(async (tx) => {
        const staleBefore = new Date(now.getTime() - leaseMs);
        const job = await tx.conversionEvaluationJob.findFirst({
          where: {
            OR: [
              {
                status: ConversionJobStatus.PENDING,
                availableAt: { lte: now },
              },
              {
                status: ConversionJobStatus.PROCESSING,
                claimedAt: { lte: staleBefore },
              },
            ],
            integration: { deletedAt: null },
          },
          orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
        });
        if (!job) return null;
        const claimToken = randomUUID();
        const claimed = await tx.conversionEvaluationJob.updateMany({
          where: {
            id: job.id,
            OR: [
              {
                status: ConversionJobStatus.PENDING,
                availableAt: { lte: now },
              },
              {
                status: ConversionJobStatus.PROCESSING,
                claimedAt: { lte: staleBefore },
              },
            ],
          },
          data: {
            status: ConversionJobStatus.PROCESSING,
            claimedAt: now,
            claimToken,
          },
        });
        if (!claimed.count) return null;
        return { jobId: job.id, claimToken };
      });
      if (!claimed) break;
      claimedJobs.push(claimed);
    }
    return claimedJobs;
  }

  getClaimedJob(jobId: string, claimToken: string) {
    return this._conversion.model.conversionEvaluationJob.findFirst({
      where: {
        id: jobId,
        claimToken,
        status: ConversionJobStatus.PROCESSING,
        integration: { deletedAt: null },
      },
    });
  }

  reclaimStaleProcessingJobs(now = new Date(), leaseMs = 5 * 60 * 1000) {
    return this._conversion.model.conversionEvaluationJob.updateMany({
      where: {
        status: ConversionJobStatus.PROCESSING,
        claimedAt: { lte: new Date(now.getTime() - leaseMs) },
      },
      data: {
        status: ConversionJobStatus.PENDING,
        claimedAt: null,
        claimToken: null,
      },
    });
  }

  completeJob(
    organizationId: string,
    jobId: string,
    claimToken: string,
    completedAt = new Date()
  ) {
    return this._conversion.model.conversionEvaluationJob.updateMany({
      where: {
        id: jobId,
        organizationId,
        claimToken,
        status: ConversionJobStatus.PROCESSING,
      },
      data: {
        status: ConversionJobStatus.COMPLETE,
        completedAt,
        claimToken: null,
        claimedAt: null,
        lastError: null,
      },
    });
  }

  async retryOrFailJob(
    organizationId: string,
    jobId: string,
    claimToken: string,
    error: unknown,
    now = new Date(),
    maximumAttempts = MAX_JOB_ATTEMPTS
  ) {
    return this.inTransaction(async (tx) => {
      const job = await tx.conversionEvaluationJob.findFirst({
        where: {
          id: jobId,
          organizationId,
          claimToken,
          status: ConversionJobStatus.PROCESSING,
        },
      });
      if (!job) return { updated: false, terminal: false };
      const attempts = job.attempts + 1;
      const lastError = truncateError(error);
      const terminal = attempts >= maximumAttempts;
      const availableAt = new Date(
        now.getTime() +
          BASE_RETRY_DELAY_MS * Math.pow(2, Math.min(attempts - 1, 10))
      );
      await tx.conversionEvaluationJob.update({
        where: { id: job.id },
        data: {
          attempts,
          lastError,
          status: terminal
            ? ConversionJobStatus.FAILED
            : ConversionJobStatus.PENDING,
          availableAt,
          claimToken: null,
          claimedAt: null,
          ...(terminal ? { completedAt: now } : {}),
        },
      });
      return { updated: true, terminal };
    });
  }

  cleanupCompletedJobs(before: Date) {
    return this._conversion.model.conversionEvaluationJob.deleteMany({
      where: {
        status: ConversionJobStatus.COMPLETE,
        completedAt: { lt: before },
      },
    });
  }

  async getInteractionWindow(
    organizationId: string,
    integrationId: string,
    actorExternalId: string,
    from: Date,
    to: Date
  ) {
    await this.assertOwnedIntegration(
      this._conversion.model as Prisma.TransactionClient,
      organizationId,
      integrationId
    );
    return this._conversion.model.channelInteractionEvent.findMany({
      where: {
        organizationId,
        integrationId,
        counterpartyExternalId: actorExternalId,
        eventAt: { gte: from, lte: to },
      },
      orderBy: [{ eventAt: 'asc' }, { id: 'asc' }],
    });
  }

  async upsertSupportCase(
    organizationId: string,
    integrationId: string,
    input: {
      externalCaseKey: string;
      strategyId: string;
      strategyVersion: number;
      actorExternalId?: string;
      openedAt: Date;
      lastInboundAt?: Date;
      metadata?: Prisma.InputJsonValue;
    }
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      return tx.conversionSupportCase.upsert({
        where: {
          integrationId_externalCaseKey: {
            integrationId,
            externalCaseKey: input.externalCaseKey,
          },
        },
        create: { organizationId, integrationId, ...input },
        update: {
          actorExternalId: input.actorExternalId,
          lastInboundAt: input.lastInboundAt,
          metadata: input.metadata,
          resolvedAt: null,
          resolutionSource: null,
        },
      });
    });
  }

  async findSupportCase(
    organizationId: string,
    integrationId: string,
    externalCaseKey: string
  ) {
    await this.assertOwnedIntegration(
      this._conversion.model as Prisma.TransactionClient,
      organizationId,
      integrationId
    );
    return this._conversion.model.conversionSupportCase.findFirst({
      where: { organizationId, integrationId, externalCaseKey },
    });
  }

  async findSupportCaseByReference(
    organizationId: string,
    integrationId: string,
    reference: { caseId?: string; externalCaseKey?: string }
  ) {
    await this.assertOwnedIntegration(
      this._conversion.model as Prisma.TransactionClient,
      organizationId,
      integrationId
    );
    return this._conversion.model.conversionSupportCase.findFirst({
      where: {
        organizationId,
        integrationId,
        ...(reference.caseId ? { id: reference.caseId } : {}),
        ...(reference.externalCaseKey
          ? { externalCaseKey: reference.externalCaseKey }
          : {}),
      },
    });
  }

  async recordFirstOutbound(
    organizationId: string,
    integrationId: string,
    externalCaseKey: string,
    occurredAt: Date
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      return tx.conversionSupportCase.updateMany({
        where: {
          organizationId,
          integrationId,
          externalCaseKey,
          firstOutboundAt: null,
          resolvedAt: null,
        },
        data: { firstOutboundAt: occurredAt },
      });
    });
  }

  async resolveSupportCase(
    organizationId: string,
    integrationId: string,
    externalCaseKey: string,
    resolvedAt: Date,
    resolutionSource: string
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      return tx.conversionSupportCase.updateMany({
        where: {
          organizationId,
          integrationId,
          externalCaseKey,
          resolvedAt: null,
        },
        data: { resolvedAt, resolutionSource },
      });
    });
  }

  async updateDerivationState(
    organizationId: string,
    integrationId: string,
    key: ConversionDerivationStateKey,
    update: (
      state: {
        lastEmittedAt: Date | null;
        lastEventAt: Date | null;
        state: Prisma.JsonValue | null;
      } | null
    ) => {
      lastEmittedAt?: Date | null;
      lastEventAt?: Date | null;
      state?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    }
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const where = {
        integrationId_strategyId_strategyVersion_conversionType_subjectKey: {
          integrationId,
          ...key,
        },
      };
      const current = await tx.conversionDerivationState.findUnique({ where });
      const next = update(current);
      return tx.conversionDerivationState.upsert({
        where,
        create: { organizationId, integrationId, ...key, ...next },
        update: next,
      });
    });
  }

  async emitDerivedEventWithCooldown(
    organizationId: string,
    integrationId: string,
    input: {
      stateKey: ConversionDerivationStateKey;
      actorExternalId: string;
      eventAt: Date;
      cooldownMs: number;
      state: Prisma.InputJsonValue;
      event: ConversionEventInput;
    }
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const where = {
        integrationId_strategyId_strategyVersion_conversionType_subjectKey: {
          integrationId,
          ...input.stateKey,
        },
      };
      const current = await tx.conversionDerivationState.findUnique({ where });
      const latestEventAt =
        !current?.lastEventAt || current.lastEventAt < input.eventAt
          ? input.eventAt
          : current.lastEventAt;
      const insideCooldown =
        !!current?.lastEmittedAt &&
        input.eventAt.getTime() <
          current.lastEmittedAt.getTime() + input.cooldownMs;
      if (insideCooldown) {
        await tx.conversionDerivationState.upsert({
          where,
          create: {
            organizationId,
            integrationId,
            ...input.stateKey,
            lastEventAt: latestEventAt,
            state: input.state,
          },
          update: { lastEventAt: latestEventAt, state: input.state },
        });
        return { emitted: false as const, event: null };
      }
      const result = await this.insertEventInTransaction(
        tx,
        organizationId,
        integrationId,
        input.event
      );
      await tx.conversionDerivationState.upsert({
        where,
        create: {
          organizationId,
          integrationId,
          ...input.stateKey,
          lastEmittedAt: input.eventAt,
          lastEventAt: latestEventAt,
          state: input.state,
        },
        update: {
          lastEmittedAt:
            !current?.lastEmittedAt || current.lastEmittedAt < input.eventAt
              ? input.eventAt
              : current.lastEmittedAt,
          lastEventAt: latestEventAt,
          state: input.state,
        },
      });
      return { emitted: true as const, event: result.event };
    });
  }

  async recordSupportInbound(
    organizationId: string,
    integrationId: string,
    snapshot: StrategySnapshot,
    input: {
      externalCaseKey: string;
      actorExternalId: string;
      occurredAt: Date;
    }
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const existing = await tx.conversionSupportCase.findFirst({
        where: {
          organizationId,
          integrationId,
          externalCaseKey: input.externalCaseKey,
        },
      });
      if (
        existing &&
        (existing.strategyId !== snapshot.strategyId ||
          existing.strategyVersion !== snapshot.strategyVersion)
      ) {
        return { supportCase: existing, changed: false };
      }
      if (!existing) {
        const supportCase = await tx.conversionSupportCase.create({
          data: {
            organizationId,
            integrationId,
            externalCaseKey: input.externalCaseKey,
            ...snapshot,
            actorExternalId: input.actorExternalId,
            openedAt: input.occurredAt,
            lastInboundAt: input.occurredAt,
          },
        });
        return { supportCase, changed: true };
      }
      if (existing.resolvedAt && input.occurredAt > existing.resolvedAt) {
        const supportCase = await tx.conversionSupportCase.update({
          where: { id: existing.id },
          data: {
            actorExternalId: input.actorExternalId,
            openedAt: input.occurredAt,
            lastInboundAt: input.occurredAt,
            firstOutboundAt: null,
            resolvedAt: null,
            resolutionSource: null,
          },
        });
        return { supportCase, changed: true };
      }
      if (
        !existing.lastInboundAt ||
        input.occurredAt > existing.lastInboundAt
      ) {
        const supportCase = await tx.conversionSupportCase.update({
          where: { id: existing.id },
          data: {
            actorExternalId: input.actorExternalId,
            lastInboundAt: input.occurredAt,
          },
        });
        return { supportCase, changed: true };
      }
      return { supportCase: existing, changed: false };
    });
  }

  async recordSupportOutbound(
    organizationId: string,
    integrationId: string,
    snapshot: StrategySnapshot,
    input: {
      externalCaseKey: string;
      interactionEventId: string;
      actorExternalId: string;
      occurredAt: Date;
      slaMs: number;
      conversionType: string;
      inferredResolutionDelayMs?: number;
    }
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const supportCase = await tx.conversionSupportCase.findFirst({
        where: {
          organizationId,
          integrationId,
          externalCaseKey: input.externalCaseKey,
          ...snapshot,
          resolvedAt: null,
          firstOutboundAt: null,
          openedAt: { lte: input.occurredAt },
        },
      });
      if (!supportCase) {
        return { supportCase: null, event: null };
      }
      const updated = await tx.conversionSupportCase.updateMany({
        where: {
          id: supportCase.id,
          resolvedAt: null,
          firstOutboundAt: null,
        },
        data: { firstOutboundAt: input.occurredAt },
      });
      if (!updated.count) {
        return { supportCase, event: null };
      }
      const responseDurationMs =
        input.occurredAt.getTime() - supportCase.openedAt.getTime();
      let event = null;
      if (responseDurationMs <= input.slaMs) {
        event = (
          await this.insertEventInTransaction(
            tx,
            organizationId,
            integrationId,
            {
              ...snapshot,
              conversionType: input.conversionType,
              source: ConversionSource.DERIVED,
              sourceEventId: input.interactionEventId,
              dedupeKey: `support-sla:${supportCase.id}`,
              actorExternalId: input.actorExternalId,
              interactionEventId: input.interactionEventId,
              supportCaseId: supportCase.id,
              occurredAt: input.occurredAt,
              dimensions: {
                responseDurationMs,
                targetDurationMs: input.slaMs,
              },
            }
          )
        ).event;
      }
      if (input.inferredResolutionDelayMs !== undefined) {
        const availableAt = new Date(
          input.occurredAt.getTime() + input.inferredResolutionDelayMs
        );
        await tx.conversionEvaluationJob.createMany({
          data: [
            {
              organizationId,
              integrationId,
              ...snapshot,
              kind: ConversionJobKind.INFERRED_RESOLUTION,
              dedupeKey: `inferred-resolution:${supportCase.id}:${input.interactionEventId}`,
              payload: {
                supportCaseId: supportCase.id,
                externalCaseKey: supportCase.externalCaseKey,
                expectedLastInboundAt:
                  supportCase.lastInboundAt?.toISOString() ?? null,
              },
              eventAt: input.occurredAt,
              availableAt,
            },
          ],
          skipDuplicates: true,
        });
      }
      return {
        supportCase: { ...supportCase, firstOutboundAt: input.occurredAt },
        event,
      };
    });
  }

  async resolveSupportCaseWithEvent(
    organizationId: string,
    integrationId: string,
    snapshot: StrategySnapshot,
    input: {
      caseId?: string;
      externalCaseKey?: string;
      eventId: string;
      resolvedAt: Date;
      conversionType: string;
      resolutionSource: 'explicit' | 'inferred';
      expectedLastInboundAt?: Date | null;
      metadata?: Prisma.InputJsonValue;
    }
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const dedupeKey = `support-resolution:${input.eventId}`;
      const replay = await tx.conversionEvent.findFirst({
        where: { organizationId, integrationId, dedupeKey },
      });
      if (replay) return { event: replay, created: false };
      const supportCase = await tx.conversionSupportCase.findFirst({
        where: {
          organizationId,
          integrationId,
          ...snapshot,
          ...(input.caseId ? { id: input.caseId } : {}),
          ...(input.externalCaseKey
            ? { externalCaseKey: input.externalCaseKey }
            : {}),
        },
      });
      if (!supportCase || supportCase.resolvedAt) {
        return { event: null, created: false };
      }
      if (
        input.resolutionSource === 'inferred' &&
        (supportCase.lastInboundAt?.getTime() ?? null) !==
          (input.expectedLastInboundAt?.getTime() ?? null)
      ) {
        return { event: null, created: false };
      }
      const transitioned = await tx.conversionSupportCase.updateMany({
        where: {
          id: supportCase.id,
          resolvedAt: null,
          ...(input.resolutionSource === 'inferred'
            ? { lastInboundAt: input.expectedLastInboundAt }
            : {}),
        },
        data: {
          resolvedAt: input.resolvedAt,
          resolutionSource: input.resolutionSource,
        },
      });
      if (!transitioned.count) return { event: null, created: false };
      return this.insertEventInTransaction(tx, organizationId, integrationId, {
        ...snapshot,
        conversionType: input.conversionType,
        source: ConversionSource.DERIVED,
        sourceEventId: input.eventId,
        dedupeKey,
        actorExternalId: supportCase.actorExternalId ?? undefined,
        supportCaseId: supportCase.id,
        occurredAt: input.resolvedAt,
        dimensions: { resolutionSource: input.resolutionSource },
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
    });
  }

  async rotateWebhookCredential(
    organizationId: string,
    integrationId: string,
    tokenHash: string,
    lastFour: string,
    rotatedAt = new Date()
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      return tx.conversionWebhookCredential.upsert({
        where: { integrationId },
        create: {
          organizationId,
          integrationId,
          tokenHash,
          lastFour,
          rotatedAt,
        },
        update: { tokenHash, lastFour, rotatedAt },
      });
    });
  }

  async getWebhookCredentialStatus(
    organizationId: string,
    integrationId: string
  ) {
    await this.assertOwnedIntegration(
      this._conversion.model as Prisma.TransactionClient,
      organizationId,
      integrationId
    );
    return this._conversion.model.conversionWebhookCredential.findFirst({
      where: { organizationId, integrationId },
      select: { lastFour: true, createdAt: true, rotatedAt: true },
    });
  }

  async findWebhookCredentialByTokenHash(
    organizationId: string,
    integrationId: string,
    tokenHash: string
  ) {
    await this.assertOwnedIntegration(
      this._conversion.model as Prisma.TransactionClient,
      organizationId,
      integrationId
    );
    const credential =
      await this._conversion.model.conversionWebhookCredential.findFirst({
        where: { organizationId, integrationId },
      });
    const storedHash = credential?.tokenHash || '0'.repeat(tokenHash.length);
    const matched =
      storedHash.length === tokenHash.length &&
      timingSafeEqual(Buffer.from(storedHash), Buffer.from(tokenHash));
    return matched ? credential : null;
  }

  private async insertEventInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string,
    input: ConversionEventInput
  ) {
    try {
      const event = await tx.conversionEvent.create({
        data: { organizationId, integrationId, ...input },
      });
      return { event, created: true };
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      const event = await tx.conversionEvent.findFirst({
        where: { organizationId, integrationId, dedupeKey: input.dedupeKey },
      });
      if (!event) throw error;
      return { event, created: false };
    }
  }

  private async assertOwnedIntegration(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string
  ) {
    const integration = await tx.integration.findFirst({
      where: { id: integrationId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!integration) {
      throw new Error('Channel integration does not belong to organization');
    }
  }

  private assertMatchingClickAttribution(
    attribution: {
      sourcePostItemId: string;
      destinationHash: string;
      strategyId: string;
      strategyVersion: number;
      utmFingerprint: string | null;
      utmSnapshot: string | null;
    },
    input: {
      sourcePostItemId: string;
      destinationHash: string;
      strategyId: string;
      strategyVersion: number;
      utmFingerprint?: string;
      utmSnapshot?: string;
    }
  ) {
    if (
      attribution.sourcePostItemId !== input.sourcePostItemId ||
      attribution.destinationHash !== input.destinationHash ||
      attribution.strategyId !== input.strategyId ||
      attribution.strategyVersion !== input.strategyVersion ||
      attribution.utmFingerprint !== (input.utmFingerprint ?? null) ||
      attribution.utmSnapshot !== (input.utmSnapshot ?? null)
    ) {
      throw new Error('Click attribution token maps to a different tuple');
    }
  }

  private inTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>
  ) {
    return (this._transaction.model as any).$transaction(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }) as Promise<T>;
  }
}

const isUniqueError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === 'P2002'
    : (error as { code?: string })?.code === 'P2002';

const truncateError = (error: unknown) =>
  String(error instanceof Error ? error.message : error).slice(
    0,
    MAX_ERROR_LENGTH
  );

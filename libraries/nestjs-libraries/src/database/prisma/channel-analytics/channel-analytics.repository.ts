import { Injectable } from '@nestjs/common';
import {
  ChannelAnalyticsDisplayUnit,
  ChannelAnalyticsValueMode,
  Prisma,
} from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

export type AnalyticsMetricInput = {
  metricKey: string;
  label: string;
  valueMode: ChannelAnalyticsValueMode;
  displayUnit?: ChannelAnalyticsDisplayUnit | null;
  value: number;
};

export type AnalyticsDailyPointInput = AnalyticsMetricInput & { day: Date };
export type AnalyticsPostMetricInput = AnalyticsMetricInput & {
  externalPostId: string;
};

@Injectable()
export class ChannelAnalyticsRepository {
  constructor(
    private _analytics: PrismaRepository<
      | 'channelAnalyticsDailyPoint'
      | 'channelAnalyticsPostMetricSnapshot'
      | 'channelAnalyticsSyncState'
      | 'post'
    >,
    private _integration: PrismaRepository<'integration'>,
    private _transaction: PrismaTransaction
  ) {}

  async listDueCandidates(
    providerIdentifiers: string[],
    snapshotAt: Date,
    after?: string,
    take = 50
  ) {
    if (!providerIdentifiers.length) return { candidates: [], next: undefined };
    const rows = await this._integration.model.integration.findMany({
      where: {
        type: 'social',
        disabled: false,
        deletedAt: null,
        providerIdentifier: { in: providerIdentifiers },
        ...(after ? { id: { gt: after } } : {}),
        OR: [
          { channelAnalyticsSyncState: { is: null } },
          {
            channelAnalyticsSyncState: {
              is: { nextAttemptAt: { lte: snapshotAt } },
            },
          },
        ],
      },
      orderBy: [
        { channelAnalyticsSyncState: { nextAttemptAt: 'asc' } },
        { id: 'asc' },
      ],
      take: take + 1,
      select: { id: true, organizationId: true, providerIdentifier: true },
    });
    return {
      candidates: rows.slice(0, take),
      next: rows.length > take ? rows[take - 1]?.id : undefined,
    };
  }

  async persistDailyPage(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    points: AnalyticsDailyPointInput[],
    coverage: { fromDay: Date; toDay: Date }
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      for (const point of points) {
        await tx.channelAnalyticsDailyPoint.upsert({
          where: {
            integrationId_day_metricKey: {
              integrationId,
              day: point.day,
              metricKey: point.metricKey,
            },
          },
          create: {
            organizationId,
            integrationId,
            ...point,
            currentSnapshotAt: null,
            previousSnapshotAt: null,
          },
          update: {
            label: point.label,
            valueMode: point.valueMode,
            displayUnit: point.displayUnit,
            value: point.value,
            currentSnapshotAt: null,
            previousSnapshotAt: null,
          },
        });
      }
      await this.upsertPendingCoverage(
        tx,
        organizationId,
        integrationId,
        snapshotAt,
        coverage
      );
      return { persisted: points.length };
    });
  }

  async persistPostLifetimePage(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    points: AnalyticsPostMetricInput[]
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      for (const point of points) {
        await tx.channelAnalyticsPostMetricSnapshot.upsert({
          where: {
            integrationId_snapshotAt_externalPostId_metricKey: {
              integrationId,
              snapshotAt,
              externalPostId: point.externalPostId,
              metricKey: point.metricKey,
            },
          },
          create: { organizationId, integrationId, snapshotAt, ...point },
          update: {
            label: point.label,
            valueMode: point.valueMode,
            displayUnit: point.displayUnit,
            value: point.value,
          },
        });

        if (point.metricKey === 'like_count') {
          await tx.post.updateMany({
            where: {
              organizationId,
              integrationId,
              releaseId: point.externalPostId,
              deletedAt: null,
              state: 'PUBLISHED',
            },
            data: {
              likesCount: Math.max(0, Math.trunc(Number(point.value))),
              likesSyncedAt: snapshotAt,
            },
          });
        }
      }
      return { persisted: points.length };
    });
  }

  /**
   * Upsert account-level daily points (e.g. follower totals) without touching
   * pending coverage. Used by post_lifetime captures that sidecar totals.
   */
  async persistAccountDailyPoints(
    organizationId: string,
    integrationId: string,
    points: AnalyticsDailyPointInput[]
  ) {
    if (!points.length) {
      return { persisted: 0 };
    }
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      for (const point of points) {
        await tx.channelAnalyticsDailyPoint.upsert({
          where: {
            integrationId_day_metricKey: {
              integrationId,
              day: point.day,
              metricKey: point.metricKey,
            },
          },
          create: {
            organizationId,
            integrationId,
            ...point,
            currentSnapshotAt: null,
            previousSnapshotAt: null,
          },
          update: {
            label: point.label,
            valueMode: point.valueMode,
            displayUnit: point.displayUnit,
            value: point.value,
            currentSnapshotAt: null,
            previousSnapshotAt: null,
          },
        });
      }
      return { persisted: points.length };
    });
  }

  async finalizeDailyCapture(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    coveredDay?: Date
  ) {
    return this.markSuccessful(
      organizationId,
      integrationId,
      snapshotAt,
      coveredDay
    );
  }

  async finalizePostLifetimeCapture(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const state = await tx.channelAnalyticsSyncState.findUnique({
        where: { integrationId },
      });
      if (state?.lastSuccessfulSnapshotAt?.getTime() === snapshotAt.getTime()) {
        return { finalized: false, derived: 0 };
      }
      const previousSnapshotAt = state?.lastSuccessfulSnapshotAt;
      let hasDerivedDailyPoints = false;
      if (previousSnapshotAt) {
        const [current, previous] = await Promise.all([
          tx.channelAnalyticsPostMetricSnapshot.findMany({
            where: { organizationId, integrationId, snapshotAt },
          }),
          tx.channelAnalyticsPostMetricSnapshot.findMany({
            where: {
              organizationId,
              integrationId,
              snapshotAt: previousSnapshotAt,
            },
          }),
        ]);
        const prior = new Map(
          previous.map((point) => [
            `${point.externalPostId}:${point.metricKey}`,
            point,
          ])
        );
        const totals = new Map<
          string,
          {
            label: string;
            valueMode: ChannelAnalyticsValueMode;
            displayUnit?: ChannelAnalyticsDisplayUnit | null;
            total: Prisma.Decimal;
            count: number;
          }
        >();
        for (const point of current) {
          const before = prior.get(
            `${point.externalPostId}:${point.metricKey}`
          );
          if (!before) continue;
          const metric = totals.get(point.metricKey) || {
            label: point.label,
            valueMode: point.valueMode,
            displayUnit: point.displayUnit,
            total: new Prisma.Decimal(0),
            count: 0,
          };
          metric.total = metric.total.plus(point.value.minus(before.value));
          metric.count++;
          totals.set(point.metricKey, metric);
        }
        const day = utcDay(snapshotAt);
        for (const [metricKey, metric] of totals) {
          const value =
            metric.valueMode === ChannelAnalyticsValueMode.AVERAGE
              ? metric.total.dividedBy(metric.count)
              : metric.total;
          await tx.channelAnalyticsDailyPoint.upsert({
            where: {
              integrationId_day_metricKey: { integrationId, day, metricKey },
            },
            create: {
              organizationId,
              integrationId,
              day,
              metricKey,
              label: metric.label,
              valueMode: metric.valueMode,
              displayUnit: metric.displayUnit,
              value,
              currentSnapshotAt: snapshotAt,
              previousSnapshotAt,
            },
            update: {
              label: metric.label,
              valueMode: metric.valueMode,
              displayUnit: metric.displayUnit,
              value,
              currentSnapshotAt: snapshotAt,
              previousSnapshotAt,
            },
          });
        }
        hasDerivedDailyPoints = totals.size > 0;
      }
      await this.upsertSuccessfulState(
        tx,
        organizationId,
        integrationId,
        snapshotAt,
        previousSnapshotAt && isNextUtcDay(previousSnapshotAt, snapshotAt)
          ? utcDay(snapshotAt)
          : undefined
      );
      return { finalized: true, derived: hasDerivedDailyPoints ? 1 : 0 };
    });
  }

  async recordFailure(
    organizationId: string,
    integrationId: string,
    category: string,
    message: string,
    attemptedAt: Date
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      return tx.channelAnalyticsSyncState.upsert({
        where: { integrationId },
        create: {
          organizationId,
          integrationId,
          nextAttemptAt: new Date(attemptedAt.getTime() + 60 * 60 * 1000),
          failureCount: 1,
          failureCategory: category,
          failureMessage: message,
        },
        update: {
          nextAttemptAt: new Date(attemptedAt.getTime() + 60 * 60 * 1000),
          failureCount: { increment: 1 },
          failureCategory: category,
          failureMessage: message,
        },
      });
    });
  }

  getDailyPoints(
    organizationId: string,
    integrationId: string,
    from: Date,
    to: Date
  ) {
    return this._analytics.model.channelAnalyticsDailyPoint.findMany({
      where: { organizationId, integrationId, day: { gte: from, lt: to } },
      orderBy: [{ metricKey: 'asc' }, { day: 'asc' }],
    });
  }

  /**
   * Latest stored daily point per metric key (any day), not a Dashboard window.
   */
  async getLatestDailyPoints(
    organizationId: string,
    integrationId: string,
    metricKeys: string[]
  ) {
    if (!metricKeys.length) {
      return [];
    }
    const rows =
      await this._analytics.model.channelAnalyticsDailyPoint.findMany({
        where: {
          organizationId,
          integrationId,
          metricKey: { in: metricKeys },
        },
        orderBy: [{ metricKey: 'asc' }, { day: 'desc' }],
      });
    const latestByKey = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByKey.has(row.metricKey)) {
        latestByKey.set(row.metricKey, row);
      }
    }
    return metricKeys
      .map((key) => latestByKey.get(key))
      .filter((row): row is (typeof rows)[number] => !!row);
  }

  async getMetricDayContributors(
    organizationId: string,
    integrationId: string,
    metricKey: string,
    day: Date
  ) {
    const dailyPoint =
      await this._analytics.model.channelAnalyticsDailyPoint.findFirst({
        where: { organizationId, integrationId, metricKey, day },
        select: {
          value: true,
          currentSnapshotAt: true,
          previousSnapshotAt: true,
        },
      });
    if (!dailyPoint) {
      return { dailyPointTotal: null, hasProvenance: false, contributors: [] };
    }
    // Daily points captured before the provenance columns existed have a null
    // bound pair. The underlying per-post snapshots are still retained, so we
    // reconstruct the bounding pair on read and let the equality check below
    // fail closed if it cannot be reconciled.
    const bounds =
      dailyPoint.currentSnapshotAt && dailyPoint.previousSnapshotAt
        ? {
            currentSnapshotAt: dailyPoint.currentSnapshotAt,
            previousSnapshotAt: dailyPoint.previousSnapshotAt,
          }
        : await this.reconstructSnapshotPair(
            organizationId,
            integrationId,
            metricKey,
            day
          );
    if (!bounds.currentSnapshotAt || !bounds.previousSnapshotAt) {
      return {
        dailyPointTotal: dailyPoint.value.toNumber(),
        hasProvenance: false,
        contributors: [],
      };
    }
    const [current, previous] = await Promise.all([
      this._analytics.model.channelAnalyticsPostMetricSnapshot.findMany({
        where: {
          organizationId,
          integrationId,
          metricKey,
          snapshotAt: bounds.currentSnapshotAt,
        },
        select: { externalPostId: true, value: true },
      }),
      this._analytics.model.channelAnalyticsPostMetricSnapshot.findMany({
        where: {
          organizationId,
          integrationId,
          metricKey,
          snapshotAt: bounds.previousSnapshotAt,
        },
        select: { externalPostId: true, value: true },
      }),
    ]);
    const prior = new Map(
      previous.map((point) => [point.externalPostId, point.value])
    );
    const contributors = current
      .flatMap((point) => {
        const before = prior.get(point.externalPostId);
        if (!before) return [];
        const delta = point.value.minus(before);
        return delta.isZero()
          ? []
          : [{ externalPostId: point.externalPostId, delta }];
      })
      .sort(
        (left, right) =>
          right.delta.comparedTo(left.delta) ||
          left.externalPostId.localeCompare(right.externalPostId)
      );
    const contributorTotal = contributors.reduce(
      (sum, contributor) => sum.plus(contributor.delta),
      new Prisma.Decimal(0)
    );
    if (!contributorTotal.equals(dailyPoint.value)) {
      return {
        dailyPointTotal: dailyPoint.value.toNumber(),
        hasProvenance: false,
        contributors: [],
      };
    }
    return {
      dailyPointTotal: dailyPoint.value.toNumber(),
      hasProvenance: true,
      contributors,
    };
  }

  private async reconstructSnapshotPair(
    organizationId: string,
    integrationId: string,
    metricKey: string,
    day: Date
  ) {
    const nextDay = utcDay(day);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const current =
      await this._analytics.model.channelAnalyticsPostMetricSnapshot.findFirst({
        where: {
          organizationId,
          integrationId,
          metricKey,
          snapshotAt: { gte: day, lt: nextDay },
        },
        orderBy: { snapshotAt: 'desc' },
        select: { snapshotAt: true },
      });
    if (!current) {
      return { currentSnapshotAt: null, previousSnapshotAt: null };
    }
    const previous =
      await this._analytics.model.channelAnalyticsPostMetricSnapshot.findFirst({
        where: {
          organizationId,
          integrationId,
          metricKey,
          snapshotAt: { lt: current.snapshotAt },
        },
        orderBy: { snapshotAt: 'desc' },
        select: { snapshotAt: true },
      });
    return {
      currentSnapshotAt: current.snapshotAt,
      previousSnapshotAt: previous?.snapshotAt ?? null,
    };
  }

  getMetricDayPosts(
    organizationId: string,
    integrationId: string,
    externalPostIds: string[]
  ) {
    if (!externalPostIds.length) return Promise.resolve([]);
    return this._analytics.model.post.findMany({
      where: {
        organizationId,
        integrationId,
        releaseId: { in: externalPostIds },
        deletedAt: null,
        state: 'PUBLISHED',
      },
      select: {
        id: true,
        content: true,
        image: true,
        publishDate: true,
        releaseId: true,
        releaseURL: true,
      },
    });
  }

  getSyncState(organizationId: string, integrationId: string) {
    return this._analytics.model.channelAnalyticsSyncState.findFirst({
      where: { organizationId, integrationId },
    });
  }

  findOwnedIntegration(organizationId: string, integrationId: string) {
    return this._integration.model.integration.findFirst({
      where: { id: integrationId, organizationId },
      select: {
        id: true,
        type: true,
        disabled: true,
        deletedAt: true,
        providerIdentifier: true,
      },
    });
  }

  scheduleImmediateCapture(
    organizationId: string,
    integrationId: string,
    nextAttemptAt = new Date(0)
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      return tx.channelAnalyticsSyncState.upsert({
        where: { integrationId },
        create: {
          organizationId,
          integrationId,
          nextAttemptAt,
        },
        update: { nextAttemptAt },
      });
    });
  }

  private async markSuccessful(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    coveredDay?: Date
  ) {
    return this.inTransaction(async (tx) => {
      await this.assertOwnedIntegration(tx, organizationId, integrationId);
      const state = await tx.channelAnalyticsSyncState.findUnique({
        where: { integrationId },
      });
      if (state?.lastSuccessfulSnapshotAt?.getTime() === snapshotAt.getTime()) {
        return { finalized: false };
      }
      await this.upsertSuccessfulState(
        tx,
        organizationId,
        integrationId,
        snapshotAt,
        coveredDay
      );
      return { finalized: true };
    });
  }

  private upsertSuccessfulState(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    coveredDay?: Date
  ) {
    return tx.channelAnalyticsSyncState
      .findUnique({ where: { integrationId } })
      .then((state) =>
        this.writeSuccessfulState(
          tx,
          organizationId,
          integrationId,
          snapshotAt,
          coveredDay,
          state
        )
      );
  }

  private writeSuccessfulState(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    coveredDay: Date | undefined,
    state: {
      pendingCoverageSnapshotAt: Date | null;
      pendingCoverageStartDay: Date | null;
      pendingCoverageEndDay: Date | null;
      coverageStartDay: Date | null;
      coverageEndDay: Date | null;
    } | null
  ) {
    const hasPendingCoverage =
      coveredDay &&
      state?.pendingCoverageSnapshotAt?.getTime() === snapshotAt.getTime() &&
      state.pendingCoverageStartDay &&
      state.pendingCoverageEndDay;
    const coverage = hasPendingCoverage
      ? mergeCoverage(
          state?.coverageStartDay,
          state?.coverageEndDay,
          state.pendingCoverageStartDay,
          state.pendingCoverageEndDay
        )
      : coveredDay
      ? mergeCoverage(
          state?.coverageStartDay,
          state?.coverageEndDay,
          coveredDay,
          coveredDay
        )
      : undefined;
    return tx.channelAnalyticsSyncState.upsert({
      where: { integrationId },
      create: {
        organizationId,
        integrationId,
        lastSuccessfulSnapshotAt: snapshotAt,
        ...(coverage
          ? {
              coverageStartDay: coverage.startDay,
              coverageEndDay: coverage.endDay,
              lastCoveredDay: coverage.endDay,
            }
          : {}),
        nextAttemptAt: nextUtcDay(snapshotAt),
      },
      update: {
        lastSuccessfulSnapshotAt: snapshotAt,
        ...(coverage
          ? {
              coverageStartDay: coverage.startDay,
              coverageEndDay: coverage.endDay,
              lastCoveredDay: coverage.endDay,
            }
          : {}),
        ...(hasPendingCoverage
          ? {
              pendingCoverageSnapshotAt: null,
              pendingCoverageStartDay: null,
              pendingCoverageEndDay: null,
            }
          : {}),
        nextAttemptAt: nextUtcDay(snapshotAt),
        failureCount: 0,
        failureCategory: null,
        failureMessage: null,
      },
    });
  }

  private upsertPendingCoverage(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    coverage: { fromDay: Date; toDay: Date }
  ) {
    return tx.channelAnalyticsSyncState.upsert({
      where: { integrationId },
      create: {
        organizationId,
        integrationId,
        nextAttemptAt: snapshotAt,
        pendingCoverageSnapshotAt: snapshotAt,
        pendingCoverageStartDay: coverage.fromDay,
        pendingCoverageEndDay: coverage.toDay,
      },
      update: {
        pendingCoverageSnapshotAt: snapshotAt,
        pendingCoverageStartDay: coverage.fromDay,
        pendingCoverageEndDay: coverage.toDay,
      },
    });
  }

  private async assertOwnedIntegration(
    tx: Prisma.TransactionClient,
    organizationId: string,
    integrationId: string
  ) {
    const integration = await tx.integration.findFirst({
      where: { id: integrationId, organizationId },
      select: { id: true },
    });
    if (!integration)
      throw new Error('Channel integration does not belong to organization');
  }

  private inTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>
  ) {
    return (this._transaction.model as any).$transaction(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }) as Promise<T>;
  }
}

const utcDay = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );

const nextUtcDay = (value: Date) => {
  const next = utcDay(value);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
};

const isNextUtcDay = (previous: Date, current: Date) =>
  utcDay(current).getTime() - utcDay(previous).getTime() ===
  24 * 60 * 60 * 1000;

const mergeCoverage = (
  currentStart: Date | null | undefined,
  currentEnd: Date | null | undefined,
  incomingStart: Date,
  incomingEnd: Date
) => {
  if (!currentStart || !currentEnd) {
    return { startDay: incomingStart, endDay: incomingEnd };
  }
  const oneDay = 24 * 60 * 60 * 1000;
  if (
    incomingStart.getTime() > currentEnd.getTime() + oneDay ||
    incomingEnd.getTime() < currentStart.getTime() - oneDay
  ) {
    return undefined;
  }
  return {
    startDay:
      incomingStart.getTime() < currentStart.getTime()
        ? incomingStart
        : currentStart,
    endDay:
      incomingEnd.getTime() > currentEnd.getTime() ? incomingEnd : currentEnd,
  };
};

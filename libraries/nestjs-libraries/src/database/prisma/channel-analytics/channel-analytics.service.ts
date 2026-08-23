import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelAnalyticsValueMode as PrismaValueMode } from '@prisma/client';
import { TemporalService } from 'nestjs-temporal-core';
import {
  AnalyticsData,
  ChannelAnalyticsCapturePage,
  ChannelAnalyticsDatedPoint,
  ChannelAnalyticsDisplayUnit,
  ChannelAnalyticsPostLifetimePoint,
  ChannelAnalyticsValueMode,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import {
  AnalyticsDailyPointInput,
  AnalyticsPostMetricInput,
  ChannelAnalyticsRepository,
} from './channel-analytics.repository';
import {
  ANALYTICS_METRIC_SLUGS,
  AnalyticsMetricSlug,
} from '@gitroom/nestjs-libraries/dtos/analytics/metric-day.analytics.dto';

const WINDOW_DAYS = new Set([7, 30, 90]);
const MAX_PAGE_POINTS = 1_000;
const MAX_TEXT_LENGTH = 256;
const CAPTURE_COOLDOWN_SECONDS = 60 * 60;
const CAPTURE_PRIORITY_AT = new Date(0);

/** Canonical account audience totals (platform follower/subscriber count). */
export const ACCOUNT_AUDIENCE_TOTAL_METRIC_KEYS = [
  'followers',
  'subscribers',
] as const;

export type AccountAudienceTotalMetricKey =
  (typeof ACCOUNT_AUDIENCE_TOTAL_METRIC_KEYS)[number];

export type AccountAudienceTotal = {
  value: number;
  asOf: string;
  metricKey: AccountAudienceTotalMetricKey;
  label: string;
};

export type RequestCaptureResult = {
  status: 'queued' | 'already_queued';
  message: string;
};

@Injectable()
export class ChannelAnalyticsService {
  constructor(
    private _repository: ChannelAnalyticsRepository,
    private _integrationManager: IntegrationManager,
    private _temporalService: TemporalService
  ) { }

  async persistCapturePage(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    page: ChannelAnalyticsCapturePage
  ) {
    this.validateSnapshotAt(snapshotAt);
    if (
      !page ||
      !Array.isArray(page.points) ||
      page.points.length > MAX_PAGE_POINTS
    ) {
      throw new BadRequestException(
        `Analytics page may contain at most ${MAX_PAGE_POINTS} points`
      );
    }
    if (page.kind === 'daily') {
      const coverage = this.validateCoverage(page.coverage);
      return this._repository.persistDailyPage(
        organizationId,
        integrationId,
        snapshotAt,
        page.points.map((point) => this.validateDailyPoint(point)),
        coverage
      );
    }
    if (page.kind === 'post_lifetime') {
      if (
        page.accountPoints &&
        (!Array.isArray(page.accountPoints) ||
          page.accountPoints.length > MAX_PAGE_POINTS)
      ) {
        throw new BadRequestException(
          `Analytics page may contain at most ${MAX_PAGE_POINTS} account points`
        );
      }
      const result = await this._repository.persistPostLifetimePage(
        organizationId,
        integrationId,
        snapshotAt,
        page.points.map((point) => this.validatePostMetric(point))
      );
      if (page.accountPoints?.length) {
        const accountPersisted =
          await this._repository.persistAccountDailyPoints(
            organizationId,
            integrationId,
            page.accountPoints.map((point) => this.validateDailyPoint(point))
          );
        return {
          persisted: result.persisted + accountPersisted.persisted,
        };
      }
      return result;
    }
    throw new BadRequestException('Unsupported analytics capture page');
  }

  finalizeCapture(
    organizationId: string,
    integrationId: string,
    snapshotAt: Date,
    kind: ChannelAnalyticsCapturePage['kind'],
    coveredDay?: Date
  ) {
    this.validateSnapshotAt(snapshotAt);
    if (coveredDay) this.validateUtcDay(coveredDay, 'coveredDay');
    return kind === 'daily'
      ? this._repository.finalizeDailyCapture(
        organizationId,
        integrationId,
        snapshotAt,
        coveredDay
      )
      : this._repository.finalizePostLifetimeCapture(
        organizationId,
        integrationId,
        snapshotAt
      );
  }

  recordFailure(
    organizationId: string,
    integrationId: string,
    category: string,
    message: string,
    attemptedAt = new Date()
  ) {
    this.validateText(category, 'category', 64);
    this.validateText(message, 'message', MAX_TEXT_LENGTH);
    this.validateSnapshotAt(attemptedAt);
    return this._repository.recordFailure(
      organizationId,
      integrationId,
      category,
      message,
      attemptedAt
    );
  }

  async requestCapture(
    organizationId: string,
    integrationId: string,
    now = new Date()
  ): Promise<RequestCaptureResult> {
    const integration = await this._repository.findOwnedIntegration(
      organizationId,
      integrationId
    );
    if (!integration) {
      throw new NotFoundException('Invalid integration');
    }
    if (
      integration.type !== 'social' ||
      integration.disabled ||
      integration.deletedAt
    ) {
      throw new BadRequestException('Analytics capture is unavailable');
    }
    const supported = this._integrationManager.getAnalyticsSnapshotIntegrations();
    if (!supported.includes(integration.providerIdentifier)) {
      throw new BadRequestException('Analytics capture is unavailable');
    }

    const cooldownKey = `analytics-capture-request:${organizationId}:${integrationId}`;
    const reserved = await ioRedis.set(
      cooldownKey,
      '1',
      'EX',
      CAPTURE_COOLDOWN_SECONDS,
      'NX'
    );
    if (!reserved) {
      throw new HttpException(
        'Analytics collection was already requested. Try again in an hour.',
        429
      );
    }

    const syncState = await this._repository.getSyncState(
      organizationId,
      integrationId
    );
    const alreadyQueued =
      !!syncState?.nextAttemptAt &&
      syncState.nextAttemptAt.getTime() <= now.getTime();
    await this._repository.scheduleImmediateCapture(
      organizationId,
      integrationId,
      CAPTURE_PRIORITY_AT
    );
    await this.pokeChannelAnalyticsSnapshot();
    if (alreadyQueued) {
      return {
        status: 'already_queued',
        message: 'Analytics collection is already queued.',
      };
    }
    return {
      status: 'queued',
      message: 'Analytics collection started. This may take a few minutes.',
    };
  }

  async getStoredAnalytics(
    organizationId: string,
    integrationId: string,
    days: 7 | 30 | 90,
    now = new Date()
  ): Promise<AnalyticsData[]> {
    if (!WINDOW_DAYS.has(days)) {
      throw new BadRequestException('Unsupported analytics window');
    }
    const integration = await this._repository.findOwnedIntegration(
      organizationId,
      integrationId
    );
    if (!integration) {
      throw new NotFoundException('Invalid integration');
    }
    if (integration.type !== 'social') {
      return [];
    }
    const window = await this.getWindow(
      organizationId,
      integrationId,
      days,
      now
    );
    return window.metrics.map((metric) => this.formatStoredMetric(metric));
  }

  /**
   * Latest platform follower/subscriber total for a channel, ignoring the
   * Dashboard 7/30/90 window. Prefers `followers` over `subscribers`.
   */
  async getLatestAccountAudienceTotal(
    organizationId: string,
    integrationId: string
  ): Promise<AccountAudienceTotal | null> {
    const integration = await this._repository.findOwnedIntegration(
      organizationId,
      integrationId
    );
    if (!integration) {
      throw new NotFoundException('Invalid integration');
    }
    if (integration.type !== 'social') {
      return null;
    }
    const rows = await this._repository.getLatestDailyPoints(
      organizationId,
      integrationId,
      [...ACCOUNT_AUDIENCE_TOTAL_METRIC_KEYS]
    );
    const byKey = new Map(
      rows.map((row) => [row.metricKey, row] as const)
    );
    for (const metricKey of ACCOUNT_AUDIENCE_TOTAL_METRIC_KEYS) {
      const row = byKey.get(metricKey);
      if (!row) {
        continue;
      }
      const value = row.value.toNumber();
      if (!Number.isFinite(value) || value < 0) {
        continue;
      }
      return {
        value,
        asOf: row.day.toISOString().slice(0, 10),
        metricKey,
        label: row.label,
      };
    }
    return null;
  }

  async getMetricDayAnalytics(
    organizationId: string,
    integrationId: string,
    slug: AnalyticsMetricSlug,
    date: string,
    page: number,
    limit: number
  ) {
    const integration = await this._repository.findOwnedIntegration(
      organizationId,
      integrationId
    );
    if (!integration) {
      throw new NotFoundException('Invalid integration');
    }
    if (integration.type !== 'social') {
      throw new BadRequestException('Analytics drill-down is unavailable');
    }
    const day = this.parseUtcDay(date, 'date');
    const metricKey = ANALYTICS_METRIC_SLUGS[slug];
    const result = await this._repository.getMetricDayContributors(
      organizationId,
      integrationId,
      metricKey,
      day
    );
    if (!result.hasProvenance) {
      return {
        metric: slug,
        metricKey,
        date,
        page,
        limit,
        total: 0,
        matchedPostDeltaTotal: 0,
        unmatchedContributorCount: 0,
        dailyPointTotal: result.dailyPointTotal,
        reason: 'no_post_lifetime_provenance' as const,
        posts: [],
      };
    }
    const posts = await this._repository.getMetricDayPosts(
      organizationId,
      integrationId,
      result.contributors.map((contributor) => contributor.externalPostId)
    );
    const postByReleaseId = new Map(
      posts
        .filter((post) => post.releaseId)
        .map((post) => [post.releaseId!, post])
    );
    const matched = result.contributors.flatMap((contributor) => {
      const post = postByReleaseId.get(contributor.externalPostId);
      return post
        ? [{ ...post, delta: contributor.delta.toNumber() }]
        : [];
    });
    const matchedPostDeltaTotal = matched.reduce(
      (total, post) => total + post.delta,
      0
    );
    return {
      metric: slug,
      metricKey,
      date,
      page,
      limit,
      total: matched.length,
      matchedPostDeltaTotal,
      unmatchedContributorCount: result.contributors.length - matched.length,
      dailyPointTotal: result.dailyPointTotal,
      posts: matched.slice(page * limit, (page + 1) * limit),
    };
  }

  isChannelUnavailable(
    syncState?: {
      failureCount: number;
      lastSuccessfulSnapshotAt: Date | null;
    } | null
  ) {
    return !!syncState?.failureCount && !syncState?.lastSuccessfulSnapshotAt;
  }

  async getWindow(
    organizationId: string,
    integrationId: string,
    days: 7 | 30 | 90,
    now = new Date()
  ) {
    if (!WINDOW_DAYS.has(days))
      throw new BadRequestException('Unsupported analytics window');
    this.validateSnapshotAt(now);
    const currentEnd = utcDay(now);
    currentEnd.setUTCDate(currentEnd.getUTCDate() + 1);
    const currentStart = new Date(currentEnd);
    currentStart.setUTCDate(currentStart.getUTCDate() - days);
    const previousStart = new Date(currentStart);
    previousStart.setUTCDate(previousStart.getUTCDate() - days);
    const [rows, syncState] = await Promise.all([
      this._repository.getDailyPoints(
        organizationId,
        integrationId,
        previousStart,
        currentEnd
      ),
      this._repository.getSyncState(organizationId, integrationId),
    ]);
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      grouped.set(row.metricKey, [...(grouped.get(row.metricKey) || []), row]);
    }
    return {
      from: currentStart,
      to: currentEnd,
      metrics: [...grouped.entries()].flatMap(([metricKey, points]) => {
        const valueMode = mapValueMode(points[0].valueMode);
        const currentObservations = points.filter(
          (point) => point.day >= currentStart
        );
        const previousObservations = points.filter(
          (point) => point.day < currentStart
        );
        if (
          (valueMode === 'average' || valueMode === 'latest') &&
          currentObservations.length === 0
        ) {
          return [];
        }
        const previousWindowCovered = isCoverageComplete(
          syncState,
          previousStart,
          currentStart
        );
        const currentWindowCovered = isCoverageComplete(
          syncState,
          currentStart,
          currentEnd
        );
        const current = this.fillCoveredSumDays(
          currentObservations,
          currentStart,
          currentEnd,
          valueMode,
          currentWindowCovered,
          points[0]
        );
        const previous = this.fillCoveredSumDays(
          previousObservations,
          previousStart,
          currentStart,
          valueMode,
          previousWindowCovered,
          points[0]
        );
        const currentForAggregate =
          valueMode === 'sum' ? current : currentObservations;
        const previousForAggregate =
          valueMode === 'sum' ? previous : previousObservations;
        const currentTotal = aggregate(currentForAggregate, valueMode);
        const previousTotal = aggregate(previousForAggregate, valueMode);
        const hasObservationsForTrend =
          valueMode === 'sum' ||
          (currentObservations.length > 0 && previousObservations.length > 0);
        const trend =
          !previousWindowCovered ||
            !currentWindowCovered ||
            !hasObservationsForTrend
            ? null
            : valueMode === 'average'
              ? currentTotal - previousTotal
              : previousTotal !== 0
                ? ((currentTotal - previousTotal) / Math.abs(previousTotal)) *
                100
                : null;
        const responsePoints =
          valueMode === 'sum' ? current : currentObservations;
        return [
          {
            metricKey,
            label: points[0].label,
            valueMode,
            displayUnit: resolveDisplayUnit(valueMode, points[0].displayUnit),
            points: responsePoints.map((point) => ({
              day: point.day,
              value: point.value.toNumber(),
            })),
            total: currentTotal,
            trend,
          },
        ];
      }),
    };
  }

  private formatStoredMetric(metric: {
    metricKey: string;
    label: string;
    valueMode: ChannelAnalyticsValueMode;
    displayUnit: ChannelAnalyticsDisplayUnit;
    points: Array<{ day: Date; value: number }>;
    trend: number | null;
  }): AnalyticsData {
    const data = metric.points.map((point) => ({
      date: point.day.toISOString().slice(0, 10),
      total: point.value,
    }));
    const response: AnalyticsData = {
      label: metric.label,
      metricKey: metric.metricKey,
      drilldownSlug:
        metric.valueMode === 'sum'
          ? metricSlugForKey(metric.metricKey)
          : null,
      valueMode: metric.valueMode,
      displayUnit: metric.displayUnit,
      data,
    };
    if (metric.valueMode === 'average' && metric.displayUnit === 'percentage') {
      response.average = true;
    }
    if (metric.trend !== null) {
      response.percentageChange = metric.trend;
    }
    return response;
  }

  private validateDailyPoint(
    point: ChannelAnalyticsDatedPoint
  ): AnalyticsDailyPointInput {
    return {
      ...this.validateMetric(point),
      day: this.parseUtcDay(point.day, 'day'),
    };
  }

  private validatePostMetric(
    point: ChannelAnalyticsPostLifetimePoint
  ): AnalyticsPostMetricInput {
    this.validateText(point?.externalPostId, 'externalPostId', MAX_TEXT_LENGTH);
    return {
      ...this.validateMetric(point),
      externalPostId: point.externalPostId,
    };
  }

  private validateMetric(point: {
    metricKey: string;
    label: string;
    valueMode: ChannelAnalyticsValueMode;
    displayUnit?: ChannelAnalyticsDisplayUnit;
    value: number;
  }) {
    this.validateText(point?.metricKey, 'metricKey', MAX_TEXT_LENGTH);
    this.validateText(point?.label, 'label', MAX_TEXT_LENGTH);
    if (!['sum', 'average', 'latest'].includes(point?.valueMode)) {
      throw new BadRequestException('Unsupported analytics value mode');
    }
    if (
      point?.displayUnit &&
      !['count', 'percentage', 'duration', 'decimal'].includes(point.displayUnit)
    ) {
      throw new BadRequestException('Unsupported analytics display unit');
    }
    if (!Number.isFinite(point?.value)) {
      throw new BadRequestException('Analytics metric value must be finite');
    }
    return {
      metricKey: point.metricKey,
      label: point.label,
      valueMode: prismaValueMode(point.valueMode),
      displayUnit: point.displayUnit
        ? prismaDisplayUnit(point.displayUnit)
        : null,
      value: point.value,
    };
  }

  private validateSnapshotAt(value: Date) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('snapshotAt must be a valid timestamp');
    }
  }

  private validateUtcDay(value: Date, name: string) {
    this.validateSnapshotAt(value);
    if (
      value.getUTCHours() !== 0 ||
      value.getUTCMinutes() !== 0 ||
      value.getUTCSeconds() !== 0 ||
      value.getUTCMilliseconds() !== 0
    )
      throw new BadRequestException(`${name} must be a UTC calendar day`);
  }

  private validateCoverage(coverage: { fromDay: string; toDay: string }) {
    if (!coverage || typeof coverage !== 'object') {
      throw new BadRequestException('Daily analytics coverage is required');
    }
    const fromDay = this.parseUtcDay(coverage.fromDay, 'coverage.fromDay');
    const toDay = this.parseUtcDay(coverage.toDay, 'coverage.toDay');
    if (fromDay > toDay) {
      throw new BadRequestException(
        'Daily analytics coverage must have an ordered UTC interval'
      );
    }
    return { fromDay, toDay };
  }

  private fillCoveredSumDays<
    T extends { day: Date; value: { toNumber(): number } }
  >(
    points: T[],
    from: Date,
    to: Date,
    valueMode: ChannelAnalyticsValueMode,
    covered: boolean,
    template: T
  ) {
    if (valueMode !== 'sum' || !covered) return points;
    const byDay = new Map(points.map((point) => [point.day.toISOString(), point]));
    const filled: T[] = [];
    for (let day = new Date(from); day < to; day.setUTCDate(day.getUTCDate() + 1)) {
      const point = byDay.get(day.toISOString());
      filled.push(
        point ||
        ({
          ...template,
          day: new Date(day),
          value: { toNumber: () => 0 },
        } as T)
      );
    }
    return filled;
  }

  private parseUtcDay(value: string, name: string) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${name} must be an ISO UTC calendar day`);
    }
    const day = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(day.getTime()) ||
      day.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(`${name} must be an ISO UTC calendar day`);
    }
    return day;
  }

  private validateText(
    value: unknown,
    name: string,
    max: number
  ): asserts value is string {
    if (typeof value !== 'string' || !value || value.length > max) {
      throw new BadRequestException(
        `${name} must be between 1 and ${max} characters`
      );
    }
  }

  private async pokeChannelAnalyticsSnapshot() {
    try {
      const workflow = this._temporalService.client?.getRawClient()?.workflow;
      await workflow
        ?.getHandle('channel-analytics-snapshot-workflow-v2')
        .signal('channelAnalyticsSnapshot');
    } catch {
      // The workflow may not be running yet; its hourly pass processes persisted state.
    }
  }
}

const prismaValueMode = (value: ChannelAnalyticsValueMode) =>
({
  sum: PrismaValueMode.SUM,
  average: PrismaValueMode.AVERAGE,
  latest: PrismaValueMode.LATEST,
}[value]);

const prismaDisplayUnit = (value: ChannelAnalyticsDisplayUnit) =>
({
  count: 'COUNT',
  percentage: 'PERCENTAGE',
  duration: 'DURATION',
  decimal: 'DECIMAL',
}[value] as 'COUNT' | 'PERCENTAGE' | 'DURATION' | 'DECIMAL');

const mapDisplayUnit = (
  value: string | null | undefined
): ChannelAnalyticsDisplayUnit | undefined => {
  if (!value) return undefined;
  return (
    {
      COUNT: 'count',
      PERCENTAGE: 'percentage',
      DURATION: 'duration',
      DECIMAL: 'decimal',
    } as Record<string, ChannelAnalyticsDisplayUnit>
  )[value];
};

const resolveDisplayUnit = (
  valueMode: ChannelAnalyticsValueMode,
  displayUnit?: string | null
): ChannelAnalyticsDisplayUnit => {
  const mapped = mapDisplayUnit(displayUnit);
  if (mapped) return mapped;
  if (valueMode === 'average') return 'percentage';
  return 'count';
};

const mapValueMode = (value: PrismaValueMode): ChannelAnalyticsValueMode =>
({
  [PrismaValueMode.SUM]: 'sum',
  [PrismaValueMode.AVERAGE]: 'average',
  [PrismaValueMode.LATEST]: 'latest',
}[value] as ChannelAnalyticsValueMode);

const metricSlugForKey = (metricKey: string): AnalyticsMetricSlug | null =>
  (Object.entries(ANALYTICS_METRIC_SLUGS).find(
    ([, key]) => key === metricKey
  )?.[0] as AnalyticsMetricSlug | undefined) || null;

const aggregate = (
  points: Array<{ value: { toNumber(): number }; day: Date }>,
  mode: ChannelAnalyticsValueMode
) => {
  if (!points.length) return 0;
  if (mode === 'latest') return points[points.length - 1].value.toNumber();
  const total = points.reduce((sum, point) => sum + point.value.toNumber(), 0);
  return mode === 'average' ? total / points.length : total;
};

const utcDay = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );

const isCoverageComplete = (
  state:
    | {
      coverageStartDay?: Date | null;
      coverageEndDay?: Date | null;
    }
    | null
    | undefined,
  from: Date,
  to: Date
) => {
  if (!state?.coverageStartDay || !state.coverageEndDay) return false;
  const lastDay = new Date(to);
  lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  return (
    state.coverageStartDay <= from &&
    state.coverageEndDay >= lastDay
  );
};

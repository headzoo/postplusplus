import { ChannelAudienceMembership } from '@prisma/client';
import {
  CULTIVATE_STALE_DAYS,
  CULTIVATE_WARM_GRADE_THRESHOLD,
} from '@gitroom/nestjs-libraries/temporal/cultivate.schedule';

export type CultivatePickExclusionReason =
  | 'visible'
  | 'dismissed'
  | 'ignored'
  | 'bot'
  | 'not_follower'
  | 'hot_lead'
  | 'not_warm'
  | 'recently_contacted'
  | 'missing_member';

export type CultivatePickAuditMember = {
  externalId: string;
  username: string | null;
  membershipState: string | null;
  ignoredAt: Date | null;
  isBot: boolean | null;
  relationshipTriage: string | null;
  relationshipGrade: number | null;
  lastOutboundAt: Date | null;
  triageIgnores: Array<{ triage: string; expiresAt: Date | null }>;
};

export type CultivatePickAuditExcludedEntry = {
  externalId: string;
  username: string | null;
  reason: Exclude<CultivatePickExclusionReason, 'visible'>;
  relationshipTriage?: string | null;
  relationshipGrade?: number | null;
  lastOutboundAt?: string | null;
};

export type CultivatePickAuditResult = {
  hour: string;
  storedCount: number;
  visibleCount: number;
  excludedCount: number;
  excludedByReason: Partial<
    Record<
      Exclude<CultivatePickExclusionReason, 'visible' | 'missing_member'>,
      number
    >
  >;
  excluded: CultivatePickAuditExcludedEntry[];
};

export type CultivatePickAuditConfig = {
  warmGradeThreshold: number;
  staleDays: number;
};

export const isCultivateTriageDebugReadLogEnabled = () =>
  process.env.CULTIVATE_TRIAGE_DEBUG_LOG === 'true';

export const defaultCultivatePickAuditConfig =
  (): CultivatePickAuditConfig => ({
    warmGradeThreshold: CULTIVATE_WARM_GRADE_THRESHOLD,
    staleDays: CULTIVATE_STALE_DAYS,
  });

export const isActiveCultivateTriageIgnore = (
  ignore: { triage: string; expiresAt: Date | null },
  now = new Date()
) =>
  ignore.triage === 'cultivate' &&
  (ignore.expiresAt == null || ignore.expiresAt.getTime() > now.getTime());

export const matchesCultivateWarmSignal = (
  member: Pick<
    CultivatePickAuditMember,
    'relationshipTriage' | 'relationshipGrade'
  >,
  warmGradeThreshold: number
) =>
  member.relationshipTriage === 'mutual' ||
  (member.relationshipGrade != null &&
    member.relationshipGrade >= warmGradeThreshold);

/** Mutual/quiet picks used when the primary warm+stale pool is empty. */
export const matchesCultivateFallbackTriage = (
  member: Pick<CultivatePickAuditMember, 'relationshipTriage'>
) =>
  member.relationshipTriage === 'mutual' ||
  member.relationshipTriage === 'quiet';

export const isCultivateStaleEnough = (
  lastOutboundAt: Date | null,
  now: Date,
  staleDays: number
) => {
  if (lastOutboundAt == null) {
    return true;
  }
  const staleBefore = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);
  return lastOutboundAt.getTime() < staleBefore.getTime();
};

export const classifyCultivatePickVisibility = (
  member: CultivatePickAuditMember | null | undefined,
  now = new Date(),
  config: CultivatePickAuditConfig = defaultCultivatePickAuditConfig()
): CultivatePickExclusionReason => {
  if (!member) {
    return 'missing_member';
  }
  if (member.membershipState !== ChannelAudienceMembership.FOLLOWER) {
    return 'not_follower';
  }
  if (member.ignoredAt != null) {
    return 'ignored';
  }
  if (member.isBot === true) {
    return 'bot';
  }
  if (member.relationshipTriage === 'hot_lead') {
    return 'hot_lead';
  }
  if (
    member.triageIgnores.some((ignore) =>
      isActiveCultivateTriageIgnore(ignore, now)
    )
  ) {
    return 'dismissed';
  }
  if (matchesCultivateFallbackTriage(member)) {
    return 'visible';
  }
  if (!matchesCultivateWarmSignal(member, config.warmGradeThreshold)) {
    return 'not_warm';
  }
  if (!isCultivateStaleEnough(member.lastOutboundAt, now, config.staleDays)) {
    return 'recently_contacted';
  }
  return 'visible';
};

export const summarizeCultivatePickAudit = (params: {
  hour: string;
  picks: Array<{ externalId: string; member: CultivatePickAuditMember | null }>;
  now?: Date;
  config?: CultivatePickAuditConfig;
}): CultivatePickAuditResult => {
  const now = params.now ?? new Date();
  const config = params.config ?? defaultCultivatePickAuditConfig();
  const excluded: CultivatePickAuditExcludedEntry[] = [];
  const excludedByReason: CultivatePickAuditResult['excludedByReason'] = {};
  let visibleCount = 0;

  for (const pick of params.picks) {
    const reason = classifyCultivatePickVisibility(pick.member, now, config);
    if (reason === 'visible') {
      visibleCount += 1;
      continue;
    }
    excluded.push({
      externalId: pick.externalId,
      username: pick.member?.username ?? null,
      reason,
      ...(pick.member?.relationshipTriage != null
        ? { relationshipTriage: pick.member.relationshipTriage }
        : {}),
      ...(pick.member?.relationshipGrade != null
        ? { relationshipGrade: pick.member.relationshipGrade }
        : {}),
      ...(pick.member?.lastOutboundAt
        ? { lastOutboundAt: pick.member.lastOutboundAt.toISOString() }
        : {}),
    });
    if (reason !== 'missing_member') {
      excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
    }
  }

  const storedCount = params.picks.length;
  return {
    hour: params.hour,
    storedCount,
    visibleCount,
    excludedCount: storedCount - visibleCount,
    excludedByReason,
    excluded,
  };
};

/** Cap audit detail for admin-schedule meta (16KB limit). */
export const trimCultivatePickAuditForLog = (
  audit: CultivatePickAuditResult,
  maxExcluded = 50
) => {
  if (audit.excluded.length <= maxExcluded) {
    return audit;
  }
  return {
    ...audit,
    excluded: audit.excluded.slice(0, maxExcluded),
    excludedTruncated: true,
    excludedOmitted: audit.excluded.length - maxExcluded,
  };
};

import { ChannelAudienceMembership } from '@prisma/client';

export type HotPickExclusionReason =
  | 'visible'
  | 'dismissed'
  | 'ignored'
  | 'bot'
  | 'not_follower'
  | 'not_hot_triage'
  | 'missing_member';

export type HotPickAuditMember = {
  externalId: string;
  username: string | null;
  membershipState: string | null;
  ignoredAt: Date | null;
  isBot: boolean | null;
  relationshipTriage: string | null;
  relationshipReciprocationScore: number | null;
  relationshipEffortScore: number | null;
  relationshipGrade?: number | null;
  lastOutboundAt?: Date | null;
  triageIgnores: Array<{ triage: string; expiresAt: Date | null }>;
};

export type HotPickAuditExcludedEntry = {
  externalId: string;
  username: string | null;
  reason: Exclude<HotPickExclusionReason, 'visible'>;
  relationshipTriage?: string | null;
};

export type HotPickAuditResult = {
  hour: string;
  storedCount: number;
  visibleCount: number;
  excludedCount: number;
  excludedByReason: Partial<
    Record<
      Exclude<HotPickExclusionReason, 'visible' | 'missing_member'>,
      number
    >
  >;
  excluded: HotPickAuditExcludedEntry[];
};

const HOT_DISMISS_TRIAGES = new Set(['hot_lead', 'engaged_not_yet']);

export const isHotTriageDebugReadLogEnabled = () =>
  process.env.HOT_TRIAGE_DEBUG_LOG === 'true';

export const isActiveHotTriageIgnore = (
  ignore: { triage: string; expiresAt: Date | null },
  now = new Date()
) =>
  HOT_DISMISS_TRIAGES.has(ignore.triage) &&
  (ignore.expiresAt == null || ignore.expiresAt.getTime() > now.getTime());

export const matchesHotTriageSignal = (member: {
  relationshipTriage: string | null;
  relationshipReciprocationScore: number | null;
  relationshipEffortScore: number | null;
}) =>
  member.relationshipTriage === 'hot_lead' ||
  ((member.relationshipReciprocationScore ?? 0) > 0 &&
    (member.relationshipEffortScore ?? 0) === 0);

export const classifyHotPickVisibility = (
  member: HotPickAuditMember | null | undefined,
  now = new Date()
): HotPickExclusionReason => {
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
  if (
    member.triageIgnores.some((ignore) => isActiveHotTriageIgnore(ignore, now))
  ) {
    return 'dismissed';
  }
  if (!matchesHotTriageSignal(member)) {
    return 'not_hot_triage';
  }
  return 'visible';
};

export const summarizeHotPickAudit = (params: {
  hour: string;
  picks: Array<{ externalId: string; member: HotPickAuditMember | null }>;
  now?: Date;
}): HotPickAuditResult => {
  const now = params.now ?? new Date();
  const excluded: HotPickAuditExcludedEntry[] = [];
  const excludedByReason: HotPickAuditResult['excludedByReason'] = {};
  let visibleCount = 0;

  for (const pick of params.picks) {
    const reason = classifyHotPickVisibility(pick.member, now);
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
export const trimHotPickAuditForLog = (
  audit: HotPickAuditResult,
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

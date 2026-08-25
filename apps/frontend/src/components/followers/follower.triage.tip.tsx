'use client';

import { FC, useCallback, useMemo } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { CloseIconSmall, NotificationIcon } from '@gitroom/frontend/components/ui/icons';
import { useDismissedAlerts } from '@gitroom/frontend/components/layout/use.dismissed.alerts';

export const FOLLOWER_TRIAGE_TIP_SLUGS = [
  'all',
  'leads',
  'hot',
  'cultivate',
  'mutual',
  'quiet',
  'costly',
  'bots',
  'ignored',
] as const;

export type FollowerTriageTipSlug = (typeof FOLLOWER_TRIAGE_TIP_SLUGS)[number];

const FOLLOWER_TRIAGE_TIP_COPY: Record<
  FollowerTriageTipSlug,
  { titleKey: string; defaultTitle: string; bodyKey: string; defaultBody: string }
> = {
  all: {
    titleKey: 'followers_triage_tip_all_title',
    defaultTitle: 'All',
    bodyKey: 'followers_triage_tip_all_body',
    defaultBody:
      'Everyone in this channel. Use the chips to focus on opportunities, relationships, or exclusions.',
  },
  leads: {
    titleKey: 'followers_triage_tip_leads_title',
    defaultTitle: 'Leads',
    bodyKey: 'followers_triage_tip_leads_body',
    defaultBody:
      'People who interact but may not follow you yet, including warm-network prospects.',
  },
  hot: {
    titleKey: 'followers_triage_tip_hot_title',
    defaultTitle: 'Hot',
    bodyKey: 'followers_triage_tip_hot_body',
    defaultBody:
      'Their effort exceeds the channel’s — including people who engaged and have not been reciprocated yet.',
  },
  cultivate: {
    titleKey: 'followers_triage_tip_cultivate_title',
    defaultTitle: 'Cultivate',
    bodyKey: 'followers_triage_tip_cultivate_body',
    defaultBody:
      'Warm relationships that need outbound attention. People to nurture, not new leads.',
  },
  mutual: {
    titleKey: 'followers_triage_tip_mutual_title',
    defaultTitle: 'Mutual',
    bodyKey: 'followers_triage_tip_mutual_body',
    defaultBody: 'Effort is balanced between both sides.',
  },
  quiet: {
    titleKey: 'followers_triage_tip_quiet_title',
    defaultTitle: 'Quiet',
    bodyKey: 'followers_triage_tip_quiet_body',
    defaultBody: 'Little activity either way.',
  },
  costly: {
    titleKey: 'followers_triage_tip_costly_title',
    defaultTitle: 'Costly',
    bodyKey: 'followers_triage_tip_costly_body',
    defaultBody: 'The channel’s effort exceeds theirs.',
  },
  bots: {
    titleKey: 'followers_triage_tip_bots_title',
    defaultTitle: 'Bots',
    bodyKey: 'followers_triage_tip_bots_body',
    defaultBody: 'Likely automated accounts.',
  },
  ignored: {
    titleKey: 'followers_triage_tip_ignored_title',
    defaultTitle: 'Ignored',
    bodyKey: 'followers_triage_tip_ignored_body',
    defaultBody: 'People you’ve hidden from other views.',
  },
};

export const followerTriageTipAlertKey = (slug: FollowerTriageTipSlug) =>
  `followers.triage.${slug}`;

export const resolveFollowerTriageTipSlug = (
  slug?: string
): FollowerTriageTipSlug => {
  // Legacy bookmark slug; canonicalize to leads (same as /followers/lead → /followers/leads).
  if (slug === 'lead') {
    return 'leads';
  }
  // Legacy bookmark slug; Engaged merged into Hot.
  if (slug === 'engaged') {
    return 'hot';
  }
  if (
    slug &&
    (FOLLOWER_TRIAGE_TIP_SLUGS as readonly string[]).includes(slug)
  ) {
    return slug as FollowerTriageTipSlug;
  }
  return 'all';
};

export const FollowerTriageTip: FC<{
  slug?: string;
  hidden?: boolean;
}> = ({ slug, hidden = false }) => {
  const t = useT();
  const { data, isLoading, dismissAlert } = useDismissedAlerts();
  const tipSlug = useMemo(() => resolveFollowerTriageTipSlug(slug), [slug]);
  const alertKey = followerTriageTipAlertKey(tipSlug);
  const copy = FOLLOWER_TRIAGE_TIP_COPY[tipSlug];

  const isDismissed = data?.keys.includes(alertKey) ?? false;

  const onDismiss = useCallback(() => {
    void dismissAlert(alertKey);
  }, [alertKey, dismissAlert]);

  if (hidden || isLoading || !data || isDismissed) {
    return null;
  }

  return (
    <div
      className="flex items-start gap-[12px] rounded-[10px] border border-sky-500/40 bg-sky-500/10 px-[14px] py-[12px] shadow-[inset_0_0_0_1px_rgba(14,165,233,0.08)]"
      data-testid="followers-triage-tip"
      data-triage-tip={tipSlug}
      role="status"
    >
      <div
        className="mt-[1px] inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-300"
        aria-hidden="true"
      >
        <NotificationIcon size={15} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <p className="text-[13px] font-medium text-sky-100">
          {t(copy.titleKey, copy.defaultTitle)}
        </p>
        <p className="text-[13px] text-sky-100/75">
          {t(copy.bodyKey, copy.defaultBody)}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-[2px] inline-flex shrink-0 items-center justify-center rounded-[6px] p-[4px] text-sky-200/70 hover:bg-sky-500/20 hover:text-sky-100"
        aria-label={t('followers_triage_tip_dismiss', 'Dismiss tip')}
        data-testid="followers-triage-tip-dismiss"
      >
        <CloseIconSmall size={10} />
      </button>
    </div>
  );
};

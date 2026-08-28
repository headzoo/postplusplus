'use client';

import { FC, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import {
  FollowerSegmentDefinition,
  FollowerSegmentSlug,
} from '@gitroom/frontend/components/followers/follower.segments';
import { getFollowerSegmentHelpCopy } from '@gitroom/frontend/components/followers/follower.segment.help';

const buildHelpHref = (pathname: string, searchParams: URLSearchParams) => {
  const params = new URLSearchParams(searchParams.toString());
  params.set('help', 'followers');
  const query = params.toString();
  return query ? `${pathname}?${query}` : `${pathname}?help=followers`;
};

export const FollowerSegmentHelpModal: FC<{
  slug: FollowerSegmentSlug;
  label: string;
}> = ({ slug, label }) => {
  const t = useT();
  const pathname = usePathname() || '/followers';
  const searchParams = useSearchParams();
  const helpHref = useMemo(
    () => buildHelpHref(pathname, searchParams),
    [pathname, searchParams]
  );
  const copy = getFollowerSegmentHelpCopy(slug);

  if (!copy) {
    return null;
  }

  return (
    <div
      className="flex max-w-[480px] flex-col gap-[16px]"
      data-testid="followers-segment-help-modal"
      data-segment-help={slug}
    >
      <p className="text-[14px] text-textItemBlur">
        {t(copy.summaryKey, copy.defaultSummary)}
      </p>
      <div className="flex flex-col gap-[8px]">
        <h4 className="text-[13px] font-medium text-newTextColor">
          {t(
            'followers_segment_help_how_calculated',
            'How {{label}} is calculated',
            { label }
          )}
        </h4>
        <p className="text-[14px] text-textItemBlur">
          {t(
            copy.calculationKey,
            copy.defaultCalculation,
            copy.calculationParams
          )}
        </p>
      </div>
      <Link
        href={helpHref}
        scroll={false}
        className="inline-flex items-center text-[13px] text-btnPrimary hover:underline"
        data-testid="followers-segment-help-learn-more"
      >
        {t('followers_segment_help_learn_more', 'Learn more in Help')}
      </Link>
    </div>
  );
};

export const useFollowerSegmentHelpModal = () => {
  const modals = useModals();
  const t = useT();

  const open = useCallback(
    (segment: FollowerSegmentDefinition) => {
      const label = t(segment.key, segment.defaultLabel);
      const copy = getFollowerSegmentHelpCopy(segment.slug);
      if (!copy) {
        return;
      }
      modals.openModal({
        title: t('followers_segment_help_title', 'About {{label}}', { label }),
        askClose: false,
        children: (
          <FollowerSegmentHelpModal slug={segment.slug} label={label} />
        ),
      });
    },
    [modals, t]
  );

  return { open };
};

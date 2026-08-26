'use client';

import { FC, useState } from 'react';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { CategoriesIcon } from '@gitroom/frontend/components/ui/icons';
import {
  FOLLOWER_BUILTIN_TRIAGE_SEGMENTS,
  FollowerSegmentSlug,
} from '@gitroom/frontend/components/followers/follower.segments';

export const FollowerTriageVisibilityMenu: FC<{
  hiddenSlugs: ReadonlySet<FollowerSegmentSlug>;
  onToggle: (slug: FollowerSegmentSlug) => void;
}> = ({ hiddenSlugs, onToggle }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const hiddenCount = hiddenSlugs.size;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          'inline-flex h-[42px] items-center gap-[8px] rounded-[10px] border border-newBorder bg-newBgColorInner px-[14px] text-[13px] text-textItemBlur transition-colors hover:bg-newTableHeader hover:text-newTextColor',
          open && 'border-newTextColor/40 text-newTextColor',
          hiddenCount > 0 && !open && 'text-newTextColor'
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="followers-triage-visibility-button"
      >
        <CategoriesIcon size={15} />
        {t('followers_triage_visibility', 'Categories')}
        {hiddenCount > 0 && (
          <span className="text-[12px] text-textItemBlur">
            ({hiddenCount})
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute end-0 z-20 mt-[8px] w-[min(320px,calc(100vw-40px))] rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[14px] shadow-lg"
          role="dialog"
          aria-label={t('followers_triage_visibility_menu', 'Show or hide categories')}
          data-testid="followers-triage-visibility-menu"
        >
          <div className="flex flex-col gap-[10px]">
            {FOLLOWER_BUILTIN_TRIAGE_SEGMENTS.map((segment) => {
              const checked = !hiddenSlugs.has(segment.slug);
              return (
                <div
                  key={segment.slug}
                  data-testid={`followers-triage-visibility-${segment.slug}`}
                >
                  <Checkbox
                    disableForm={true}
                    checked={checked}
                    label={t(segment.key, segment.defaultLabel)}
                    onChange={() => onToggle(segment.slug)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

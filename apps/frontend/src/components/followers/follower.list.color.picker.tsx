'use client';

import { FC, useState } from 'react';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  FOLLOWER_SEGMENT_COLOR_CLASSES,
  FOLLOWER_SEGMENT_COLOR_OPTIONS,
  FollowerSegmentColor,
} from '@gitroom/frontend/components/followers/follower.segments';

export const FollowerListColorPicker: FC<{
  color?: string | null;
  onChange: (color: FollowerSegmentColor) => void | Promise<void>;
}> = ({ color, onChange }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const activeColor = (color as FollowerSegmentColor | null | undefined) ?? 'neutral';
  const activeClasses = FOLLOWER_SEGMENT_COLOR_CLASSES[activeColor];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          'inline-flex items-center gap-[8px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[10px] py-[6px] text-[13px] text-textItemBlur transition-colors hover:bg-newTableHeader hover:text-newTextColor',
          open && 'border-newTextColor/40 text-newTextColor'
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('followers_list_color', 'List color')}
        data-testid="followers-list-color-button"
      >
        <span
          className={clsx(
            'h-[12px] w-[12px] rounded-full',
            activeClasses.statusDot
          )}
        />
        {t('followers_list_color', 'List color')}
      </button>
      {open && (
        <div
          className="absolute start-0 z-20 mt-[8px] w-[min(280px,calc(100vw-40px))] rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[14px] shadow-lg"
          role="dialog"
          aria-label={t(
            'followers_list_color_menu',
            'Choose a list color'
          )}
          data-testid="followers-list-color-menu"
        >
          <div className="flex flex-wrap gap-[8px]">
            {FOLLOWER_SEGMENT_COLOR_OPTIONS.map((option) => {
              const classes = FOLLOWER_SEGMENT_COLOR_CLASSES[option];
              const selected = option === activeColor;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={async () => {
                    await onChange(option);
                    setOpen(false);
                  }}
                  className={clsx(
                    'inline-flex items-center gap-[6px] rounded-full border px-[10px] py-[4px] text-[12px] transition-colors',
                    classes.border,
                    classes.text,
                    selected && classes.borderSelected,
                    !selected && 'hover:bg-newTableHeader'
                  )}
                  aria-pressed={selected}
                  data-testid={`followers-list-color-${option}`}
                >
                  <span
                    className={clsx(
                      'h-[10px] w-[10px] rounded-full',
                      classes.statusDot
                    )}
                  />
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

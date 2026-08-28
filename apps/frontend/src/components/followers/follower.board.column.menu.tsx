'use client';

import { FC, useState } from 'react';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { MoreIcon } from '@gitroom/frontend/components/ui/icons';
import { FollowerSegmentDefinition } from '@gitroom/frontend/components/followers/follower.segments';
import { useFollowerSegmentHelpModal } from '@gitroom/frontend/components/followers/follower.segment.help.modal';
import { getFollowerSegmentHelpCopy } from '@gitroom/frontend/components/followers/follower.segment.help';

export const FollowerBoardColumnMenu: FC<{
  segment: FollowerSegmentDefinition;
}> = ({ segment }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const helpModal = useFollowerSegmentHelpModal();
  const hasHelp = !!getFollowerSegmentHelpCopy(segment.slug);

  if (!hasHelp) {
    return null;
  }

  const openHelp = () => {
    setOpen(false);
    helpModal.open(segment);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          'inline-flex h-[28px] w-[28px] items-center justify-center rounded-[6px]',
          'text-textItemBlur hover:bg-newTableHeader hover:text-newTextColor',
          open && 'bg-newTableHeader text-newTextColor'
        )}
        aria-label={t(
          'followers_board_column_menu',
          '{{segment}} column menu',
          {
            segment: t(segment.key, segment.defaultLabel),
          }
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="followers-board-column-menu"
      >
        <MoreIcon size={16} />
      </button>
      {open && (
        <div
          className="absolute end-0 z-20 mt-[6px] min-w-[140px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[8px] shadow-lg"
          role="menu"
          aria-label={t(
            'followers_board_column_menu_label',
            '{{segment}} actions',
            { segment: t(segment.key, segment.defaultLabel) }
          )}
          data-testid="followers-board-column-menu-panel"
        >
          <button
            type="button"
            role="menuitem"
            onClick={openHelp}
            className="w-full rounded-[6px] px-[10px] py-[8px] text-start text-[13px] text-newTextColor hover:bg-newBgColor"
            data-testid="followers-board-column-help"
          >
            {t('followers_board_column_help_menu', 'Help')}
          </button>
        </div>
      )}
    </div>
  );
};

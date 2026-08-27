'use client';

import { FC, useEffect } from 'react';
import clsx from 'clsx';
import { CloseIcon } from '@gitroom/frontend/components/ui/icons';
import { SidebarNav } from '@gitroom/frontend/components/new-layout/sidebar-nav';

export const MobileSidebarDrawer: FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div
      className={clsx(
        'fixed inset-0 z-[550] mobile:block hidden',
        !open && 'pointer-events-none'
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        className={clsx(
          'absolute inset-0 bg-primary/80 transition-opacity duration-200',
          open
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        )}
      />
      <aside
        className={clsx(
          'absolute top-0 start-0 z-[551] h-full w-[200px] bg-newBgColorInner rounded-e-[12px] shadow-lg transition-transform duration-200 ease-out flex flex-col',
          open
            ? 'translate-x-0 pointer-events-auto'
            : '-translate-x-full rtl:translate-x-full pointer-events-none'
        )}
      >
        <div className="flex justify-end px-[12px] pt-[8px]">
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="text-textItemBlur hover:text-newTextColor p-[4px]"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-[12px]">
          <SidebarNav onNavigate={onClose} layout="drawer" />
        </div>
      </aside>
    </div>
  );
};

'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import { NavLayout } from '@gitroom/frontend/components/new-layout/menu-item';

export const SidebarNav: FC<{
  onNavigate?: () => void;
  layout?: NavLayout;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}> = ({
  onNavigate,
  layout = 'sidebar',
  collapsed = false,
  onToggleCollapse,
}) => {
  const isDrawer = layout === 'drawer';
  const showCollapseToggle = layout === 'sidebar' && !!onToggleCollapse;

  return (
    <div
      className={clsx(
        'flex h-full min-h-0 flex-col pt-[12px]',
        !showCollapseToggle && 'pb-[8px]'
      )}
    >
      <div
        className={clsx(
          'flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor',
          isDrawer || !collapsed
            ? 'items-stretch px-[8px] gap-[8px]'
            : 'items-center px-[6px] gap-[8px]'
        )}
      >
        <Logo sidebar collapsed={collapsed && !isDrawer} />
        <TopMenu onNavigate={onNavigate} layout={layout} collapsed={collapsed} />
      </div>
      {showCollapseToggle && (
        <div
          className={clsx(
            'w-full shrink-0 flex items-center justify-center pt-[12px]',
            collapsed ? 'px-[6px] pb-[20px]' : 'px-[8px] pb-[20px]'
          )}
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={clsx(
              'text-btnText bg-btnSimple rounded-[6px] w-[24px] h-[24px] flex items-center justify-center cursor-pointer select-none',
              collapsed && 'rotate-[180deg]'
            )}
          >
            <svg width="7" height="13" viewBox="0 0 7 13" fill="none">
              <path
                d="M6 11.5L1 6.5L6 1.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

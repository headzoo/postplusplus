'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import { NavLayout } from '@gitroom/frontend/components/new-layout/menu-item';

export const SidebarNav: FC<{
  onNavigate?: () => void;
  layout?: NavLayout;
}> = ({ onNavigate, layout = 'sidebar' }) => {
  const isDrawer = layout === 'drawer';

  return (
    <div
      className={clsx(
        'flex flex-col h-full flex-1 py-[12px]',
        isDrawer
          ? 'items-stretch px-[8px] gap-[36px]'
          : 'items-center gap-[32px]'
      )}
    >
      <Logo sidebar />
      <TopMenu onNavigate={onNavigate} layout={layout} />
    </div>
  );
};

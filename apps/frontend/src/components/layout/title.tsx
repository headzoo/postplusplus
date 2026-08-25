'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const Title = () => {
  const path = usePathname();
  const t = useT();
  const { all: menuItems } = useMenuItem();
  const currentTitle = useMemo(() => {
    if (path === '/help' || path.startsWith('/help/')) {
      return 'Help';
    }

    return menuItems.find((item) => {
      if (item.path === '/') {
        return path === '/';
      }
      return path === item.path || path.startsWith(`${item.path}/`);
    })?.name;
  }, [path, menuItems]);

  const showFollowersSubtitle =
    path === '/followers' || path.startsWith('/followers/');

  return (
    <div className="flex min-w-0 flex-col gap-[2px]">
      <h1>{currentTitle}</h1>
      {showFollowersSubtitle && (
        <p className="text-[13px] font-normal text-textItemBlur">
          {t(
            'followers_page_subtitle',
            'Understand and strengthen your relationships.'
          )}
        </p>
      )}
    </div>
  );
};

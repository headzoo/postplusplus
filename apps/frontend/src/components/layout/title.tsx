'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
export const Title = () => {
  const path = usePathname();
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

  return <h1>{currentTitle}</h1>;
};

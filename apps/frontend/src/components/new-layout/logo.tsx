'use client';

import Link from 'next/link';

export const Logo = ({
  sidebar = false,
  collapsed: _collapsed = false,
}: {
  sidebar?: boolean;
  collapsed?: boolean;
}) => {
  return (
    <Link
      href="/"
      aria-label="Dashboard"
      className={
        sidebar
          ? 'mt-[8px] mb-[8px] flex w-full shrink-0 items-center justify-center'
          : 'mt-[8px] min-w-[60px] min-h-[60px]'
      }
    >
      <img
        src={sidebar ? '/orange-robot.png' : '/logo-60.png'}
        alt="Post++"
        className={
          sidebar
            ? 'h-[68px] w-[68px] object-contain'
            : 'h-[60px] w-[60px] object-contain'
        }
      />
    </Link>
  );
};

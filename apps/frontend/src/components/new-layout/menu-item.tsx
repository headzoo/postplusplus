'use client';
import { FC, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';

export type NavLayout = 'sidebar' | 'drawer';

export const MenuItem: FC<{
  label: string;
  icon: ReactNode;
  path: string;
  layout?: NavLayout;
  onClick?: () => void;
  onNavigate?: () => void;
}> = ({ label, icon, path, layout = 'sidebar', onClick, onNavigate }) => {
  const currentPath = usePathname();
  // Root path must match exactly; otherwise `/` would mark every route active.
  const isActive =
    path === '/'
      ? currentPath === '/'
      : currentPath === path || currentPath.startsWith(`${path}/`);

  const isDrawer = layout === 'drawer';

  const className = clsx(
    'group w-full font-[600] rounded-[12px] transition-colors',
    isDrawer
      ? 'h-[48px] px-[12px] gap-[12px] flex flex-row items-center justify-start'
      : 'minCustom:h-[54px] custom:h-[44px] py-[8px] px-[6px] minCustom:gap-[4px] custom:gap-[2px] flex flex-col items-center justify-center',
    isActive
      ? 'text-white bg-btnPrimary hover:opacity-90'
      : 'text-textItemBlur hover:text-white hover:bg-btnPrimary'
  );

  const inner = (
    <>
      <div
        className={clsx(
          !isDrawer && 'custom:scale-90 transition-transform'
        )}
      >
        {icon}
      </div>
      <div
        className={clsx(
          'leading-[1.1]',
          isDrawer
            ? 'text-[10px] text-start'
            : 'custom:text-[9px] minCustom:text-[10px] text-center'
        )}
      >
        {label}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={() => {
          onClick();
          onNavigate?.();
        }}
        title={label}
        className={className}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link
      prefetch={true}
      href={path}
      title={label}
      onClick={onNavigate}
      {...(path.indexOf('http') === 0 && { target: '_blank' })}
      className={className}
    >
      {inner}
    </Link>
  );
};

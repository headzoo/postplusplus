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
  collapsed?: boolean;
  onClick?: () => void;
  onNavigate?: () => void;
}> = ({
  label,
  icon,
  path,
  layout = 'sidebar',
  collapsed = false,
  onClick,
  onNavigate,
}) => {
  const currentPath = usePathname();
  // Root path must match exactly; otherwise `/` would mark every route active.
  const isActive =
    path === '/'
      ? currentPath === '/'
      : currentPath === path || currentPath.startsWith(`${path}/`);

  const showLabel = layout === 'drawer' || !collapsed;
  const isIconOnly = layout === 'sidebar' && collapsed;

  const className = clsx(
    'group font-[600] rounded-[12px] transition-colors',
    showLabel
      ? 'w-full h-[48px] px-[12px] gap-[12px] flex flex-row items-center justify-start'
      : 'w-[48px] h-[48px] shrink-0 flex items-center justify-center',
    isActive
      ? 'text-white bg-btnPrimary hover:opacity-90'
      : 'text-textItemBlur hover:text-white hover:bg-btnPrimary'
  );

  const inner = (
    <>
      <div>{icon}</div>
      {showLabel && (
        <div className="leading-[1.1] text-[13px] text-start">{label}</div>
      )}
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

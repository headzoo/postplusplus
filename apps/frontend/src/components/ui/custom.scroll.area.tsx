'use client';

import { CSSProperties, FC, ReactNode, useMemo } from 'react';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import type { OverlayScrollbars } from 'overlayscrollbars';
import clsx from 'clsx';
import 'overlayscrollbars/overlayscrollbars.css';

const SCROLLBAR_OPTIONS = {
  autoHide: 'scroll' as const,
  autoHideDelay: 800,
  theme: 'os-theme-postiz',
};

const getOverflowOptions = (direction: 'vertical' | 'horizontal') =>
  direction === 'horizontal'
    ? { x: 'scroll' as const, y: 'hidden' as const }
    : { x: 'hidden' as const, y: 'scroll' as const };

export const CustomScrollArea: FC<{
  className?: string;
  contentClassName?: string;
  children: ReactNode;
  maxHeight?: string | number;
  direction?: 'vertical' | 'horizontal';
  id?: string;
  'data-testid'?: string;
  onScroll?: (viewport: HTMLElement) => void;
}> = ({
  className,
  contentClassName,
  children,
  maxHeight,
  direction = 'vertical',
  id,
  'data-testid': dataTestId,
  onScroll,
}) => {
  const style = useMemo<CSSProperties | undefined>(
    () => (maxHeight ? { maxHeight } : undefined),
    [maxHeight]
  );

  const options = useMemo(
    () => ({
      overflow: getOverflowOptions(direction),
      scrollbars: SCROLLBAR_OPTIONS,
    }),
    [direction]
  );

  return (
    <OverlayScrollbarsComponent
      defer
      id={id}
      data-testid={dataTestId}
      className={clsx(
        'min-h-0',
        direction === 'horizontal' && 'h-full [&_.os-viewport]:h-full',
        className
      )}
      style={style}
      options={options}
      events={
        onScroll
          ? {
              scroll: (instance: OverlayScrollbars) => {
                onScroll(instance.elements().viewport);
              },
            }
          : undefined
      }
    >
      {contentClassName ? (
        <div className={contentClassName}>{children}</div>
      ) : (
        children
      )}
    </OverlayScrollbarsComponent>
  );
};

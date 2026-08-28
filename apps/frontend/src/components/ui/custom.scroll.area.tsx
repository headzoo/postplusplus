'use client';

import { CSSProperties, FC, MutableRefObject, ReactNode, useMemo } from 'react';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import type { OverlayScrollbars } from 'overlayscrollbars';
import clsx from 'clsx';
import 'overlayscrollbars/overlayscrollbars.css';

type ScrollbarAutoHide = 'never' | 'scroll' | 'leave' | 'move';

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
  autoHide?: ScrollbarAutoHide;
  viewportRef?: MutableRefObject<HTMLElement | null>;
  id?: string;
  'data-testid'?: string;
  onScroll?: (viewport: HTMLElement) => void;
}> = ({
  className,
  contentClassName,
  children,
  maxHeight,
  direction = 'vertical',
  autoHide = 'scroll',
  viewportRef,
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
      scrollbars: {
        autoHide,
        autoHideDelay: 800,
        theme: 'os-theme-postiz',
      },
    }),
    [autoHide, direction]
  );

  const events = useMemo(
    () => ({
      initialized: (instance: OverlayScrollbars) => {
        if (viewportRef) {
          viewportRef.current = instance.elements().viewport;
        }
      },
      destroyed: () => {
        if (viewportRef) {
          viewportRef.current = null;
        }
      },
      ...(onScroll
        ? {
            scroll: (instance: OverlayScrollbars) => {
              onScroll(instance.elements().viewport);
            },
          }
        : {}),
    }),
    [onScroll, viewportRef]
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
      events={events}
    >
      {contentClassName ? (
        <div className={contentClassName}>{children}</div>
      ) : (
        children
      )}
    </OverlayScrollbarsComponent>
  );
};

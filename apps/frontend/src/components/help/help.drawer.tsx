'use client';

import {
  FC,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { CloseIcon } from '@gitroom/frontend/components/ui/icons';
import { HelpContent } from './help-content';
import { HelpHistoryEntry } from './help.types';
import {
  clearHelpUrl,
  readHelpFromLocation,
  readLocationHash,
  syncHelpUrl,
} from './help.url';
import {
  clampHelpDrawerWidth,
  getStoredHelpDrawerWidth,
  HELP_DRAWER_MOBILE_MEDIA,
  setStoredHelpDrawerWidth,
} from './help.drawer.width';

export const HelpDrawer: FC<{
  open: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  locationKey?: string;
}> = ({ open, onClose, triggerRef, locationKey }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const hostHashRef = useRef<string | null>(null);
  const internalUrlRef = useRef<string | null>(null);
  const panelWidthRef = useRef(getStoredHelpDrawerWidth());
  const resizingRef = useRef(false);
  const [deepLink, setDeepLink] = useState<{
    slug: string | null;
    hash: string | null;
  }>({ slug: null, hash: null });
  const [initialized, setInitialized] = useState(false);
  const [panelWidth, setPanelWidth] = useState(getStoredHelpDrawerWidth);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(HELP_DRAWER_MOBILE_MEDIA).matches;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    const media = window.matchMedia(HELP_DRAWER_MOBILE_MEDIA);
    const syncMobile = () => setIsMobileViewport(media.matches);
    syncMobile();
    media.addEventListener('change', syncMobile);
    return () => media.removeEventListener('change', syncMobile);
  }, []);

  const handleClose = useCallback(() => {
    internalUrlRef.current = clearHelpUrl(hostHashRef.current);
    onClose();
  }, [onClose]);

  const handleEntryChange = useCallback((entry: HelpHistoryEntry | null) => {
    if (entry) {
      internalUrlRef.current = syncHelpUrl(entry);
      return;
    }

    internalUrlRef.current = clearHelpUrl(hostHashRef.current);
  }, []);

  const handleResizePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
    ) => {
      if (isMobileViewport || event.button !== 0 || resizingRef.current) {
        return;
      }

      event.preventDefault();
      const handle = event.currentTarget;
      const startX = event.clientX;
      const startWidth = panelWidthRef.current;
      const isRtl = document.documentElement.dir === 'rtl';
      const previousUserSelect = document.body.style.userSelect;
      const pointerId =
        'pointerId' in event && typeof event.pointerId === 'number'
          ? event.pointerId
          : undefined;

      resizingRef.current = true;
      setIsResizing(true);
      document.body.style.userSelect = 'none';
      if (pointerId !== undefined) {
        try {
          handle.setPointerCapture(pointerId);
        } catch {
          // jsdom and some browsers may not support pointer capture
        }
      }

      const onMove = (moveEvent: PointerEvent | MouseEvent) => {
        const delta = isRtl
          ? moveEvent.clientX - startX
          : startX - moveEvent.clientX;
        const nextWidth = clampHelpDrawerWidth(startWidth + delta);
        panelWidthRef.current = nextWidth;
        setPanelWidth(nextWidth);
      };

      const onUp = (upEvent: PointerEvent | MouseEvent) => {
        if (
          pointerId !== undefined &&
          'pointerId' in upEvent &&
          upEvent.pointerId === pointerId
        ) {
          try {
            handle.releasePointerCapture(pointerId);
          } catch {
            // ignore unsupported pointer capture
          }
        }
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = previousUserSelect;
        resizingRef.current = false;
        setIsResizing(false);
        setStoredHelpDrawerWidth(panelWidthRef.current);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [isMobileViewport]
  );

  useEffect(() => {
    if (!open) {
      setDeepLink({ slug: null, hash: null });
      setInitialized(false);
      return;
    }

    const locationHelp = readHelpFromLocation(window.location);
    internalUrlRef.current = null;
    hostHashRef.current = locationHelp.slug
      ? null
      : readLocationHash(window.location);
    setDeepLink(locationHelp);
    setInitialized(true);
    closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateDeepLink = () => {
      const locationHelp = readHelpFromLocation(window.location);
      if (!locationHelp.slug) {
        hostHashRef.current = readLocationHash(window.location);
      }
      setDeepLink(locationHelp);
      setInitialized(true);
    };

    window.addEventListener('popstate', updateDeepLink);
    window.addEventListener('hashchange', updateDeepLink);
    return () => {
      window.removeEventListener('popstate', updateDeepLink);
      window.removeEventListener('hashchange', updateDeepLink);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !locationKey) {
      return;
    }

    if (internalUrlRef.current === window.location.href) {
      internalUrlRef.current = null;
      return;
    }

    const locationHelp = readHelpFromLocation(window.location);
    if (!locationHelp.slug) {
      hostHashRef.current = readLocationHash(window.location);
    }
    setDeepLink(locationHelp);
    setInitialized(true);
  }, [open, locationKey]);

  useEffect(() => {
    if (open || !triggerRef?.current) {
      return;
    }

    triggerRef.current.focus();
  }, [open, triggerRef]);

  return (
    <div
      className={clsx('fixed inset-0 z-[560]', !open && 'pointer-events-none')}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close help"
        onClick={handleClose}
        tabIndex={open ? 0 : -1}
        className={clsx(
          'absolute inset-0 bg-primary/80 transition-opacity duration-200',
          open
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        )}
      />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-drawer-title"
        style={isMobileViewport ? undefined : { width: panelWidth }}
        className={clsx(
          'absolute top-0 end-0 z-[561] flex h-full flex-col rounded-s-[12px] border-s border-newSep bg-newColColor text-base shadow-menu transition-transform duration-200 ease-out mobile:w-full mobile:min-w-0 mobile:max-w-none mobile:rounded-none',
          isResizing && 'select-none',
          open
            ? 'translate-x-0 pointer-events-auto'
            : 'translate-x-full rtl:-translate-x-full pointer-events-none'
        )}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize help panel"
          tabIndex={open && !isMobileViewport ? 0 : -1}
          onPointerDown={handleResizePointerDown}
          onMouseDown={handleResizePointerDown}
          className={clsx(
            'absolute start-0 top-0 z-[1] h-full w-[6px] -translate-x-1/2 cursor-col-resize touch-none mobile:hidden',
            'bg-transparent hover:bg-newSep/60',
            isResizing && 'bg-newSep/60'
          )}
        />
        <div className="flex items-center justify-between border-b border-newTableBorder px-4 py-3">
          <h2
            id="help-drawer-title"
            className="text-base font-semibold text-textColor"
          >
            Help
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close help"
            onClick={handleClose}
            tabIndex={open ? 0 : -1}
            className="text-textItemBlur hover:text-newTextColor p-[4px]"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        <HelpContent
          open={open}
          initialSlug={deepLink.slug}
          initialHash={deepLink.hash}
          initialized={initialized}
          onEntryChange={handleEntryChange}
        />
      </aside>
    </div>
  );
};

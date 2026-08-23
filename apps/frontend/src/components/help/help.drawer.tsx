'use client';

import {
  FC,
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
  const [deepLink, setDeepLink] = useState<{
    slug: string | null;
    hash: string | null;
  }>({ slug: null, hash: null });
  const [initialized, setInitialized] = useState(false);

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

  useEffect(() => {
    if (!open) {
      setDeepLink({ slug: null, hash: null });
      setInitialized(false);
      return;
    }

    const locationHelp = readHelpFromLocation(window.location);
    internalUrlRef.current = null;
    hostHashRef.current = locationHelp.slug ? null : readLocationHash(window.location);
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
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-drawer-title"
        className={clsx(
          'absolute top-0 end-0 z-[561] flex h-full w-[35vw] min-w-[280px] max-w-[520px] flex-col bg-newBgColorInner text-base shadow-lg transition-transform duration-200 ease-out mobile:w-full mobile:min-w-0 mobile:max-w-none',
          open
            ? 'translate-x-0 pointer-events-auto'
            : 'translate-x-full rtl:-translate-x-full pointer-events-none'
        )}
      >
        <div className="flex items-center justify-between border-b border-newTableBorder px-4 py-3">
          <h2 id="help-drawer-title" className="text-base font-semibold text-textColor">
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

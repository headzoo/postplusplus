'use client';

import {
  FC,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useCopilotChat,
  useCopilotMessagesContext,
} from '@copilotkit/react-core';
import { useChatContext } from '@copilotkit/react-ui';
import type { WindowProps } from '@copilotkit/react-ui/dist/components/chat/props';
import { isMacOS } from '@copilotkit/shared';
import clsx from 'clsx';
import {
  CornerResizeIcon,
  TrashIcon,
} from '@gitroom/frontend/components/ui/icons';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  clampCopilotPopupSize,
  COPILOT_POPUP_MOBILE_MEDIA,
  getStoredCopilotPopupSize,
  setStoredCopilotPopupSize,
  type CopilotPopupSize,
} from './copilot.assistant.popup.size';

const preventScroll = (event: TouchEvent): void => {
  let targetElement = event.target as Element;

  const hasParentWithClass = (element: Element, className: string): boolean => {
    while (element && element !== document.body) {
      if (element.classList.contains(className)) {
        return true;
      }
      element = element.parentElement!;
    }
    return false;
  };

  if (!hasParentWithClass(targetElement, 'copilotKitMessages')) {
    event.preventDefault();
  }
};

export const CopilotClearChatButton: FC = () => {
  const t = useT();
  const { messages } = useCopilotMessagesContext();
  const { reset, stopGeneration, isLoading } = useCopilotChat();

  if (messages.length === 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (isLoading) {
          stopGeneration();
        }
        reset();
      }}
      aria-label={t('clear_chat', 'Clear chat')}
      className={clsx(
        'absolute top-[64px] start-3 z-[11]',
        'inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border',
        'border-newTableBorder bg-newBgColorInner text-textItemBlur',
        'hover:border-newTextColor/40 hover:text-newTextColor'
      )}
    >
      <TrashIcon size={14} />
    </button>
  );
};

export type ResizableCopilotWindowProps = WindowProps & {
  showClearChat?: boolean;
};

export const ResizableCopilotWindow: FC<ResizableCopilotWindowProps> = ({
  children,
  clickOutsideToClose,
  shortcut,
  hitEscapeToClose,
  showClearChat = false,
}) => {
  const windowRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<CopilotPopupSize>(getStoredCopilotPopupSize());
  const resizingRef = useRef(false);
  const { open, setOpen } = useChatContext();
  const [size, setSize] = useState<CopilotPopupSize>(getStoredCopilotPopupSize);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(COPILOT_POPUP_MOBILE_MEDIA).matches;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    const media = window.matchMedia(COPILOT_POPUP_MOBILE_MEDIA);
    const syncMobile = () => setIsMobileViewport(media.matches);
    syncMobile();
    media.addEventListener('change', syncMobile);
    return () => media.removeEventListener('change', syncMobile);
  }, []);

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (!clickOutsideToClose) {
        return;
      }

      const parentElement = windowRef.current?.parentElement;
      const target = event.target as Node | null;
      const helpDrawer =
        target instanceof Element ? target.closest('[data-help-drawer]') : null;

      let className = '';
      if (event.target instanceof HTMLElement) {
        className = event.target.className;
      }

      if (
        open &&
        parentElement &&
        !parentElement.contains(target as Node) &&
        !helpDrawer &&
        !className.includes('copilotKitDebugMenu')
      ) {
        setOpen(false);
      }
    },
    [clickOutsideToClose, open, setOpen]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      const isDescendantOfWrapper = windowRef.current?.contains(target);

      if (
        open &&
        event.key === 'Escape' &&
        (!isInput || isDescendantOfWrapper) &&
        hitEscapeToClose
      ) {
        setOpen(false);
      } else if (
        event.key === shortcut &&
        ((isMacOS() && event.metaKey) || (!isMacOS() && event.ctrlKey)) &&
        (!isInput || isDescendantOfWrapper)
      ) {
        setOpen(!open);
      }
    },
    [hitEscapeToClose, shortcut, open, setOpen]
  );

  const adjustForMobile = useCallback(() => {
    const copilotKitWindow = windowRef.current;
    const vv = window.visualViewport;
    if (!copilotKitWindow || !vv) {
      return;
    }

    if (window.innerWidth < 640 && open) {
      copilotKitWindow.style.height = `${vv.height}px`;
      copilotKitWindow.style.width = '';
      copilotKitWindow.style.left = `${vv.offsetLeft}px`;
      copilotKitWindow.style.top = `${vv.offsetTop}px`;

      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = `${window.innerHeight}px`;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';

      document.body.addEventListener('touchmove', preventScroll, {
        passive: false,
      });
    } else {
      const nextSize = sizeRef.current;
      copilotKitWindow.style.width = `${nextSize.width}px`;
      copilotKitWindow.style.height = `${nextSize.height}px`;
      copilotKitWindow.style.left = '';
      copilotKitWindow.style.top = '';
      document.body.style.position = '';
      document.body.style.height = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.body.style.top = '';
      document.body.style.touchAction = '';

      document.body.removeEventListener('touchmove', preventScroll);
    }
  }, [open]);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', adjustForMobile);
      adjustForMobile();
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', adjustForMobile);
      }
    };
  }, [adjustForMobile, handleClickOutside, handleKeyDown]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<Element> | ReactMouseEvent<Element>) => {
      if (isMobileViewport || event.button !== 0 || resizingRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      const startX = event.clientX;
      const startY = event.clientY;
      const startSize = sizeRef.current;
      const isRtl = document.documentElement.dir === 'rtl';
      const previousUserSelect = document.body.style.userSelect;
      const pointerId =
        'pointerId' in event && typeof event.pointerId === 'number'
          ? event.pointerId
          : undefined;

      resizingRef.current = true;
      setIsResizing(true);
      document.body.style.userSelect = 'none';
      if (pointerId !== undefined && 'setPointerCapture' in handle) {
        try {
          (handle as Element).setPointerCapture(pointerId);
        } catch {
          // jsdom and some browsers may not support pointer capture
        }
      }

      const onMove = (moveEvent: PointerEvent | MouseEvent) => {
        const widthDelta = isRtl
          ? moveEvent.clientX - startX
          : startX - moveEvent.clientX;
        const heightDelta = startY - moveEvent.clientY;
        const nextSize = clampCopilotPopupSize({
          width: startSize.width + widthDelta,
          height: startSize.height + heightDelta,
        });
        sizeRef.current = nextSize;
        setSize(nextSize);
      };

      const onUp = (upEvent: PointerEvent | MouseEvent) => {
        if (
          pointerId !== undefined &&
          'pointerId' in upEvent &&
          upEvent.pointerId === pointerId &&
          'releasePointerCapture' in handle
        ) {
          try {
            (handle as Element).releasePointerCapture(pointerId);
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
        setStoredCopilotPopupSize(sizeRef.current);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [isMobileViewport]
  );

  return (
    <div
      className={clsx(
        'copilotKitWindow',
        open && 'open',
        isResizing && 'select-none'
      )}
      ref={windowRef}
      style={
        isMobileViewport
          ? undefined
          : { width: size.width, height: size.height }
      }
    >
      {!isMobileViewport && (
        <CornerResizeIcon
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize assistant panel"
          tabIndex={open ? 0 : -1}
          size={16}
          onPointerDown={handleResizePointerDown}
          onMouseDown={handleResizePointerDown}
          className={clsx(
            'z-[10] absolute start-0 top-0 touch-none text-textItemBlur',
            'cursor-nwse-resize rtl:cursor-nesw-resize',
            'opacity-80 hover:opacity-100',
            isResizing && 'opacity-100'
          )}
        />
      )}
      {children}
      {showClearChat && <CopilotClearChatButton />}
    </div>
  );
};

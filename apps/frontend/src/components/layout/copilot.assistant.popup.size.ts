export const COPILOT_POPUP_SIZE_KEY = 'postiz-copilot-popup-size';
export const COPILOT_POPUP_MIN_WIDTH = 320;
export const COPILOT_POPUP_MIN_HEIGHT = 200;
export const COPILOT_POPUP_DEFAULT_WIDTH = 384;
export const COPILOT_POPUP_DEFAULT_HEIGHT = 600;
/** Matches CopilotKit's desktop breakpoint (`min-width: 640px`). */
export const COPILOT_POPUP_MOBILE_MEDIA = '(max-width: 639px)';

export type CopilotPopupSize = {
  width: number;
  height: number;
};

/** Soft floor when window is unavailable (SSR); live clamp uses the viewport. */
export const getCopilotPopupMaxWidth = (): number => {
  if (typeof window === 'undefined') {
    return Number.MAX_SAFE_INTEGER;
  }

  // CopilotKit positions the window with `right: 1rem` on desktop.
  return Math.max(COPILOT_POPUP_MIN_WIDTH, window.innerWidth - 16);
};

export const getCopilotPopupMaxHeight = (): number => {
  if (typeof window === 'undefined') {
    return Number.MAX_SAFE_INTEGER;
  }

  // CopilotKit uses `bottom: 5rem`, `margin-bottom: 1rem`, and `max-height: calc(100% - 6rem)`.
  return Math.max(COPILOT_POPUP_MIN_HEIGHT, window.innerHeight - 96);
};

export const clampCopilotPopupSize = (
  size: CopilotPopupSize
): CopilotPopupSize => ({
  width: Math.round(
    Math.min(
      getCopilotPopupMaxWidth(),
      Math.max(COPILOT_POPUP_MIN_WIDTH, size.width)
    )
  ),
  height: Math.round(
    Math.min(
      getCopilotPopupMaxHeight(),
      Math.max(COPILOT_POPUP_MIN_HEIGHT, size.height)
    )
  ),
});

export const getDefaultCopilotPopupSize = (): CopilotPopupSize =>
  clampCopilotPopupSize({
    width: COPILOT_POPUP_DEFAULT_WIDTH,
    height: COPILOT_POPUP_DEFAULT_HEIGHT,
  });

export const getStoredCopilotPopupSize = (): CopilotPopupSize => {
  if (typeof window === 'undefined') {
    return {
      width: COPILOT_POPUP_DEFAULT_WIDTH,
      height: COPILOT_POPUP_DEFAULT_HEIGHT,
    };
  }

  const stored = localStorage.getItem(COPILOT_POPUP_SIZE_KEY);
  if (!stored) {
    return getDefaultCopilotPopupSize();
  }

  try {
    const parsed = JSON.parse(stored) as Partial<CopilotPopupSize>;
    if (!Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) {
      return getDefaultCopilotPopupSize();
    }

    return clampCopilotPopupSize({
      width: parsed.width as number,
      height: parsed.height as number,
    });
  } catch {
    return getDefaultCopilotPopupSize();
  }
};

export const setStoredCopilotPopupSize = (size: CopilotPopupSize) => {
  if (typeof window === 'undefined') {
    return;
  }

  const clamped = clampCopilotPopupSize(size);
  localStorage.setItem(COPILOT_POPUP_SIZE_KEY, JSON.stringify(clamped));
};

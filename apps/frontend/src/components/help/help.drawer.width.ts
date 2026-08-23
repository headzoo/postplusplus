export const HELP_DRAWER_WIDTH_KEY = 'postiz-help-drawer-width';
export const HELP_DRAWER_MIN_WIDTH = 280;
export const HELP_DRAWER_MOBILE_MEDIA = '(max-width: 1025px)';

/** Soft floor when window is unavailable (SSR); live clamp uses the viewport. */
export const getHelpDrawerMaxWidth = (): number => {
  if (typeof window === 'undefined') {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.max(HELP_DRAWER_MIN_WIDTH, window.innerWidth);
};

export const clampHelpDrawerWidth = (width: number): number =>
  Math.round(
    Math.min(getHelpDrawerMaxWidth(), Math.max(HELP_DRAWER_MIN_WIDTH, width))
  );

export const getDefaultHelpDrawerWidth = (): number => {
  if (typeof window === 'undefined') {
    return HELP_DRAWER_MIN_WIDTH;
  }

  return clampHelpDrawerWidth(window.innerWidth * 0.35);
};

export const getStoredHelpDrawerWidth = (): number => {
  if (typeof window === 'undefined') {
    return HELP_DRAWER_MIN_WIDTH;
  }

  const stored = localStorage.getItem(HELP_DRAWER_WIDTH_KEY);
  if (!stored) {
    return getDefaultHelpDrawerWidth();
  }

  const parsed = Number.parseInt(stored, 10);
  if (!Number.isFinite(parsed)) {
    return getDefaultHelpDrawerWidth();
  }

  return clampHelpDrawerWidth(parsed);
};

export const setStoredHelpDrawerWidth = (width: number) => {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(
    HELP_DRAWER_WIDTH_KEY,
    String(clampHelpDrawerWidth(width))
  );
};

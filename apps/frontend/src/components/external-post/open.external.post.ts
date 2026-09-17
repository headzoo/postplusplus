'use client';

export const EXTERNAL_POST_TAB_NAME = 'postplusplus-external-post';

let externalPostTab: Window | null = null;

export const isSafeHttpUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const openExternalPost = (url: string) => {
  if (!isSafeHttpUrl(url)) return;

  if (externalPostTab && !externalPostTab.closed) {
    try {
      externalPostTab.location.href = url;
      externalPostTab.focus();
      return;
    } catch {
      // Cross-origin destinations like x.com can block location writes.
      // A named window.open still reuses the tab when the browser allows it.
    }
  }

  externalPostTab = window.open(url, EXTERNAL_POST_TAB_NAME);
  externalPostTab?.focus();
};

export const openExternalPostFromAnchor = (
  event: { preventDefault(): void; stopPropagation(): void },
  url: string
) => {
  event.preventDefault();
  event.stopPropagation();
  openExternalPost(url);
};

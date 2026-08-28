'use client';

const EXTERNAL_POST_TAB_NAME = 'postplusplus-external-post';

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
    externalPostTab.location.href = url;
    externalPostTab.focus();
    return;
  }

  externalPostTab = window.open(url, EXTERNAL_POST_TAB_NAME);
  externalPostTab?.focus();
};

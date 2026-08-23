'use client';

import { HelpHistoryEntry } from './help.types';

export const readHelpFromLocation = (
  location: Pick<Location, 'search' | 'hash'>
): { slug: string | null; hash: string | null } => {
  const params = new URLSearchParams(location.search);
  const slug = params.get('help');
  if (!slug) {
    return { slug: null, hash: null };
  }

  const hash = location.hash ? location.hash.slice(1) : null;
  return { slug, hash };
};

export const readLocationHash = (location: Pick<Location, 'hash'>) =>
  location.hash ? location.hash.slice(1) : null;

export const syncHelpUrl = (entry: HelpHistoryEntry | null) => {
  if (typeof window === 'undefined') {
    return null;
  }

  const url = new URL(window.location.href);
  if (entry?.slug) {
    url.searchParams.set('help', entry.slug);
    url.hash = entry.hash ? `#${entry.hash}` : '';
  } else {
    url.searchParams.delete('help');
  }

  window.history.replaceState(window.history.state, '', url.toString());
  return url.toString();
};

export const clearHelpUrl = (hostHash?: string | null) => {
  if (typeof window === 'undefined') {
    return null;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('help');
  url.hash = hostHash ? `#${hostHash}` : '';
  window.history.replaceState(window.history.state, '', url.toString());
  return url.toString();
};

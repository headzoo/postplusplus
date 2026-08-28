'use client';

import { useMemo } from 'react';
import {
  createHelpSearchIndex,
  searchHelpManifest,
} from '@gitroom/nestjs-libraries/help/help.search';
import { HelpArticle, HelpManifest } from './help.types';

export const useHelpSearch = (
  manifest: HelpManifest | undefined,
  query: string
): HelpArticle[] => {
  const index = useMemo(() => {
    if (!manifest) {
      return null;
    }

    return createHelpSearchIndex(manifest);
  }, [manifest]);

  return useMemo(() => {
    if (!manifest) {
      return [];
    }

    return searchHelpManifest(manifest, query, index ?? undefined);
  }, [index, manifest, query]);
};

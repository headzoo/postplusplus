'use client';

import { useMemo } from 'react';
import MiniSearch from 'minisearch';
import { HelpArticle, HelpManifest } from './help.types';

type SearchDocument = Pick<HelpArticle, 'slug' | 'title' | 'excerpt'> & {
  headingText: string;
};

const topicSort = (left: HelpArticle, right: HelpArticle) =>
  left.title.localeCompare(right.title);

export const useHelpSearch = (
  manifest: HelpManifest | undefined,
  query: string
): HelpArticle[] => {
  const index = useMemo(() => {
    if (!manifest) {
      return null;
    }

    const search = new MiniSearch<SearchDocument>({
      fields: ['title', 'headingText', 'excerpt'],
      storeFields: ['slug', 'title', 'excerpt'],
      idField: 'slug',
      searchOptions: {
        boost: { title: 4, headingText: 2, excerpt: 1 },
        prefix: true,
        fuzzy: 0.2,
      },
    });

    search.addAll(
      manifest.pages.map((article) => ({
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        headingText: article.headingText,
      }))
    );

    return search;
  }, [manifest]);

  return useMemo(() => {
    if (!manifest) {
      return [];
    }

    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [...manifest.pages].sort(topicSort);
    }

    const pagesBySlug = new Map(
      manifest.pages.map((article) => [article.slug, article])
    );
    return (
      index
        ?.search(normalizedQuery)
        .map((result) => pagesBySlug.get(result.slug))
        .filter((article): article is HelpArticle => Boolean(article)) ?? []
    );
  }, [index, manifest, query]);
};

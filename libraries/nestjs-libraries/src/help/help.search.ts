import MiniSearch from 'minisearch';
import type { HelpArticle, HelpManifest } from './help.types';

export type HelpSearchDocument = Pick<
  HelpArticle,
  'slug' | 'title' | 'excerpt'
> & {
  headingText: string;
};

export const HELP_SEARCH_OPTIONS = {
  fields: ['title', 'headingText', 'excerpt'] as const,
  storeFields: ['slug', 'title', 'excerpt'] as const,
  idField: 'slug' as const,
  searchOptions: {
    boost: { title: 4, headingText: 2, excerpt: 1 },
    prefix: true,
    fuzzy: 0.2,
  },
};

export const topicSort = (left: HelpArticle, right: HelpArticle) =>
  left.title.localeCompare(right.title);

export const createHelpSearchIndex = (manifest: HelpManifest) => {
  const search = new MiniSearch<HelpSearchDocument>({
    fields: [...HELP_SEARCH_OPTIONS.fields],
    storeFields: [...HELP_SEARCH_OPTIONS.storeFields],
    idField: HELP_SEARCH_OPTIONS.idField,
    searchOptions: HELP_SEARCH_OPTIONS.searchOptions,
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
};

export const searchHelpManifest = (
  manifest: HelpManifest,
  query: string,
  index?: MiniSearch<HelpSearchDocument>
): HelpArticle[] => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [...manifest.pages].sort(topicSort);
  }

  const pagesBySlug = new Map(
    manifest.pages.map((article) => [article.slug, article])
  );
  const searchIndex = index ?? createHelpSearchIndex(manifest);

  return searchIndex
    .search(normalizedQuery)
    .map((result) => pagesBySlug.get(result.slug))
    .filter((article): article is HelpArticle => Boolean(article));
};

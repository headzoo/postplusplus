'use client';

import { useEffect, useRef, useState } from 'react';
import { HelpMarkdown } from './help.markdown';
import { HelpHistoryEntry } from './help.types';
import { useHelpManifest } from './use.help.manifest';
import { useHelpSearch } from './use.help.search';

interface HelpContentProps {
  open: boolean;
  initialSlug?: string | null;
  initialHash?: string | null;
  initialized?: boolean;
  onEntryChange?: (entry: HelpHistoryEntry | null) => void;
}

const sameEntry = (left: HelpHistoryEntry, right: HelpHistoryEntry) =>
  left.slug === right.slug && left.hash === right.hash;

export const HelpContent = ({
  open,
  initialSlug,
  initialHash,
  initialized = true,
  onEntryChange,
}: HelpContentProps) => {
  const { data: manifest, error, isLoading } = useHelpManifest(open);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<HelpHistoryEntry[]>([]);
  const [staleSlugNotice, setStaleSlugNotice] = useState(false);
  const appliedDeepLinkRef = useRef<string | null>(null);
  const awaitingDeepLinkRef = useRef(false);
  const hasOpenedArticleRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topics = useHelpSearch(manifest, query);
  const current = history.at(-1);
  const article = manifest?.pages.find((page) => page.slug === current?.slug);
  const invalidFragment =
    !!current?.hash &&
    !!article &&
    !article.headings.some((heading) => heading.anchor === current.hash);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHistory([]);
      setStaleSlugNotice(false);
      appliedDeepLinkRef.current = null;
      awaitingDeepLinkRef.current = false;
      hasOpenedArticleRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialized || !manifest || isLoading) {
      return;
    }

    const deepLink = `${initialSlug ?? ''}#${initialHash ?? ''}`;
    if (appliedDeepLinkRef.current === deepLink) {
      return;
    }

    appliedDeepLinkRef.current = deepLink;
    if (!initialSlug) {
      awaitingDeepLinkRef.current = history.length > 0;
      setHistory([]);
      setStaleSlugNotice(false);
      return;
    }

    const page = manifest.pages.find((page) => page.slug === initialSlug);
    if (page) {
      awaitingDeepLinkRef.current = true;
      hasOpenedArticleRef.current = true;
      setHistory([{ slug: initialSlug, hash: initialHash || undefined }]);
      return;
    }

    awaitingDeepLinkRef.current = false;
    setHistory([]);
    setStaleSlugNotice(true);
  }, [open, initialized, manifest, isLoading, initialSlug, initialHash, history.length]);

  useEffect(() => {
    if (!open || !initialized) {
      return;
    }

    if (awaitingDeepLinkRef.current) {
      const deepLinkApplied = initialSlug
        ? current?.slug === initialSlug && current.hash === (initialHash || undefined)
        : !current;
      if (!deepLinkApplied) {
        return;
      }

      awaitingDeepLinkRef.current = false;
    }

    if (initialSlug && appliedDeepLinkRef.current !== `${initialSlug}#${initialHash ?? ''}`) {
      return;
    }

    if (current) {
      hasOpenedArticleRef.current = true;
      onEntryChange?.(current);
    } else if (hasOpenedArticleRef.current) {
      onEntryChange?.(null);
    }
  }, [open, initialized, current, onEntryChange, initialSlug, initialHash]);

  if (!open) {
    return null;
  }

  const pushArticle = (entry: HelpHistoryEntry) => {
    setHistory((previous) => {
      const currentEntry = previous.at(-1);
      if (currentEntry && sameEntry(currentEntry, entry)) {
        return previous;
      }

      if (currentEntry?.slug === entry.slug) {
        return [...previous.slice(0, -1), entry];
      }

      return [...previous, entry];
    });
  };

  const updateHash = (hash: string) => {
    if (!current) {
      return;
    }

    setHistory((previous) => [
      ...previous.slice(0, -1),
      { slug: current.slug, hash },
    ]);
  };

  return (
    <section aria-label="Help" className="flex min-h-0 flex-1 flex-col">
      {current ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center border-b border-newTableBorder px-4 py-3">
            <button
              type="button"
              className="text-base text-textColor underline"
              onClick={() => setHistory((previous) => previous.slice(0, -1))}
            >
              Back
            </button>
            <span className="ml-3 truncate text-base font-semibold text-textColor">
              {article?.title ?? 'Help topic'}
            </span>
          </div>
          <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto p-4">
            {invalidFragment && (
              <p role="alert" className="mb-3 text-base text-textColor">
                That section could not be found in this article.
              </p>
            )}
            {article ? (
              <HelpMarkdown
                article={article}
                hash={current.hash}
                scrollContainerRef={scrollContainerRef}
                onNavigate={(slug, hash) => pushArticle({ slug, hash })}
                onHashChange={updateHash}
              />
            ) : (
              <div role="alert" className="text-base text-textColor">
                This help topic could not be found.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          {staleSlugNotice && (
            <p role="alert" className="mb-3 text-base text-textColor">
              That help topic could not be found.
            </p>
          )}
          <label htmlFor="help-search" className="mb-2 text-base font-semibold text-textColor">
            Search help
          </label>
          <input
            id="help-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search topics"
            className="mb-4 w-full rounded border border-newTableBorder bg-newBgColor px-3 py-2 text-base text-textColor"
          />
          {isLoading && <p className="text-base text-textColor">Loading help…</p>}
          {error && (
            <p role="alert" className="text-base text-textColor">
              Help content could not be loaded. Please try again.
            </p>
          )}
          {!isLoading && !error && topics.length === 0 && (
            <p className="text-base text-textColor">No help topics found.</p>
          )}
          {!isLoading && !error && topics.length > 0 && (
            <ul className="min-h-0 space-y-2 overflow-y-auto">
              {topics.map((topic) => (
                <li key={topic.slug}>
                  <button
                    type="button"
                    className="w-full rounded border border-newTableBorder p-3 text-left hover:bg-newBgColor"
                    onClick={() => pushArticle({ slug: topic.slug })}
                  >
                    <span className="block text-base font-semibold text-textColor">
                      {topic.title}
                    </span>
                    <span className="mt-1 block text-sm text-gray-500">{topic.excerpt}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

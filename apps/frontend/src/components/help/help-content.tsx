'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { Button } from '@gitroom/react/form/button';
import { CustomScrollArea } from '@gitroom/frontend/components/ui/custom.scroll.area';
import { SearchIcon } from '@gitroom/frontend/components/ui/icons';
import type { HelpPageContext } from '@gitroom/nestjs-libraries/help/help.types';
import { HelpCatalog, HelpCenterCta } from './help.catalog';
import { HelpMarkdown } from './help.markdown';
import { HelpHistoryEntry } from './help.types';
import { useCopilotHelpPageProperties } from './use.copilot.help.page';
import { useHelpManifest } from './use.help.manifest';
import { useHelpSearch } from './use.help.search';

interface HelpContentProps {
  open: boolean;
  initialSlug?: string | null;
  initialHash?: string | null;
  initialized?: boolean;
  onEntryChange?: (entry: HelpHistoryEntry | null) => void;
  onArticleTitleChange?: (title: string | null) => void;
}

const sameEntry = (left: HelpHistoryEntry, right: HelpHistoryEntry) =>
  left.slug === right.slug && left.hash === right.hash;

const helpInnerCardClassName =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] bg-[#FFFFFF] dark:bg-[#000000]';

export const HelpContent = ({
  open,
  initialSlug,
  initialHash,
  initialized = true,
  onEntryChange,
  onArticleTitleChange,
}: HelpContentProps) => {
  const { data: manifest, error, isLoading } = useHelpManifest(open);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<HelpHistoryEntry[]>([]);
  const [staleSlugNotice, setStaleSlugNotice] = useState(false);
  const appliedDeepLinkRef = useRef<string | null>(null);
  const awaitingDeepLinkRef = useRef(false);
  const hasOpenedArticleRef = useRef(false);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const currentRef = useRef<HelpHistoryEntry | undefined>(undefined);
  const pendingSearchFocusRef = useRef(false);
  const topics = useHelpSearch(manifest, query);
  const current = history.at(-1);
  const article = manifest?.pages.find((page) => page.slug === current?.slug);
  const invalidFragment =
    !!current?.hash &&
    !!article &&
    !article.headings.some((heading) => heading.anchor === current.hash);

  const helpPageContext = useMemo<HelpPageContext | null>(() => {
    if (!open) {
      return null;
    }

    if (current) {
      return {
        open: true,
        view: 'article',
        slug: current.slug,
        hash: current.hash,
        title: article?.title ?? 'Help topic',
        searchQuery: query || undefined,
      };
    }

    return {
      open: true,
      view: 'catalog',
      searchQuery: query || undefined,
    };
  }, [open, current, article?.title, query]);

  useCopilotHelpPageProperties(helpPageContext);

  currentRef.current = current;

  const navigateToSearchHome = useDebouncedCallback(() => {
    if (!currentRef.current) {
      return;
    }

    pendingSearchFocusRef.current = true;
    setHistory([]);
  }, 300);

  useEffect(() => {
    if (!open) {
      navigateToSearchHome.cancel();
      pendingSearchFocusRef.current = false;
      setQuery('');
      setHistory([]);
      setStaleSlugNotice(false);
      appliedDeepLinkRef.current = null;
      awaitingDeepLinkRef.current = false;
      hasOpenedArticleRef.current = false;
      onArticleTitleChange?.(null);
    }
  }, [open, onArticleTitleChange, navigateToSearchHome]);

  useEffect(() => {
    if (!open) {
      return;
    }

    onArticleTitleChange?.(current ? article?.title ?? 'Help topic' : null);
  }, [open, current, article?.title, onArticleTitleChange]);

  useEffect(() => {
    if (current || !pendingSearchFocusRef.current) {
      return;
    }

    pendingSearchFocusRef.current = false;
    document.getElementById('help-search')?.focus();
  }, [current]);

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
  }, [
    open,
    initialized,
    manifest,
    isLoading,
    initialSlug,
    initialHash,
    history.length,
  ]);

  useEffect(() => {
    if (!open || !initialized) {
      return;
    }

    if (awaitingDeepLinkRef.current) {
      const deepLinkApplied = initialSlug
        ? current?.slug === initialSlug &&
          current.hash === (initialHash || undefined)
        : !current;
      if (!deepLinkApplied) {
        return;
      }

      awaitingDeepLinkRef.current = false;
    }

    if (
      initialSlug &&
      appliedDeepLinkRef.current !== `${initialSlug}#${initialHash ?? ''}`
    ) {
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
    navigateToSearchHome.cancel();
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

  const handleSearchChange = (value: string) => {
    setQuery(value);
    if (!currentRef.current) {
      return;
    }

    if (!value.trim()) {
      navigateToSearchHome.cancel();
      return;
    }

    navigateToSearchHome();
  };

  const handleBack = () => {
    navigateToSearchHome.cancel();
    pendingSearchFocusRef.current = false;
    setHistory((previous) => previous.slice(0, -1));
  };

  return (
    <section aria-label="Help" className="flex min-h-0 flex-1 flex-col">
      {current ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-3 pb-3">
            <Button
              secondary
              className="shrink-0 px-[16px] text-[14px] font-[600]"
              onClick={handleBack}
            >
              Back
            </Button>
            <div className="relative min-w-0 flex-1">
              <SearchIcon
                size={18}
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-textItemBlur"
              />
              <input
                id="help-search-article"
                type="search"
                aria-label="Search help"
                value={query}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Ask a question or search…"
                className="w-full rounded-[10px] border border-newTableBorder bg-newBgColor py-2.5 pe-3 ps-10 text-base text-textColor placeholder:text-textItemBlur"
              />
            </div>
          </div>
          <div className={helpInnerCardClassName}>
            <CustomScrollArea
              className="h-full min-h-0 flex-1"
              contentClassName="p-4"
              autoHide="never"
              viewportRef={scrollContainerRef}
            >
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
            </CustomScrollArea>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={helpInnerCardClassName}>
            <CustomScrollArea
              className="h-full min-h-0 flex-1"
              contentClassName="p-4"
              autoHide="never"
            >
              <HelpCatalog
                query={query}
                onQueryChange={setQuery}
                topics={topics}
                isLoading={isLoading}
                error={error}
                staleSlugNotice={staleSlugNotice}
                disableInternalScroll
                onOpenTopic={(slug, hash) => pushArticle({ slug, hash })}
              />
            </CustomScrollArea>
          </div>
          <div className="shrink-0 pt-3">
            <HelpCenterCta />
          </div>
        </div>
      )}
    </section>
  );
};

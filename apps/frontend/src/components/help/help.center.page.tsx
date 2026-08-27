'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HelpCatalog } from './help.catalog';
import { HelpMarkdown } from './help.markdown';
import { useHelpManifest } from './use.help.manifest';
import { useHelpSearch } from './use.help.search';

interface HelpCenterPageProps {
  slug?: string;
}

const helpHref = (nextSlug: string, nextHash?: string) =>
  nextHash ? `/help/${nextSlug}#${nextHash}` : `/help/${nextSlug}`;

export const HelpCenterPage = ({ slug }: HelpCenterPageProps) => {
  const router = useRouter();
  const { data: manifest, error, isLoading } = useHelpManifest(true);
  const [query, setQuery] = useState('');
  const [hash, setHash] = useState<string | undefined>(undefined);
  const topics = useHelpSearch(manifest, query);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const article = slug
    ? manifest?.pages.find((page) => page.slug === slug)
    : undefined;
  const invalidSlug = !!slug && !!manifest && !isLoading && !article;
  const invalidFragment =
    !!hash &&
    !!article &&
    !article.headings.some((heading) => heading.anchor === hash);

  useEffect(() => {
    if (!slug) {
      setHash(undefined);
      return;
    }

    const readHash = () => {
      setHash(window.location.hash.replace(/^#/, '') || undefined);
    };

    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, [slug]);

  useEffect(() => {
    if (!hash || !article) {
      return;
    }

    const container = scrollContainerRef.current;
    const heading = container
      ? Array.from(container.querySelectorAll<HTMLElement>('[id]')).find(
          (element) => element.id === hash
        )
      : document.getElementById(hash);
    if (!heading) {
      return;
    }

    heading.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [article, hash]);

  const navigateToTopic = (nextSlug: string, nextHash?: string) => {
    router.push(helpHref(nextSlug, nextHash));
  };

  if (slug) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-newBgColorInner p-6 text-textColor">
        <div className="mx-auto w-full max-w-3xl">
          <Link
            href="/help"
            className="mb-4 inline-flex text-base text-textColor underline"
          >
            Back
          </Link>
          {invalidFragment && (
            <p role="alert" className="mb-3 text-base text-textColor">
              That section could not be found in this article.
            </p>
          )}
          {isLoading && (
            <p className="text-base text-textColor">Loading help…</p>
          )}
          {!!error && (
            <p role="alert" className="text-base text-textColor">
              Help content could not be loaded. Please try again.
            </p>
          )}
          {invalidSlug && (
            <div role="alert" className="text-base text-textColor">
              This help topic could not be found.
            </div>
          )}
          {article && (
            <div ref={scrollContainerRef}>
              <HelpMarkdown
                article={article}
                hash={hash}
                scrollContainerRef={scrollContainerRef}
                onNavigate={(nextSlug, nextHash) =>
                  navigateToTopic(nextSlug, nextHash)
                }
                onHashChange={(nextHash) =>
                  navigateToTopic(article.slug, nextHash)
                }
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-newBgColorInner text-textColor">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <div className="flex items-center gap-5 rounded-[16px] border border-newTableBorder bg-newBgColor p-5 mobile:flex-col mobile:items-start">
          <div className="flex h-[112px] w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-[#0a0a0a]">
            <img
              src="/robot-new-2.png"
              alt=""
              className="h-[100px] w-[100px] object-contain mix-blend-lighten"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-textColor">
              Help center
            </h2>
            <p className="mt-1 text-base text-textItemBlur">
              Everything you need to know about Post++
            </p>
          </div>
        </div>

        <div className="rounded-[16px] border border-newTableBorder bg-newColColor">
          <HelpCatalog
            query={query}
            onQueryChange={setQuery}
            topics={topics}
            isLoading={isLoading}
            error={error}
            hrefFor={helpHref}
          />
        </div>
      </div>
    </div>
  );
};

'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { HelpArticle } from './help.types';
import { HELP_FAQS } from './help.faqs';
import { HelpTopicThumbnail, toTopicOneLiner } from './help.topic.thumbnails';
import {
  ChevronRightIcon,
  HelpIcon,
  SearchIcon,
} from '@gitroom/frontend/components/ui/icons';

interface HelpCatalogProps {
  query: string;
  onQueryChange: (value: string) => void;
  topics: HelpArticle[];
  isLoading?: boolean;
  error?: unknown;
  staleSlugNotice?: boolean;
  showFooterCta?: boolean;
  disableInternalScroll?: boolean;
  onOpenTopic?: (slug: string, hash?: string) => void;
  hrefFor?: (slug: string, hash?: string) => string;
}

const rowClassName =
  'flex w-full items-center gap-3 rounded-[10px] border border-newTableBorder text-left hover:bg-boxHover';

const CatalogRow = ({
  href,
  onClick,
  className,
  children,
}: {
  href?: string;
  onClick?: () => void;
  className: string;
  children: ReactNode;
}) => {
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  );
};

export const HelpCenterCta = () => (
  <a
    href="/help"
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-3 rounded-[10px] border border-newTableBorder bg-newBgColor p-3 hover:bg-boxHover"
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-btnSimple text-textColor">
      <HelpIcon size={22} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-base font-semibold text-textColor">
        Help center
      </span>
      <span className="block text-sm text-textItemBlur">
        Everything you need to know
      </span>
    </span>
    <ChevronRightIcon size={18} className="shrink-0 text-textItemBlur" />
  </a>
);

export const HelpCatalog = ({
  query,
  onQueryChange,
  topics,
  isLoading,
  error,
  staleSlugNotice,
  showFooterCta = false,
  disableInternalScroll = false,
  onOpenTopic,
  hrefFor,
}: HelpCatalogProps) => {
  const normalizedQuery = query.trim().toLowerCase();
  const faqs = normalizedQuery
    ? HELP_FAQS.filter((faq) =>
        faq.question.toLowerCase().includes(normalizedQuery)
      )
    : HELP_FAQS;

  const body = (
    <>
      {staleSlugNotice && (
        <p role="alert" className="mb-3 text-base text-textColor">
          That help topic could not be found.
        </p>
      )}

      <div className="relative mb-4">
        <SearchIcon
          size={18}
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-textItemBlur"
        />
        <input
          id="help-search"
          type="search"
          aria-label="Search help"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Ask a question or search…"
          className="w-full rounded-[10px] border border-newTableBorder bg-newBgColor py-2.5 pe-3 ps-10 text-base text-textColor placeholder:text-textItemBlur"
        />
      </div>

      {isLoading && <p className="text-base text-textColor">Loading help…</p>}
      {!!error && (
        <p role="alert" className="text-base text-textColor">
          Help content could not be loaded. Please try again.
        </p>
      )}

      {!isLoading && !error && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-textColor">Topics</h3>
          </div>

          {topics.length === 0 ? (
            <p className="text-base text-textColor">No help topics found.</p>
          ) : (
            <ul className="space-y-2">
              {topics.map((topic) => (
                <li key={topic.slug}>
                  <CatalogRow
                    href={hrefFor?.(topic.slug)}
                    onClick={() => onOpenTopic?.(topic.slug)}
                    className={`${rowClassName} p-3`}
                  >
                    <HelpTopicThumbnail slug={topic.slug} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-textColor">
                        {topic.title}
                      </span>
                      <span className="mt-0.5 block text-sm text-textItemBlur">
                        {toTopicOneLiner(topic.excerpt)}
                      </span>
                    </span>
                    <ChevronRightIcon
                      size={18}
                      className="shrink-0 text-textItemBlur"
                    />
                  </CatalogRow>
                </li>
              ))}
            </ul>
          )}

          {faqs.length > 0 && (
            <>
              <div className="mb-2 mt-5 flex items-center justify-between">
                <h3 className="text-base font-semibold text-textColor">
                  Frequently Asked Questions
                </h3>
              </div>
              <ul className="space-y-2">
                {faqs.map((faq) => (
                  <li key={faq.id}>
                    <CatalogRow
                      href={hrefFor?.(faq.slug, faq.hash)}
                      onClick={() => onOpenTopic?.(faq.slug, faq.hash)}
                      className={`${rowClassName} px-3 py-3`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-textItemBlur">
                        <HelpIcon size={20} />
                      </span>
                      <span className="min-w-0 flex-1 text-base font-semibold text-textColor">
                        {faq.question}
                      </span>
                      <ChevronRightIcon
                        size={18}
                        className="shrink-0 text-textItemBlur"
                      />
                    </CatalogRow>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {disableInternalScroll ? (
        body
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
          {body}
        </div>
      )}

      {showFooterCta && (
        <div className="border-t border-newTableBorder p-4">
          <HelpCenterCta />
        </div>
      )}
    </div>
  );
};

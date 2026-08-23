'use client';

import {
  ComponentPropsWithoutRef,
  MutableRefObject,
  useEffect,
  useMemo,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HelpArticle } from './help.types';

interface HelpMarkdownProps {
  article: HelpArticle;
  hash?: string;
  scrollContainerRef?: MutableRefObject<HTMLElement | null>;
  onNavigate: (slug: string, hash?: string) => void;
  onHashChange: (hash: string) => void;
}

const isExternalLink = (href: string) => {
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const helpDestination = (href: string) => {
  try {
    const url = new URL(href, 'https://help.postiz.local');
    const match = /^\/help\/([^/]+)$/.exec(url.pathname);
    return match ? { slug: decodeURIComponent(match[1]), hash: url.hash.slice(1) } : null;
  } catch {
    return null;
  }
};

export const HelpMarkdown = ({
  article,
  hash,
  scrollContainerRef,
  onNavigate,
  onHashChange,
}: HelpMarkdownProps) => {
  const headingAnchors = useMemo(
    () =>
      article.headings
        .filter((heading) => heading.level >= 2 && heading.level <= 6)
        .map((heading) => heading.anchor),
    [article.headings]
  );

  useEffect(() => {
    if (!hash) {
      return;
    }

    const container = scrollContainerRef?.current;
    const heading =
      container
        ? Array.from(container.querySelectorAll<HTMLElement>('[id]')).find(
            (element) => element.id === hash
          )
        : document.getElementById(hash);
    if (!heading) {
      return;
    }

    if (!container) {
      heading.scrollIntoView({ block: 'start' });
      return;
    }

    const containerBounds = container.getBoundingClientRect();
    const headingBounds = heading.getBoundingClientRect();
    const top = container.scrollTop + headingBounds.top - containerBounds.top;
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top, behavior: 'smooth' });
    } else {
      container.scrollTop = top;
    }
  }, [article.slug, hash, scrollContainerRef]);

  let headingIndex = 0;
  const heading = (Tag: 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => {
    const Component = ({ children, ...props }: ComponentPropsWithoutRef<typeof Tag>) => {
      const id = headingAnchors[headingIndex++];
      return (
        <Tag
          {...props}
          id={id}
          className="mb-3 mt-6 scroll-mt-4 text-lg font-semibold text-textColor first:mt-0"
        >
          {children}
        </Tag>
      );
    };

    return Component;
  };

  return (
    <article className="break-words text-base leading-7 text-textColor">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children, ...props }) => (
            <h1 {...props} className="mb-4 text-2xl font-bold text-textColor">
              {children}
            </h1>
          ),
          h2: heading('h2'),
          h3: heading('h3'),
          h4: heading('h4'),
          h5: heading('h5'),
          h6: heading('h6'),
          p: ({ children, ...props }) => (
            <p {...props} className="mb-4">
              {children}
            </p>
          ),
          ul: ({ children, ...props }) => (
            <ul {...props} className="mb-4 list-disc space-y-1 pl-5">
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol {...props} className="mb-4 list-decimal space-y-1 pl-5">
              {children}
            </ol>
          ),
          table: ({ children, ...props }) => (
            <div className="mb-4 overflow-x-auto">
              <table {...props} className="w-full border-collapse text-left">
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th {...props} className="border border-newTableBorder p-2 font-semibold">
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td {...props} className="border border-newTableBorder p-2 align-top">
              {children}
            </td>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              {...props}
              className="mb-4 border-l-2 border-newTableBorder pl-3 text-gray-500"
            >
              {children}
            </blockquote>
          ),
          a: ({ children, href = '', ...props }) => {
            const destination = helpDestination(href);
            const external = isExternalLink(href);

            return (
              <a
                {...props}
                href={href}
                className="text-blue-500 underline"
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                onClick={(event) => {
                  if (destination) {
                    event.preventDefault();
                    onNavigate(destination.slug, destination.hash || undefined);
                  } else if (href.startsWith('#')) {
                    event.preventDefault();
                    onHashChange(href.slice(1));
                  }
                }}
              >
                {children}
              </a>
            );
          },
          img: ({ alt = '', ...props }) => (
            <img {...props} alt={alt} className="my-4 max-w-full rounded" />
          ),
          code: ({ children, ...props }) => (
            <code
              {...props}
              className="rounded bg-newBgColor px-1 py-0.5 font-mono text-sm"
            >
              {children}
            </code>
          ),
          pre: ({ children, ...props }) => (
            <pre
              {...props}
              className="mb-4 overflow-x-auto rounded bg-newBgColor p-3 font-mono text-sm"
            >
              {children}
            </pre>
          ),
        }}
      >
        {article.markdown}
      </ReactMarkdown>
    </article>
  );
};

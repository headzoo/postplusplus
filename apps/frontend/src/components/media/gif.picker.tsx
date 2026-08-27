'use client';

import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useDebounce } from 'use-debounce';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import Spinner from '@gitroom/frontend/components/layout/loading';
import { CustomScrollArea } from '@gitroom/frontend/components/ui/custom.scroll.area';

export type GiphyGifItem = {
  id: string;
  title: string;
  preview: string;
  url: string;
  width: number;
  height: number;
};

const PAGE_SIZE = 25;

const useTrendingGifs = (enabled: boolean, offset: number) => {
  const fetch = useFetch();
  return useSWR<GiphyGifItem[]>(
    enabled ? `gifs-trending-${offset}` : null,
    async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(PAGE_SIZE),
      });
      const response = await fetch(`/media/gifs/trending?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to load trending GIFs');
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid trending GIFs response');
      }
      return data;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    }
  );
};

const useGifSearch = (query: string | null, offset: number) => {
  const fetch = useFetch();
  return useSWR<GiphyGifItem[]>(
    query ? `gifs-search-${query}-${offset}` : null,
    async () => {
      const params = new URLSearchParams({
        q: query!,
        offset: String(offset),
        limit: String(PAGE_SIZE),
      });
      const response = await fetch(`/media/gifs/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to search GIFs');
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid search GIFs response');
      }
      return data;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    }
  );
};

export const GifPicker: FC<{
  open: boolean;
  onSelect: (gif: GiphyGifItem) => Promise<void> | void;
  importing?: boolean;
  placement?: 'top' | 'bottom';
}> = ({ open, onSelect, importing, placement = 'bottom' }) => {
  const t = useT();
  const toaster = useToaster();
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const [pageState, setPageState] = useState({ query: '', offset: 0 });
  const [items, setItems] = useState<GiphyGifItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const trimmedQuery = debouncedQuery.trim();
  const offset =
    open && pageState.query === trimmedQuery ? pageState.offset : 0;

  const trending = useTrendingGifs(open && !trimmedQuery, offset);
  const search = useGifSearch(
    open && trimmedQuery ? trimmedQuery : null,
    offset
  );

  const activeData = trimmedQuery ? search.data : trending.data;
  const isLoading = trimmedQuery ? search.isLoading : trending.isLoading;
  const error = trimmedQuery ? search.error : trending.error;

  useEffect(() => {
    if (!open) {
      return;
    }
    setPageState({ query: trimmedQuery, offset: 0 });
    setItems([]);
    setHasMore(true);
    setLoadingMore(false);
  }, [trimmedQuery, open]);

  useEffect(() => {
    if (!open || !activeData || !Array.isArray(activeData)) {
      return;
    }
    setItems((prev) => {
      if (offset === 0) {
        return activeData;
      }
      const seen = new Set(prev.map((item) => item.id));
      return [...prev, ...activeData.filter((item) => !seen.has(item.id))];
    });
    setHasMore(activeData.length >= PAGE_SIZE);
    setLoadingMore(false);
  }, [activeData, offset, open]);

  useEffect(() => {
    if (!error) {
      return;
    }
    setLoadingMore(false);
    toaster.show(t('failed_to_load_gifs', 'Failed to load GIFs'), 'warning');
  }, [error]);

  const onScroll = useCallback(
    (el: HTMLElement) => {
      if (isLoading || loadingMore || importing || !hasMore) {
        return;
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
        setLoadingMore(true);
        setPageState((prev) => ({
          query: trimmedQuery,
          offset: prev.query === trimmedQuery ? prev.offset + PAGE_SIZE : 0,
        }));
      }
    },
    [hasMore, importing, isLoading, loadingMore, trimmedQuery]
  );

  const handleSelect = useCallback(
    async (gif: GiphyGifItem) => {
      if (importing) {
        return;
      }
      await onSelect(gif);
    },
    [importing, onSelect]
  );

  const empty = useMemo(
    () => !isLoading && items.length === 0,
    [isLoading, items.length]
  );

  if (!open) {
    return null;
  }

  return (
    <div
      className={clsx(
        'GifPicker absolute z-[500] w-[320px] rounded-[8px] border border-newColColor bg-newBgColorInner shadow-lg overflow-hidden',
        placement === 'top' ? 'bottom-[35px]' : 'top-[35px]',
        '-start-[50px]'
      )}
    >
      <div className="p-[10px] border-b border-newColColor">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search_gifs', 'Search GIFs')}
          className="w-full h-[34px] rounded-[6px] bg-newColColor px-[10px] text-[12px] outline-none"
          autoFocus
        />
      </div>
      <CustomScrollArea
        className="h-[280px]"
        contentClassName="p-[8px] pe-[20px]"
        onScroll={onScroll}
      >
        {empty && (
          <div className="h-full flex items-center justify-center text-[12px] opacity-70">
            {t('no_gifs_found', 'No GIFs found')}
          </div>
        )}
        <div className="grid grid-cols-2 gap-[8px]">
          {items.map((gif) => (
            <button
              key={`${gif.id}-${gif.url}`}
              type="button"
              disabled={importing}
              onClick={() => handleSelect(gif)}
              className={clsx(
                'relative aspect-square rounded-[6px] overflow-hidden bg-newSep focus:outline-none',
                importing && 'opacity-50 cursor-not-allowed'
              )}
            >
              <img
                src={gif.preview}
                alt={gif.title || 'GIF'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
        {(isLoading || importing) && (
          <div className="flex justify-center py-[12px]">
            <Spinner width={20} height={20} />
          </div>
        )}
      </CustomScrollArea>
      <div className="px-[10px] py-[6px] border-t border-newColColor text-[10px] opacity-70 flex justify-end">
        <a
          href="https://giphy.com/"
          target="_blank"
          rel="noreferrer"
          className="hover:opacity-100"
        >
          Powered by GIPHY
        </a>
      </div>
    </div>
  );
};

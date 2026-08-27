'use client';

import 'reflect-metadata';
import {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import dayjs from 'dayjs';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Post, Integration, Tags } from '@prisma/client';
import { useSearchParams } from 'next/navigation';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import { extend } from 'dayjs';
import useCookie from 'react-use-cookie';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import {
  expandPostsList,
  expandPosts,
} from '@gitroom/helpers/utils/posts.list.minify';
import { usePipelineCalendar } from '@gitroom/frontend/components/pipelines/use.pipeline.calendar';
extend(isoWeek);
extend(weekOfYear);

export type ListStateFilter = 'all' | 'scheduled' | 'draft' | 'published';

export type CalendarPost = Post & {
  integration: Integration;
  tags: {
    tag: Tags;
  }[];
};

function matchesPostSearch(
  post: { content?: string | null; title?: string | null },
  term: string
) {
  if (!term) {
    return true;
  }
  const lower = term.toLowerCase();
  return (
    (post.content || '').toLowerCase().includes(lower) ||
    (post.title || '').toLowerCase().includes(lower)
  );
}

function buildCalendarUrl(
  filters: {
    startDate: string;
    endDate: string;
    display: string;
    customer: string | null;
  },
  search: string
) {
  const path = [
    `startDate=${filters.startDate}`,
    `endDate=${filters.endDate}`,
    `display=${filters.display}`,
    filters.customer ? `customer=${filters.customer}` : '',
    search ? `search=${encodeURIComponent(search)}` : '',
  ].filter((f) => f);
  return `/calendar?${path.join('&')}`;
}

/** Cell key matching CalendarColumn filter semantics for the given display. */
export function getCalendarCellKey(date: dayjs.Dayjs, display: string): string {
  if (display === 'day' || display === 'list') {
    return date.format('YYYY-MM-DD HH:mm');
  }
  if (display === 'week') {
    return date.format('YYYY-MM-DD HH');
  }
  return date.format('DD/MM/YYYY');
}

export function getListStackKey(publishDate: string): string {
  return getCalendarCellKey(newDayjs(publishDate).local(), 'list');
}

function getPostCellKey(publishDate: string, display: string): string {
  return getCalendarCellKey(newDayjs(publishDate).local(), display);
}

/**
 * 42-day month grid window (Mon-before-1st through +41 days), matching
 * MonthView. Always contains the visible day/week/month for the same anchor.
 */
function getMonthWindow(anchorDate: string) {
  const date = newDayjs(anchorDate);
  const startOfMonth = newDayjs(new Date(date.year(), date.month(), 1));
  const daysBeforeMonth = startOfMonth.isoWeekday() - 1;
  const calendarStart = startOfMonth.subtract(daysBeforeMonth, 'day');
  const calendarEnd = calendarStart.add(41, 'day');

  return {
    startDate: calendarStart.startOf('day').utc().format(),
    endDate: calendarEnd.endOf('day').utc().format(),
  };
}

export const CalendarContext = createContext({
  startDate: newDayjs().startOf('isoWeek').format('YYYY-MM-DD'),
  endDate: newDayjs().endOf('isoWeek').format('YYYY-MM-DD'),
  customer: null as string | null,
  loading: true,
  sets: [] as { name: string; id: string; content: string[] }[],
  signature: undefined as any,
  comments: [] as Array<{
    date: string;
    total: number;
  }>,
  integrations: [] as (Integrations & {
    refreshNeeded?: boolean;
  })[],
  trendings: [] as string[],
  posts: [] as CalendarPost[],
  postsByCell: {} as Record<string, CalendarPost[]>,
  getCellPosts: (_date: dayjs.Dayjs) => [] as CalendarPost[],
  reloadCalendarView: () => {
    /** empty **/
  },
  display: 'week',
  setFilters: (filters: {
    startDate: string;
    endDate: string;
    display: 'week' | 'month' | 'day' | 'list';
    customer: string | null;
  }) => {
    /** empty **/
  },
  changeDate: (id: string | string[], date: dayjs.Dayjs) => {
    /** empty **/
  },
  // List view specific
  listPosts: [] as CalendarPost[],
  listPage: 0,
  listTotalPages: 0,
  setListPage: (page: number) => {
    /** empty **/
  },
  listState: 'all' as ListStateFilter,
  setListState: (state: ListStateFilter) => {
    /** empty **/
  },
  search: '',
  setSearch: (_search: string) => {
    /** empty **/
  },
  submitSearch: () => {
    /** empty **/
  },
  trimmedSearch: '',
});

export interface Integrations {
  name: string;
  id: string;
  disabled?: boolean;
  inBetweenSteps: boolean;
  editor: 'none' | 'normal' | 'markdown' | 'html';
  stripLinks?: boolean;
  display: string;
  identifier: string;
  type: string;
  picture: string;
  changeProfilePicture: boolean;
  additionalSettings: string;
  changeNickName: boolean;
  time: {
    time: number;
  }[];
  customer?: {
    name?: string;
    id?: string;
  };
}

// Helper function to get start and end dates based on display type
function getDateRange(display: string, referenceDate?: string) {
  const date = referenceDate ? newDayjs(referenceDate) : newDayjs();

  switch (display) {
    case 'day':
      return {
        startDate: date.format('YYYY-MM-DD'),
        endDate: date.format('YYYY-MM-DD'),
      };
    case 'week':
      return {
        startDate: date.startOf('isoWeek').format('YYYY-MM-DD'),
        endDate: date.endOf('isoWeek').format('YYYY-MM-DD'),
      };
    case 'month':
      return {
        startDate: date.startOf('month').format('YYYY-MM-DD'),
        endDate: date.endOf('month').format('YYYY-MM-DD'),
      };
    default:
      return {
        startDate: date.startOf('isoWeek').format('YYYY-MM-DD'),
        endDate: date.endOf('isoWeek').format('YYYY-MM-DD'),
      };
  }
}

export const CalendarWeekProvider: FC<{
  children: ReactNode;
  integrations: Integrations[];
}> = ({ children, integrations }) => {
  const fetch = useFetch();
  const [dateOverrides, setDateOverrides] = useState<Record<string, string>>(
    {}
  );
  const [trendings] = useState<string[]>([]);
  const searchParams = useSearchParams();
  const [displaySaved, setDisplaySaved] = useCookie('calendar-display', 'week');
  const urlDisplay = searchParams.get('display') || displaySaved;

  // List view state
  const [listPage, setListPage] = useState(0);
  const [listState, setListStateRaw] = useState<ListStateFilter>('all');
  const setListState = useCallback((next: ListStateFilter) => {
    setListStateRaw(next);
    setListPage(0);
  }, []);

  // Initialize with current date range based on URL params or defaults
  const initStartDate = searchParams.get('startDate');
  const initEndDate = searchParams.get('endDate');
  const initCustomer = searchParams.get('customer');
  const initSearch = searchParams.get('search') || '';
  const startingInSearch = !!initSearch.trim();

  const initialRange =
    initStartDate && initEndDate
      ? { startDate: initStartDate, endDate: initEndDate }
      : getDateRange(urlDisplay);

  const [filters, setFilters] = useState({
    startDate: initialRange.startDate,
    endDate: initialRange.endDate,
    customer: initCustomer || null,
    display: startingInSearch ? 'list' : urlDisplay,
  });
  const [search, setSearchRaw] = useState(initSearch);
  const [appliedSearch, setAppliedSearch] = useState(
    startingInSearch ? initSearch.trim() : ''
  );
  const trimmedSearch = appliedSearch;
  const isSearchActive = !!trimmedSearch;

  // Remember view mode before search so clearing can restore it.
  const displayBeforeSearch = useRef<string | null>(
    startingInSearch ? urlDisplay : null
  );
  const listStateBeforeSearch = useRef<ListStateFilter | null>(
    startingInSearch ? 'all' : null
  );
  const isSearchMode = useRef(startingInSearch);
  const filtersRef = useRef(filters);
  const listStateRef = useRef(listState);
  filtersRef.current = filters;
  listStateRef.current = listState;

  const exitSearchMode = useCallback(() => {
    const currentFilters = filtersRef.current;
    setAppliedSearch('');
    setSearchRaw('');
    setListPage(0);

    if (!isSearchMode.current) {
      window.history.replaceState(
        null,
        '',
        buildCalendarUrl(currentFilters, '')
      );
      return;
    }

    isSearchMode.current = false;
    const restoreDisplay = (displayBeforeSearch.current || 'week') as
      | 'week'
      | 'month'
      | 'day'
      | 'list';
    const restoreListState = listStateBeforeSearch.current || 'all';
    displayBeforeSearch.current = null;
    listStateBeforeSearch.current = null;

    setListStateRaw(restoreListState);

    const range =
      restoreDisplay === 'list'
        ? {
            startDate: currentFilters.startDate,
            endDate: currentFilters.endDate,
          }
        : getDateRange(restoreDisplay, currentFilters.startDate);

    const nextFilters = {
      startDate: range.startDate,
      endDate: range.endDate,
      display: restoreDisplay,
      customer: currentFilters.customer,
    };
    setDisplaySaved(restoreDisplay);
    setFilters(nextFilters);
    window.history.replaceState(null, '', buildCalendarUrl(nextFilters, ''));
  }, [setDisplaySaved]);

  const setSearch = useCallback(
    (next: string) => {
      setSearchRaw(next);
      // Native type="search" clear (and emptying the field) exits search mode.
      if (!next.trim() && isSearchMode.current) {
        exitSearchMode();
      }
    },
    [exitSearchMode]
  );

  const submitSearch = useCallback(() => {
    const term = search.trim();
    if (!term) {
      if (isSearchMode.current || appliedSearch) {
        exitSearchMode();
      }
      return;
    }

    const currentFilters = filtersRef.current;
    const currentListState = listStateRef.current;

    if (!isSearchMode.current) {
      displayBeforeSearch.current = currentFilters.display;
      listStateBeforeSearch.current = currentListState;
      isSearchMode.current = true;
    }

    setAppliedSearch(term);
    setListStateRaw('all');
    setListPage(0);

    const nextFilters = {
      ...currentFilters,
      display: 'list' as const,
    };
    setDisplaySaved('list');
    setFilters(nextFilters);
    window.history.replaceState(null, '', buildCalendarUrl(nextFilters, term));
  }, [search, appliedSearch, exitSearchMode, setDisplaySaved]);

  // Shared 42-day month grid — day/week/month all reuse this fetch window.
  const monthWindow = useMemo(
    () => getMonthWindow(filters.startDate),
    [filters.startDate]
  );

  // SWR key omits display so day/week/month share one cache entry.
  const calendarParams = useMemo(() => {
    const params = new URLSearchParams({
      startDate: monthWindow.startDate,
      endDate: monthWindow.endDate,
      customer: filters?.customer?.toString() || '',
    });
    if (trimmedSearch) {
      params.set('search', trimmedSearch);
    }
    return params.toString();
  }, [monthWindow, filters.customer, trimmedSearch]);

  // List view uses a forward pipeline window; calendar views share monthWindow.
  const pipelineWindow = useMemo(() => {
    if (filters.display === 'list') {
      return {
        startDate: newDayjs().startOf('day').utc().format(),
        endDate: newDayjs().add(90, 'day').endOf('day').utc().format(),
      };
    }
    return monthWindow;
  }, [filters.display, monthWindow]);

  // Calendar view data fetcher — always the full month window.
  const loadData = useCallback(async () => {
    const modifiedParams = new URLSearchParams({
      customer: filters?.customer?.toString() || '',
      startDate: monthWindow.startDate,
      endDate: monthWindow.endDate,
    });
    if (trimmedSearch) {
      modifiedParams.set('search', trimmedSearch);
    }

    const data = await (
      await fetch(`/posts?${modifiedParams.toString()}`)
    ).json();
    return expandPosts(data);
  }, [fetch, filters.customer, monthWindow, trimmedSearch]);

  // Projected pipeline queue items overlaid onto calendar and list (not
  // persisted dates — computed server-side from each Pipeline's schedule).
  const { data: pipelinePosts, mutate: mutatePipelineCalendar } =
    usePipelineCalendar(
      pipelineWindow.startDate,
      pipelineWindow.endDate,
      true,
      filters.customer
    );

  const filteredPipelinePosts = useMemo(
    () =>
      (pipelinePosts || []).filter((post) =>
        matchesPostSearch(post, trimmedSearch)
      ),
    [pipelinePosts, trimmedSearch]
  );

  // List view data fetcher — search always queries across all states.
  const effectiveListState: ListStateFilter = isSearchActive
    ? 'all'
    : listState;

  const listParams = useMemo(() => {
    const params = new URLSearchParams({
      page: listPage.toString(),
      limit: '100',
      customer: filters?.customer?.toString() || '',
      state: effectiveListState,
    });
    if (trimmedSearch) {
      params.set('search', trimmedSearch);
    }
    return params.toString();
  }, [listPage, filters.customer, effectiveListState, trimmedSearch]);

  const loadListData = useCallback(async () => {
    const response = await fetch(`/posts/list?${listParams}`);
    return expandPostsList(await response.json());
  }, [fetch, listParams]);

  // SWR for calendar view — keyed on month window + customer (not display)
  const {
    data: calendarData,
    isLoading: calendarIsLoading,
    mutate: mutateCalendar,
  } = useSWR(
    filters.display !== 'list' ? `/posts-${calendarParams}` : null,
    loadData,
    {
      refreshInterval: 3600000,
      refreshWhenOffline: false,
      refreshWhenHidden: false,
      revalidateOnFocus: false,
      revalidateIfStale: false,
      keepPreviousData: true,
    }
  );

  // SWR for list view
  const {
    data: listData,
    isLoading: listIsLoading,
    mutate: mutateList,
  } = useSWR(
    filters.display === 'list' ? `/posts-list-${listParams}` : null,
    loadListData,
    {
      refreshInterval: 3600000,
      refreshWhenOffline: false,
      refreshWhenHidden: false,
      revalidateOnFocus: false,
      revalidateIfStale: false,
      keepPreviousData: true,
    }
  );

  const defaultSign = useCallback(async () => {
    return await (await fetch('/signatures/default')).json();
  }, [fetch]);

  const setList = useCallback(async () => {
    return (await fetch('/sets')).json();
  }, [fetch]);

  const { data: sets, mutate } = useSWR('sets', setList, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
  const { data: sign } = useSWR('default-sign', defaultSign, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });

  const setFiltersWrapper = useCallback(
    (newFilters: {
      startDate: string;
      endDate: string;
      display: 'week' | 'month' | 'day' | 'list';
      customer: string | null;
    }) => {
      setDisplaySaved(newFilters.display);
      setFilters(newFilters);

      // Reset page when switching to list view
      if (newFilters.display === 'list') {
        setListPage(0);
      }

      window.history.replaceState(
        null,
        '',
        buildCalendarUrl(newFilters, trimmedSearch)
      );
    },
    [setDisplaySaved, trimmedSearch]
  );

  const mergedPosts = useMemo(
    () => [...(calendarData?.posts || []), ...filteredPipelinePosts],
    [calendarData?.posts, filteredPipelinePosts]
  );

  useEffect(() => {
    setDateOverrides({});
  }, [calendarData?.posts, filteredPipelinePosts]);

  const displayPosts = useMemo(() => {
    if (!Object.keys(dateOverrides).length) {
      return mergedPosts;
    }
    return mergedPosts.map((post) =>
      dateOverrides[post.id]
        ? { ...post, publishDate: dateOverrides[post.id] }
        : post
    );
  }, [mergedPosts, dateOverrides]);

  const comments = useMemo(
    () => calendarData?.comments || [],
    [calendarData?.comments]
  );

  // List view data — merge projected pipeline items onto page 0 so queued
  // pipeline posts appear with the same upcoming dates as the calendar.
  const listPosts = useMemo(() => {
    const base = listData?.posts || [];
    if (effectiveListState === 'published' || listPage !== 0) {
      return base;
    }

    if (!filteredPipelinePosts.length) {
      return base;
    }

    const seen = new Set(base.map((post: { id: string }) => post.id));
    const merged = [
      ...base,
      ...filteredPipelinePosts.filter(
        (post: { id: string }) => !seen.has(post.id)
      ),
    ];

    return merged.sort(
      (a: { publishDate: string }, b: { publishDate: string }) => {
        const diff =
          newDayjs(a.publishDate).valueOf() - newDayjs(b.publishDate).valueOf();
        // Search results are newest-first to mix published + upcoming.
        return isSearchActive ? -diff : diff;
      }
    );
  }, [
    listData?.posts,
    filteredPipelinePosts,
    effectiveListState,
    listPage,
    isSearchActive,
  ]);
  const listTotal = listData?.total || 0;
  const listTotalPages = Math.ceil(listTotal / 100);

  const changeDate = useCallback((id: string | string[], date: dayjs.Dayjs) => {
    const formatted = date.utc().format('YYYY-MM-DDTHH:mm:ss');
    const ids = Array.isArray(id) ? id : [id];
    setDateOverrides((prev) => {
      const next = { ...prev };
      for (const postId of ids) {
        next[postId] = formatted;
      }
      return next;
    });
  }, []);

  // Precompute cell → posts index so CalendarColumn is O(1) per cell.
  const postsByCell = useMemo(() => {
    const index: Record<string, CalendarPost[]> = {};
    for (const post of displayPosts as CalendarPost[]) {
      const key = getPostCellKey(String(post.publishDate), filters.display);
      if (!index[key]) {
        index[key] = [];
      }
      index[key].push(post);
    }
    return index;
  }, [displayPosts, filters.display]);

  const getCellPosts = useCallback(
    (date: dayjs.Dayjs) => {
      return postsByCell[getCalendarCellKey(date, filters.display)] || [];
    },
    [postsByCell, filters.display]
  );

  // Combined reload function that handles both calendar and list views
  const reloadCalendarView = useCallback(() => {
    mutateCalendar();
    mutateList();
    mutatePipelineCalendar();
  }, [mutateCalendar, mutateList, mutatePipelineCalendar]);

  // Determine loading state based on current view
  const loading =
    filters.display === 'list' ? listIsLoading : calendarIsLoading;

  return (
    <CalendarContext.Provider
      value={{
        trendings,
        reloadCalendarView,
        ...filters,
        posts: displayPosts,
        postsByCell,
        getCellPosts,
        loading,
        integrations,
        setFilters: setFiltersWrapper,
        changeDate,
        comments,
        sets: sets || [],
        signature: sign,
        // List view specific
        listPosts,
        listPage,
        listTotalPages,
        setListPage,
        listState,
        setListState,
        search,
        setSearch,
        submitSearch,
        trimmedSearch,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
};

export const useCalendar = () => useContext(CalendarContext);

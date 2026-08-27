'use client';

import React, {
  FC,
  Fragment,
  memo,
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CalendarContext,
  CalendarPost,
  getListStackKey,
  Integrations,
  useCalendar,
} from '@gitroom/frontend/components/launches/calendar.context';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/he';
import 'dayjs/locale/ru';
import 'dayjs/locale/zh';
import 'dayjs/locale/fr';
import 'dayjs/locale/es';
import 'dayjs/locale/pt';
import 'dayjs/locale/de';
import 'dayjs/locale/it';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/ar';
import 'dayjs/locale/tr';
import 'dayjs/locale/vi';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useDrag, useDrop } from 'react-dnd';
import { useAddProvider } from '@gitroom/frontend/components/launches/add.provider.component';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { groupBy, random, sortBy } from 'lodash';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { extend } from 'dayjs';
import { isUSCitizen } from './helpers/isuscitizen.utils';
import { useClickOutside, useInterval } from '@mantine/hooks';
import { StatisticsModal } from '@gitroom/frontend/components/launches/statistics';
import { MissingReleaseModal } from '@gitroom/frontend/components/launches/missing-release.modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import i18next from 'i18next';
import {
  ADD_EDIT_MODAL_OPTIONS,
  AddEditModal,
} from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { CreationMethodBadge } from '@gitroom/frontend/components/launches/creation.method.badge';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import copy from 'copy-to-clipboard';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { Button } from '@gitroom/react/form/button';
import {
  getReadableForegroundColor,
  resolveCalendarPostHeaderColor,
} from '@gitroom/frontend/components/pipelines/pipeline.utils';
import {
  getHourBlockTop,
  useScrollToHour,
} from '@gitroom/frontend/components/launches/helpers/use.scroll.to.hour';

// Extend dayjs with necessary plugins
extend(localizedFormat);

// Initialize language
const updateDayjsLocale = () => {
  const currentLanguage = i18next.resolvedLanguage || 'en';
  dayjs.locale(currentLanguage);
};

// Set dayjs locale whenever i18next language changes
i18next.on('languageChanged', () => {
  updateDayjsLocale();
});

// Initial setup
updateDayjsLocale();

const convertTimeFormatBasedOnLocality = (time: number) => {
  if (isUSCitizen()) {
    return `${time === 12 ? 12 : time % 12}:00 ${time >= 12 ? 'PM' : 'AM'}`;
  } else {
    return `${time}:00`;
  }
};

export const hours = Array.from(
  {
    length: 24,
  },
  (_, i) => i
);

type CalendarItemPost = CalendarPost & {
  pipelineColor?: string;
  pipelineItemId?: string;
};

type CellEntry =
  | { kind: 'single'; post: CalendarItemPost }
  | { kind: 'stack'; group: string; posts: CalendarItemPost[] };

/** Visible height of each tucked channel card above the front card. */
const STACK_PEEK_PX = 32;
const STACK_EXPAND_MAX_PX = 140;
const STACK_SHADOW = 'shadow-[0_2px_6px_rgba(0,0,0,0.35)]';

function pickPrimaryPost(posts: CalendarItemPost[]): CalendarItemPost {
  return [...posts].sort((a, b) => {
    const dateDiff =
      newDayjs(a.publishDate).valueOf() - newDayjs(b.publishDate).valueOf();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return a.id.localeCompare(b.id);
  })[0];
}

function groupPostsInCell(posts: CalendarItemPost[]): CellEntry[] {
  const grouped = groupBy(posts, (post) => post.group || post.id);
  const seen = new Set<string>();
  const entries: CellEntry[] = [];

  for (const post of posts) {
    const key = post.group || post.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const siblings = grouped[key] || [post];
    if (siblings.length === 1) {
      entries.push({ kind: 'single', post: siblings[0] });
      continue;
    }
    entries.push({
      kind: 'stack',
      group: key,
      posts: [...siblings].sort((a, b) =>
        (a.integration?.name || '').localeCompare(b.integration?.name || '')
      ),
    });
  }

  return entries;
}

function cellEntryKey(entry: CellEntry): string {
  if (entry.kind === 'single') {
    return entry.post.id;
  }
  return `${entry.group}:${entry.posts
    .map((post) => post.id)
    .sort()
    .join(',')}`;
}

function uniqueIntegrationsFromTimeSlot(
  option: Array<{ integration: Integrations | Integrations[] }>
): Integrations[] {
  const seen = new Set<string>();
  const result: Integrations[] = [];

  for (const item of option) {
    const list = Array.isArray(item.integration)
      ? item.integration
      : [item.integration];

    for (const integration of list) {
      if (!integration?.id || seen.has(integration.id)) {
        continue;
      }
      seen.add(integration.id);
      result.push(integration);
    }
  }

  return result;
}

// Shared hook for post actions (edit, delete, statistics)
const usePostActions = (onMutate?: () => void) => {
  const t = useT();
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const { integrations, reloadCalendarView } = useCalendar();

  const mutate = useCallback(() => {
    reloadCalendarView();
    onMutate?.();
  }, [reloadCalendarView, onMutate]);

  const editPost = useCallback(
    (loadPost: any, isDuplicate?: boolean) => async () => {
      const post = {
        ...loadPost,
        publishDate: loadPost.actualDate || loadPost.publishDate,
      };

      const data = await (await fetch(`/posts/group/${post.group}`)).json();
      const clickedIntegrationId = post.integration?.id || data.integration;
      const postIntegrationId = (item: any) =>
        item.integrationId || item.integration?.id;
      const parseSettings = (settings: unknown) => {
        if (!settings) {
          return {};
        }
        if (typeof settings === 'string') {
          try {
            return JSON.parse(settings || '{}');
          } catch {
            return {};
          }
        }
        return settings as Record<string, unknown>;
      };
      // Shared groups (e.g. Pipelines) contain one root per channel. Split by
      // integration so the composer does not treat sibling channels as a thread.
      const channels = data.posts
        .filter((item: any) => !item.parentPostId)
        .map((root: any) => {
          const integrationId = postIntegrationId(root);
          return {
            integration: integrationId,
            posts: data.posts.filter(
              (item: any) => postIntegrationId(item) === integrationId
            ),
            settings: parseSettings(root.settings),
          };
        });
      const orderedChannels = [
        ...channels.filter(
          (channel: any) => channel.integration === clickedIntegrationId
        ),
        ...channels.filter(
          (channel: any) => channel.integration !== clickedIntegrationId
        ),
      ];
      const focusedChannel = orderedChannels[0];
      const date = !isDuplicate
        ? null
        : (await (await fetch('/posts/find-slot')).json()).date;
      const publishDate = dayjs
        .utc(
          date ||
            focusedChannel?.posts?.[0]?.publishDate ||
            data.posts[0].publishDate
        )
        .local();
      const ExistingData = !isDuplicate
        ? ExistingDataContextProvider
        : Fragment;
      const channelIntegrations = integrations
        .slice(0)
        .filter((integration) =>
          orderedChannels.some(
            (channel: any) => channel.integration === integration.id
          )
        );
      modal.openModal({
        ...ADD_EDIT_MODAL_OPTIONS,
        children: (
          <ExistingData
            value={{
              ...data,
              integration: focusedChannel?.integration || data.integration,
              posts: focusedChannel?.posts || data.posts,
              settings: focusedChannel?.settings || data.settings,
              channels: orderedChannels,
            }}
          >
            <AddEditModal
              {...(isDuplicate
                ? {
                    onlyValues: (focusedChannel?.posts || []).map(
                      ({ image, settings, content }: any) => ({
                        image,
                        settings,
                        content,
                      })
                    ),
                  }
                : {})}
              allIntegrations={integrations.map((p) => ({ ...p }))}
              reopenModal={editPost(post)}
              mutate={mutate}
              focusedChannel={clickedIntegrationId}
              integrations={
                isDuplicate
                  ? integrations
                  : channelIntegrations.length
                  ? channelIntegrations
                  : integrations
                      .slice(0)
                      .filter((f) => f.id === clickedIntegrationId)
              }
              date={publishDate}
            />
          </ExistingData>
        ),
        title: ``,
      });
    },
    [integrations, fetch, modal, mutate]
  );

  const copyDebugJson = useCallback(
    (post: any) => () => {
      modal.openModal({
        title: t('copy_debug_json', 'Copy Debug JSON'),
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[500px]',
        },
        children: <DebugJsonModal post={post} />,
      });
    },
    [modal, t]
  );

  const deletePost = useCallback(
    (post: any) => async () => {
      if (
        !(await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete_post',
            'Are you sure you want to delete post?'
          )
        ))
      ) {
        return;
      }

      await fetch(`/posts/${post.group}`, {
        method: 'DELETE',
      });

      toaster.show(
        t('post_deleted_successfully', 'Post deleted successfully'),
        'success'
      );

      mutate();
    },
    [toaster, t, fetch, mutate]
  );

  const openStatistics = useCallback(
    (id: string) => () => {
      modal.openModal({
        title: t('statistics', 'Statistics'),
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[1400px]',
        },
        children: <StatisticsModal postId={id} />,
        size: '80%',
      });
    },
    [modal, t]
  );

  const openMissingRelease = useCallback(
    (id: string) => () => {
      modal.openModal({
        title: t('connect_post', 'Connect Post'),
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[800px]',
        },
        children: <MissingReleaseModal postId={id} onSuccess={mutate} />,
        size: '60%',
      });
    },
    [modal, t, mutate]
  );

  return {
    editPost,
    deletePost,
    copyDebugJson,
    openStatistics,
    openMissingRelease,
  };
};

export const DayView = () => {
  const calendar = useCalendar();
  const { integrations, posts, startDate } = calendar;

  // Set dayjs locale based on current language
  const currentLanguage = i18next.resolvedLanguage || 'en';
  dayjs.locale(currentLanguage);

  const currentDay = dayjs.utc(startDate);

  const options = useMemo(() => {
    const createdPosts = posts.map((post) => ({
      integration: [integrations.find((i) => i.id === post.integration.id)!],
      image: post?.integration?.picture || '',
      identifier: post?.integration?.providerIdentifier || '',
      id: post?.integration?.id || '',
      name: post?.integration?.name || '',
      time: dayjs
        .utc(post.publishDate)
        .diff(dayjs.utc(post.publishDate).startOf('day'), 'minute'),
    }));
    return sortBy(
      Object.values(
        groupBy(
          [
            ...createdPosts,
            ...integrations.flatMap((p) =>
              p.time.flatMap((t) => ({
                integration: p,
                identifier: p?.identifier,
                name: p?.name,
                id: p?.id,
                image: p?.picture,
                time: t?.time,
              }))
            ),
          ],
          (p: any) => p.time
        )
      ),
      (p) => p[0].time
    );
  }, [integrations, posts]);

  return (
    <div className="flex flex-col gap-[10px] flex-1 relative">
      <div className="absolute start-0 top-0 w-full h-full flex flex-col overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
        {options.map((option) => (
          <Fragment key={option[0].time}>
            <div className="text-center text-[14px] min-h-[21px]">
              {newDayjs()
                .utc()
                .startOf('day')
                .add(option[0].time, 'minute')
                .local()
                .format(isUSCitizen() ? 'hh:mm A' : 'LT')}
            </div>
            <div
              key={option[0].time}
              className="min-h-[60px] rounded-[10px] flex justify-center items-center gap-[10px] mb-[20px]"
            >
              <CalendarContext.Provider
                value={{
                  ...calendar,
                  integrations: uniqueIntegrationsFromTimeSlot(option),
                }}
              >
                <CalendarColumn
                  getDate={currentDay
                    .startOf('day')
                    .add(option[0].time, 'minute')
                    .local()}
                />
              </CalendarContext.Provider>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
};
const WeekCurrentTimeLine: FC<{
  containerRef: RefObject<HTMLDivElement | null>;
  now: dayjs.Dayjs;
}> = ({ containerRef, now }) => {
  const [topPx, setTopPx] = useState<number | null>(null);
  const minuteFraction = (now.minute() * 60 + now.second()) / 3600;
  const dateKey = now.format('YYYY-MM-DD');

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateTop = () => {
      setTopPx(getHourBlockTop(container, now.hour(), minuteFraction, dateKey));
    };

    updateTop();
    const observer = new ResizeObserver(updateTop);
    observer.observe(container);
    const hourEl =
      container.querySelector(
        `[data-calendar-cell="${dateKey}"][data-hour="${now.hour()}"]`
      ) ?? container.querySelector(`[data-hour="${now.hour()}"]`);
    if (hourEl instanceof HTMLElement) {
      observer.observe(hourEl);
    }

    return () => {
      observer.disconnect();
    };
  }, [containerRef, dateKey, minuteFraction, now]);

  if (topPx == null) {
    return null;
  }

  return (
    <div
      className="absolute inset-x-0 z-[40] pointer-events-none"
      style={{
        gridColumn: '1 / -1',
        gridRow: 1,
        top: topPx,
      }}
    >
      <div
        title={now.format(
          isUSCitizen() ? 'MMMM D, YYYY h:mm A' : 'D MMMM YYYY HH:mm'
        )}
        className="absolute inset-x-0 h-[4px] bg-textColor opacity-80 rounded-full pointer-events-auto -translate-y-1/2"
      />
    </div>
  );
};

export const WeekView = () => {
  const { startDate, endDate, posts, loading } = useCalendar();
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowTick, setNowTick] = useState(0);
  const { start: startHourTick, stop: stopHourTick } = useInterval(
    useCallback(() => {
      setNowTick((current) => current + 1);
    }, []),
    1000
  );

  useEffect(() => {
    startHourTick();
    return () => {
      stopHourTick();
    };
  }, [startHourTick, stopHourTick]);

  const now = useMemo(() => newDayjs(), [nowTick]);

  // Use dayjs to get localized day names
  const localizedDays = useMemo(() => {
    const currentLanguage = i18next.resolvedLanguage || 'en';
    dayjs.locale(currentLanguage);

    const days = [];
    const weekStart = newDayjs(startDate);
    for (let i = 0; i < 7; i++) {
      const day = weekStart.add(i, 'day');
      days.push({
        name: day.format('dddd'),
        day: day.format('L'),
        date: day,
      });
    }
    return days;
  }, [i18next.resolvedLanguage, startDate]);

  const todayInWeek = useMemo(
    () =>
      localizedDays.some(
        (day) => day.date.isSame(now, 'day') || day.day === now.format('L')
      ),
    [localizedDays, now]
  );

  const scrollTarget = useMemo(() => {
    if (loading) {
      return null;
    }

    const weekStart = newDayjs(startDate).startOf('day');
    const weekEnd = newDayjs(endDate).endOf('day');
    const now = newDayjs();
    const todayInWeek = !now.isBefore(weekStart) && !now.isAfter(weekEnd);

    let earliest: dayjs.Dayjs | null = null;
    for (const post of posts) {
      const local = newDayjs(post.publishDate).local();
      if (local.isBefore(weekStart) || local.isAfter(weekEnd)) {
        continue;
      }
      if (earliest === null || local.isBefore(earliest)) {
        earliest = local;
      }
    }

    if (todayInWeek && (earliest === null || now.isAfter(earliest))) {
      return {
        hour: now.hour(),
        minuteFraction: now.minute() / 60,
        dateKey: now.format('YYYY-MM-DD'),
      };
    }

    if (earliest) {
      return {
        hour: earliest.hour(),
        minuteFraction: earliest.minute() / 60,
        dateKey: earliest.format('YYYY-MM-DD'),
      };
    }

    return {
      hour: 0,
      minuteFraction: 0,
      dateKey: null,
    };
  }, [endDate, loading, posts, startDate]);

  useScrollToHour(scrollRef, scrollTarget, `${startDate}:${endDate}`);

  return (
    <div className="flex flex-col text-textColor flex-1">
      <div className="flex-1 relative">
        <div
          ref={scrollRef}
          className="grid [grid-template-columns:136px_repeat(7,_minmax(0,_1fr))] gap-[4px] rounded-[10px] absolute h-full start-0 top-0 w-full overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor"
        >
          <div className="z-10 bg-newTableHeader flex justify-center items-center flex-col h-[62px] rounded-[8px] sticky top-0"></div>
          {localizedDays.map((day, index) => (
            <div
              key={day.name}
              className="p-2 text-center bg-newTableHeader flex justify-center items-center flex-col h-[62px] rounded-[8px] sticky top-0 z-[20]"
            >
              <div className="text-[14px] font-[500] text-newTableText">
                {day.name}
              </div>
              <div
                className={clsx(
                  'text-[14px] font-[600] flex items-center justify-center gap-[6px]',
                  day.day === newDayjs().format('L') &&
                    'text-newTableTextFocused'
                )}
              >
                {day.day === newDayjs().format('L') && (
                  <div className="w-[6px] h-[6px] bg-newTableTextFocused rounded-full" />
                )}
                {day.day}
              </div>
            </div>
          ))}
          {hours.map((hour) => (
            <Fragment key={hour}>
              <div
                data-hour={hour}
                className="relative p-2 pe-4 text-center items-center justify-center flex text-[14px] text-newTableText scroll-mt-[62px] min-h-[70px]"
              >
                {convertTimeFormatBasedOnLocality(hour)}
              </div>
              {localizedDays.map((day, indexDay) => (
                <Fragment
                  key={`${startDate}-${day.date.format('YYYY-MM-DD')}-${hour}`}
                >
                  <div
                    className="relative"
                    data-calendar-cell={day.date.format('YYYY-MM-DD')}
                    data-hour={hour}
                  >
                    <CalendarColumn
                      getDate={day.date.hour(hour).startOf('hour')}
                    />
                  </div>
                </Fragment>
              ))}
            </Fragment>
          ))}
          {todayInWeek && (
            <WeekCurrentTimeLine containerRef={scrollRef} now={now} />
          )}
        </div>
      </div>
    </div>
  );
};
export const MonthView = () => {
  const { startDate } = useCalendar();
  const t = useT();

  // Use dayjs to get localized day names
  const localizedDays = useMemo(() => {
    const currentLanguage = i18next.resolvedLanguage || 'en';
    dayjs.locale(currentLanguage);

    const days = [];
    // Starting from Monday (1) to Sunday (7)
    for (let i = 1; i <= 7; i++) {
      days.push(newDayjs().day(i).format('dddd'));
    }
    return days;
  }, [i18next.resolvedLanguage]);

  const calendarDays = useMemo(() => {
    const monthStart = newDayjs(startDate);
    const currentMonth = monthStart.month();
    const currentYear = monthStart.year();

    const startOfMonth = newDayjs(new Date(currentYear, currentMonth, 1));

    // Calculate the day offset for Monday (isoWeekday() returns 1 for Monday)
    const startDayOfWeek = startOfMonth.isoWeekday(); // 1 for Monday, 7 for Sunday
    const daysBeforeMonth = startDayOfWeek - 1; // Days to show from the previous month

    // Get the start date (Monday of the first week that includes this month)
    const calendarStartDate = startOfMonth.subtract(daysBeforeMonth, 'day');

    // Create an array to hold the calendar days (6 weeks * 7 days = 42 days max)
    const calendarDays = [];
    let currentDay = calendarStartDate;
    for (let i = 0; i < 42; i++) {
      let label = 'current-month';
      if (currentDay.month() < currentMonth) label = 'previous-month';
      if (currentDay.month() > currentMonth) label = 'next-month';
      calendarDays.push({
        day: currentDay,
        label,
      });

      // Move to the next day
      currentDay = currentDay.add(1, 'day');
    }
    return calendarDays;
  }, [startDate]);

  return (
    <div className="flex flex-col text-textColor flex-1">
      <div className="flex-1 flex relative">
        <div className="grid grid-cols-7 grid-rows-[62px_auto] gap-[4px] rounded-[10px] absolute start-0 top-0 overflow-auto w-full h-full scrollbar scrollbar-thumb-tableBorder scrollbar-track-secondary">
          {localizedDays.map((day) => (
            <div
              key={day}
              className="z-[20] p-2 bg-newTableHeader flex justify-center items-center flex-col h-[62px] rounded-[8px] sticky top-0"
            >
              <div>{day}</div>
            </div>
          ))}
          {calendarDays.map((date, index) => (
            <div
              key={index}
              className="text-center items-center justify-center flex"
            >
              <CalendarColumn
                getDate={newDayjs(date.day).endOf('day')}
                randomHour={true}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export const ListView = () => {
  const t = useT();
  const user = useUser();
  const { integrations, loading, listPosts, listState, trimmedSearch } =
    useCalendar();
  const emptyMessage = trimmedSearch
    ? t('no_posts_match_search', 'No posts match your search')
    : listState === 'scheduled'
    ? t('no_upcoming_posts', 'No upcoming posts scheduled')
    : listState === 'draft'
    ? t('no_draft_posts', 'No draft posts')
    : listState === 'published'
    ? t('no_published_posts', 'No published posts')
    : t('no_posts', 'No posts');

  // Use shared post actions hook
  const {
    editPost,
    deletePost,
    copyDebugJson,
    openStatistics,
    openMissingRelease,
  } = usePostActions();

  // Group posts by date, then stack same-group posts that share a minute.
  const groupedPosts = useMemo(() => {
    const groups: { [key: string]: CalendarItemPost[] } = {};
    listPosts.forEach((post) => {
      const dateKey = newDayjs(post.publishDate).local().format('YYYY-MM-DD');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(post);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, datePosts]) => {
        const byMinute = groupBy(datePosts, (post) =>
          getListStackKey(String(post.publishDate))
        );
        const entries = Object.values(byMinute).flatMap((minutePosts) =>
          groupPostsInCell(minutePosts)
        );
        return [dateKey, entries] as const;
      });
  }, [listPosts]);

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <div className="text-textColor">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  if (listPosts.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <div className="text-textColor text-[16px]">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[10px] flex-1 relative min-w-0 max-w-full overflow-x-hidden">
      <div className="absolute start-0 top-0 w-full max-w-full h-full flex flex-col overflow-y-auto overflow-x-hidden scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
        {groupedPosts.map(([dateKey, datePosts]) => (
          <Fragment key={dateKey}>
            <div className="text-center text-[14px] min-h-[21px] text-textColor font-[500] mt-[10px] px-[10px] max-w-full">
              {newDayjs(dateKey).format(
                isUSCitizen() ? 'dddd, MMMM D, YYYY' : 'dddd, D MMMM YYYY'
              )}
            </div>
            <div className="flex flex-col gap-[10px] mb-[20px] px-[10px] mx-auto w-full max-w-[600px] min-w-0 box-border">
              {datePosts.map((entry) => {
                const post =
                  entry.kind === 'stack'
                    ? pickPrimaryPost(entry.posts)
                    : entry.post;
                return (
                  <CalendarEntry
                    key={cellEntryKey(entry)}
                    entry={entry}
                    display="day"
                    isBeforeNow={false}
                    date={newDayjs(post.publishDate)}
                    statistics={openStatistics(post.id)}
                    missingRelease={openMissingRelease(post.id)}
                    editPost={editPost(post, false)}
                    duplicatePost={editPost(post, true)}
                    copyDebugJson={
                      user?.isSuperAdmin ? copyDebugJson(post) : undefined
                    }
                    integrations={integrations}
                    deletePost={deletePost(post)}
                    showTime={true}
                  />
                );
              })}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
};

export const Calendar = () => {
  const { display } = useCalendar();
  return (
    <>
      {display === 'list' ? (
        <ListView />
      ) : display === 'day' ? (
        <DayView />
      ) : display === 'week' ? (
        <WeekView />
      ) : (
        <MonthView />
      )}
    </>
  );
};
export const CalendarColumn: FC<{
  getDate: dayjs.Dayjs;
  randomHour?: boolean;
}> = memo((props) => {
  const t = useT();

  const { getDate, randomHour } = props;
  const [num, setNum] = useState(0);
  const user = useUser();
  const {
    integrations,
    posts,
    getCellPosts,
    changeDate,
    display,
    reloadCalendarView,
    sets,
    signature,
    loading,
  } = useCalendar();
  const modal = useModals();
  const fetch = useFetch();

  // Use shared post actions hook
  const {
    editPost,
    deletePost,
    copyDebugJson,
    openStatistics,
    openMissingRelease,
  } = usePostActions();
  const postList = useMemo(
    () => getCellPosts(getDate),
    [getCellPosts, getDate]
  );
  const cellEntries = useMemo(
    () => groupPostsInCell(postList as CalendarItemPost[]),
    [postList]
  );
  const [showAll, setShowAll] = useState(false);
  const showAllFunc = useCallback(() => {
    setShowAll(true);
  }, []);
  const showLessFunc = useCallback(() => {
    setShowAll(false);
  }, []);
  const list = useMemo(() => {
    if (showAll) {
      return cellEntries;
    }
    return cellEntries.slice(0, 3);
  }, [cellEntries, showAll]);

  const isBeforeNow = useMemo(() => {
    const originalUtc = getDate.startOf('hour');
    return originalUtc
      .startOf('hour')
      .isBefore(newDayjs().startOf('hour').utc());
  }, [getDate, num]);

  const { start, stop } = useInterval(
    useCallback(() => {
      if (isBeforeNow) {
        return;
      }
      setNum(num + 1);
    }, [isBeforeNow]),
    random(120000, 150000)
  );

  useEffect(() => {
    start();
    return () => {
      stop();
    };
  }, []);

  const [{ canDrop }, drop] = useDrop(
    () => ({
      accept: 'post',
      drop: async (item: any) => {
        if (isBeforeNow) return;

        const postIds: string[] =
          item.postIds?.length > 0 ? item.postIds : [item.id];

        // Projected Pipeline items have a dynamic (unsaved) date. Dropping one on
        // an exact slot pins it to that time via the existing manual-schedule
        // action, which detaches the whole group from the Pipeline queue.
        if (item.pipelineItemId) {
          changeDate(postIds, getDate);
          const { status } = await fetch(
            `/pipelines/items/${item.pipelineItemId}/schedule`,
            {
              method: 'POST',
              body: JSON.stringify({
                date: getDate.utc().format(),
              }),
            }
          );
          if (status !== 500) {
            reloadCalendarView();
          }
          return;
        }

        // Find the post to check its state
        const post = posts.find((p) => p.id === item.id);
        let action: 'schedule' | 'update' = 'schedule';

        // Check if post is already published or queued in the past
        if (
          post &&
          (post.state === 'PUBLISHED' ||
            (post.state === 'QUEUE' &&
              dayjs().isAfter(dayjs.utc(post.publishDate))))
        ) {
          const whatToDo = await new Promise<'schedule' | 'update' | 'cancel'>(
            (resolve) => {
              modal.openModal({
                title: t('what_do_you_want_to_do', 'What do you want to do?'),
                children: (
                  <div className="flex flex-col">
                    <div className="text-[20px] mb-[20px]">
                      {t(
                        'post_already_published_republish_warning',
                        'This post was already published. Republishing will publish it again to'
                      )}{' '}
                      {post.integration?.name} {t('republish_at', 'at')}{' '}
                      {getDate.format('DD/MM/YYYY HH:mm')}.
                      {(!!item.interval || !!post.intervalInDays) && (
                        <div className="mt-[10px]">
                          {t(
                            'republish_recurring_note',
                            'This is a recurring post: your changes apply to all future recurrences starting now.'
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex w-full gap-[10px]">
                      <div className="flex-1 flex">
                        <Button
                          type="button"
                          className="flex-1"
                          onClick={() => {
                            modal.closeAll();
                            resolve('update');
                          }}
                        >
                          {t(
                            'just_update_post_details',
                            'Just update the post details'
                          )}
                        </Button>
                      </div>
                      <div className="flex-1 flex">
                        <Button
                          type="button"
                          className="flex-1"
                          onClick={() => {
                            modal.closeAll();
                            resolve('schedule');
                          }}
                        >
                          {t('reschedule_post', 'Reschedule the post')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ),
                onClose: () => resolve('cancel'),
              });
            }
          );

          if (whatToDo === 'cancel') {
            return;
          }
          action = whatToDo;
        }

        const primaryDate = post ? newDayjs(post.publishDate) : getDate;
        const delta = getDate.diff(primaryDate);
        const nextDates = postIds.map((postId) => {
          const source = posts.find((p) => p.id === postId);
          return source
            ? newDayjs(source.publishDate).add(delta, 'millisecond')
            : getDate;
        });

        if (!item.interval) {
          changeDate(postIds, getDate);
        }

        const results = await Promise.all(
          postIds.map((postId, index) =>
            fetch(`/posts/${postId}/date`, {
              method: 'PUT',
              body: JSON.stringify({
                date: nextDates[index].utc().format('YYYY-MM-DDTHH:mm:ss'),
                action,
                // published posts always confirm via the modal before reaching here;
                // for QUEUE posts the flag is a no-op on the server
                ...(action === 'schedule' ? { republish: true } : {}),
              }),
            })
          )
        );
        if (results.every((response) => response.status !== 500)) {
          if (item.interval || action === 'schedule') {
            reloadCalendarView();
          }
        }
      },
      collect: (monitor) => ({
        canDrop: isBeforeNow
          ? false
          : !!monitor.canDrop() && !!monitor.isOver(),
      }),
    }),
    [posts]
  );

  const addModal = useCallback(async () => {
    const set: any = !sets.length
      ? undefined
      : await new Promise((resolve) => {
          modal.openModal({
            title: t('select_set', 'Select a Set'),
            closeOnClickOutside: true,
            askClose: false,
            closeOnEscape: true,
            withCloseButton: true,
            onClose: () => resolve('exit'),
            children: (
              <SetSelectionModal
                sets={sets}
                onSelect={(selectedSet) => {
                  resolve(selectedSet);
                  modal.closeAll();
                }}
                onContinueWithoutSet={() => {
                  resolve(undefined);
                  modal.closeAll();
                }}
              />
            ),
          });
        });

    if (set === 'exit') return;

    modal.openModal({
      ...ADD_EDIT_MODAL_OPTIONS,
      children: (
        <AddEditModal
          allIntegrations={integrations.map((p) => ({
            ...p,
          }))}
          integrations={integrations.slice(0).map((p) => ({
            ...p,
          }))}
          mutate={reloadCalendarView}
          {...(signature?.id && !set
            ? {
                onlyValues: [
                  {
                    content: '\n' + signature.content,
                  },
                ],
              }
            : {})}
          date={
            randomHour
              ? getDate.hour(Math.floor(Math.random() * 24))
              : getDate.format('YYYY-MM-DDTHH:mm:ss') ===
                newDayjs().startOf('hour').format('YYYY-MM-DDTHH:mm:ss')
              ? newDayjs().add(10, 'minute')
              : getDate
          }
          {...(set?.content ? { set: JSON.parse(set.content) } : {})}
          reopenModal={() => ({})}
        />
      ),
    });
  }, [integrations, getDate, sets, signature]);

  const addProvider = useAddProvider();
  return (
    <div
      className={clsx(
        'flex flex-col w-full min-h-full relative',
        isBeforeNow && 'repeated-strip',
        loading && 'animate-pulse',
        isBeforeNow
          ? 'cursor-not-allowed'
          : 'border border-newTextColor/5 rounded-[8px]'
      )}
      ref={drop as any}
    >
      {display === 'month' && (
        <div className={clsx('pt-[6px] text-[14px]')}>{getDate.date()}</div>
      )}
      <div
        className={clsx(
          'relative flex flex-col flex-1 text-white rounded-[8px] min-h-[70px]',
          canDrop && 'border border-[#eb3825]'
        )}
      >
        <div
          className={clsx(
            'flex-col text-[12px] pointer w-full flex scrollbar scrollbar-thumb-tableBorder scrollbar-track-secondary',
            isBeforeNow ? 'flex-1' : 'cursor-pointer',
            isBeforeNow && postList.length === 0 && 'col-calendar'
          )}
        >
          {loading && (
            <div className="h-full w-full p-[5px] animate-pulse absolute left-0 top-0 z-[50]">
              <div className="h-full w-full bg-newSettings rounded-[10px]" />
            </div>
          )}
          {list.map((entry) => {
            const post =
              entry.kind === 'stack'
                ? pickPrimaryPost(entry.posts)
                : entry.post;
            return (
              <div
                key={cellEntryKey(entry)}
                className={clsx(
                  'text-textColor p-[2.5px] relative flex flex-col justify-center items-center'
                )}
              >
                <div className="relative w-full flex flex-col items-center p-[2.5px]">
                  <CalendarEntry
                    entry={entry}
                    display={display as 'day' | 'week' | 'month'}
                    isBeforeNow={isBeforeNow}
                    date={getDate}
                    statistics={openStatistics(post.id)}
                    missingRelease={openMissingRelease(post.id)}
                    editPost={editPost(post, false)}
                    duplicatePost={editPost(post, true)}
                    copyDebugJson={
                      user?.isSuperAdmin ? copyDebugJson(post) : undefined
                    }
                    integrations={integrations}
                    deletePost={deletePost(post)}
                  />
                </div>
              </div>
            );
          })}
          {!showAll && cellEntries.length > 3 && (
            <div
              className="text-center hover:underline py-[5px] text-textColor"
              onClick={showAllFunc}
            >
              {t('show_more', '+ Show more')} ({cellEntries.length - 3})
            </div>
          )}
          {showAll && cellEntries.length > 3 && (
            <div
              className="text-center hover:underline py-[5px]"
              onClick={showLessFunc}
            >
              {t('show_less', '- Show less')}
            </div>
          )}
        </div>
        {!isBeforeNow && (
          <div
            className="pb-[2.5px] px-[5px] flex-1 flex"
            onClick={integrations.length ? addModal : addProvider}
          >
            <div
              className={clsx(
                display === ('month' as any)
                  ? 'flex-1 min-h-[40px] w-full'
                  : !postList.length
                  ? 'min-h-full w-full p-[5px]'
                  : 'min-h-[40px] w-full',
                'flex items-center justify-center cursor-pointer pb-[2.5px]'
              )}
            >
              {display !== 'day' && (
                <div
                  className={clsx(
                    'group hover:before:h-[30px] w-full h-full rounded-[10px] flex justify-center items-center text-white'
                  )}
                >
                  <div
                    className={`group-hover:before:content-["+"] pb-[5px] flex justify-center items-center rounded-[8px] transition-all group-hover:bg-btnPrimary w-full h-full max-w-[40px] max-h-[40px]`}
                  />
                </div>
              )}
              {display === 'day' && (
                <div
                  className={`w-full h-full rounded-[10px] py-[10px] flex-wrap hover:border hover:border-seventh flex justify-center items-center gap-[20px] opacity-30 grayscale hover:grayscale-0 hover:opacity-100`}
                >
                  {integrations.map((integration) => (
                    <div className="relative" key={integration.id}>
                      <div
                        className={clsx(
                          'relative w-[34px] h-[34px] rounded-[8px] flex justify-center items-center filter transition-all duration-500'
                        )}
                      >
                        <SafeImage
                          src={integration.picture || '/no-picture.jpg'}
                          className="rounded-[8px]"
                          alt={integration.identifier}
                          width={32}
                          height={32}
                        />
                        {integration.identifier === 'youtube' ? (
                          <img
                            src="/icons/platforms/youtube.svg"
                            className="absolute z-10 -bottom-[5px] -end-[5px]"
                            width={20}
                          />
                        ) : (
                          <SafeImage
                            src={`/icons/platforms/${integration.identifier}.png`}
                            className="rounded-[8px] absolute z-10 -bottom-[5px] -end-[5px] border border-fifth"
                            alt={integration.identifier}
                            width={20}
                            height={20}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
const CalendarEntry: FC<{
  entry: CellEntry;
  date: dayjs.Dayjs;
  isBeforeNow: boolean;
  editPost: () => void;
  duplicatePost: () => void;
  copyDebugJson?: () => void;
  deletePost: () => void;
  statistics: () => void;
  missingRelease?: () => void;
  integrations: Integrations[];
  display: 'day' | 'week' | 'month';
  showTime?: boolean;
}> = memo((props) => {
  const { entry, ...itemProps } = props;
  if (entry.kind === 'stack') {
    return <StackedCalendarItem posts={entry.posts} {...itemProps} />;
  }
  return <CalendarItem post={entry.post} {...itemProps} />;
});

const ChannelAvatar: FC<{
  post: CalendarItemPost;
  size?: number;
}> = ({ post, size = 20 }) => {
  const badge = Math.max(10, Math.round(size * 0.6));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <img
        className="w-full h-full rounded-[8px]"
        src={post.integration.picture! || '/no-picture.jpg'}
      />
      <img
        className="rounded-[8px] absolute z-10 -bottom-[2px] -end-[2px] border border-fifth"
        style={{ width: badge, height: badge }}
        src={`/icons/platforms/${post.integration?.providerIdentifier}.png`}
      />
    </div>
  );
};

const StackedCalendarItem: FC<{
  date: dayjs.Dayjs;
  isBeforeNow: boolean;
  editPost: () => void;
  duplicatePost: () => void;
  copyDebugJson?: () => void;
  deletePost: () => void;
  statistics: () => void;
  missingRelease?: () => void;
  integrations: Integrations[];
  display: 'day' | 'week' | 'month';
  showTime?: boolean;
  posts: CalendarItemPost[];
}> = memo((props) => {
  const t = useT();
  const {
    posts,
    date,
    isBeforeNow,
    duplicatePost,
    copyDebugJson: _copyDebugJson,
    deletePost: _deletePost,
    statistics,
    missingRelease,
    integrations,
    display,
    showTime,
  } = props;
  const user = useUser();
  const {
    editPost: openEdit,
    deletePost,
    copyDebugJson,
    openStatistics,
    openMissingRelease,
  } = usePostActions();
  const [expanded, setExpanded] = useState(false);
  const [revealOverflow, setRevealOverflow] = useState(false);
  const stackRef = useClickOutside<HTMLDivElement>(() => {
    setExpanded(false);
  });
  const expandStack = useCallback(() => {
    setExpanded(true);
  }, []);
  useEffect(() => {
    if (!expanded) {
      setRevealOverflow(false);
      return;
    }
    const timeout = window.setTimeout(() => setRevealOverflow(true), 200);
    return () => window.clearTimeout(timeout);
  }, [expanded]);
  const primary = pickPrimaryPost(posts);
  // Wallet order: peeks on top (behind), full card at the bottom (front).
  const ordered = [...posts.filter((post) => post.id !== primary.id), primary];
  const hasError = posts.some((item) => item.state === 'ERROR');
  const errorMessage = posts
    .filter((item) => item.state === 'ERROR' && item.error)
    .map((item) => item.error)
    .join('\n');
  const hasPlatformDeleted = posts.some((item) => !!item.platformDeletedAt);

  const [{ opacity }, dragRef] = useDrag(
    () => ({
      type: 'post',
      item: {
        id: primary.id,
        postIds: posts.map((item) => item.id),
        group: primary.group,
        interval: posts.some((item) => !!item.intervalInDays),
        date,
        pipelineItemId: primary.pipelineItemId,
      },
      canDrag: !expanded,
      collect: (monitor) => ({
        opacity: monitor.isDragging() ? 0 : isBeforeNow ? 0.6 : 1,
      }),
    }),
    [isBeforeNow, posts, primary, date, expanded]
  );

  return (
    <div
      ref={stackRef}
      className={clsx(
        'relative w-full min-w-0 max-w-full box-border',
        hasError && !expanded && 'rounded-[10px] ring-2 ring-red-500'
      )}
      onClick={(event) => {
        if (expanded) {
          return;
        }
        event.stopPropagation();
        setExpanded(true);
      }}
    >
      <div
        // @ts-ignore
        ref={expanded ? undefined : dragRef}
        className="w-full min-w-0 max-w-full"
        style={{ opacity: expanded ? 1 : opacity }}
      >
        {hasError && !expanded && (
          <div
            className="absolute -top-[6px] -left-[6px] z-30 w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center text-white text-[11px] font-bold cursor-pointer"
            data-tooltip-id="tooltip"
            data-tooltip-content={
              errorMessage || 'An error occurred while publishing this post'
            }
          >
            !
          </div>
        )}
        {hasPlatformDeleted && !expanded && (
          <div
            className="absolute -top-[6px] -right-[6px] z-30 w-[18px] h-[18px] rounded-full bg-menuDots flex items-center justify-center text-white text-[11px] font-bold cursor-pointer"
            data-tooltip-id="tooltip"
            data-tooltip-content={t(
              'deleted_on_platform',
              'This post was deleted on the platform'
            )}
          >
            ×
          </div>
        )}
        {ordered.map((post, index) => {
          const isFront = index === ordered.length - 1;
          const isPeek = !expanded && !isFront;
          return (
            <div
              key={post.id}
              className={clsx(
                'relative w-full min-w-0 max-w-full box-border transition-[max-height,margin-bottom] duration-200 ease-out',
                (isPeek || (expanded && !revealOverflow)) && 'overflow-hidden'
              )}
              style={{
                zIndex: index + 1,
                maxHeight: isPeek ? STACK_PEEK_PX : STACK_EXPAND_MAX_PX,
                marginBottom: isPeek ? -10 : isFront ? 0 : 5,
              }}
            >
              <CalendarItem
                date={date}
                isBeforeNow={isBeforeNow}
                display={display}
                integrations={integrations}
                showTime={showTime}
                editPost={expanded ? openEdit(post, false) : expandStack}
                duplicatePost={expanded ? openEdit(post, true) : duplicatePost}
                deletePost={expanded ? deletePost(post) : _deletePost}
                statistics={expanded ? openStatistics(post.id) : statistics}
                missingRelease={
                  expanded ? openMissingRelease(post.id) : missingRelease
                }
                copyDebugJson={
                  expanded
                    ? user?.isSuperAdmin
                      ? copyDebugJson(post)
                      : undefined
                    : _copyDebugJson
                }
                post={post}
                stackPosts={expanded ? undefined : posts}
                disableDrag={!expanded}
                stackShadow
                hideActions={!expanded}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

const CalendarItem: FC<{
  date: dayjs.Dayjs;
  isBeforeNow: boolean;
  editPost: () => void;
  duplicatePost: () => void;
  copyDebugJson?: () => void;
  deletePost: () => void;
  statistics: () => void;
  missingRelease?: () => void;
  integrations: Integrations[];
  display: 'day' | 'week' | 'month';
  showTime?: boolean;
  disableDrag?: boolean;
  stackShadow?: boolean;
  stackPosts?: CalendarItemPost[];
  hideActions?: boolean;
  post: CalendarItemPost;
}> = memo((props) => {
  const t = useT();
  const {
    editPost,
    statistics,
    duplicatePost,
    copyDebugJson,
    post,
    date,
    isBeforeNow,
    deletePost,
    showTime,
    missingRelease,
    disableDrag,
    stackShadow,
    stackPosts,
    hideActions,
  } = props;
  const stackedPosts = stackPosts?.length ? stackPosts : [post];
  const hasError = stackedPosts.some((item) => item.state === 'ERROR');
  const errorMessage = stackedPosts
    .filter((item) => item.state === 'ERROR' && item.error)
    .map((item) => item.error)
    .join('\n');
  const hasPlatformDeleted = stackedPosts.some(
    (item) => !!item.platformDeletedAt
  );
  const { disableXAnalytics } = useVariables();
  const user = useUser();
  const showCreationMethodBadge =
    user?.impersonate &&
    post.creationMethod &&
    post.creationMethod !== 'UNKNOWN';
  const headerColor = resolveCalendarPostHeaderColor(
    post.pipelineColor,
    post?.tags?.[0]?.tag?.color
  );
  const headerForeground = headerColor
    ? getReadableForegroundColor(headerColor)
    : undefined;
  const showStatistics =
    !(post.integration.providerIdentifier === 'x' && disableXAnalytics) &&
    !!post.releaseId;
  const likesCount = Number(post.likesCount) || 0;
  const showLikes =
    post.state === 'PUBLISHED' &&
    !!post.releaseId &&
    post.releaseId !== 'missing' &&
    (!!post.likesSyncedAt || likesCount > 0);
  const likesLabel = (() => {
    const count = Math.abs(Math.round(likesCount));
    if (count < 10000) {
      return count.toLocaleString('en-US');
    }
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(count);
  })();
  const canOpenPublished = !!post.releaseURL;
  const preview = useCallback(() => {
    window.open(`/p/` + post.id + '?share=true', '_blank');
  }, [post]);
  const openPublished = useCallback(() => {
    if (!post.releaseURL) {
      return;
    }
    window.open(post.releaseURL, '_blank', 'noopener,noreferrer');
  }, [post.releaseURL]);
  const [{ opacity }, dragRef] = useDrag(
    () => ({
      type: 'post',
      item: {
        id: post.id,
        postIds: stackedPosts.map((item) => item.id),
        group: post.group,
        interval: stackedPosts.some((item) => !!item.intervalInDays),
        date,
        pipelineItemId: post.pipelineItemId,
      },
      canDrag: !disableDrag,
      collect: (monitor) => ({
        opacity: monitor.isDragging() ? 0 : isBeforeNow ? 0.6 : 1,
      }),
    }),
    [isBeforeNow, stackPosts, post, date, disableDrag]
  );
  return (
    <div
      // @ts-ignore
      ref={disableDrag ? undefined : dragRef}
      className={clsx(
        // Stacked front cards must not use h-full or they cover peek clicks.
        'w-full min-w-0 max-w-full box-border flex flex-col group',
        'relative',
        !stackShadow && 'h-full flex-1',
        stackShadow && STACK_SHADOW,
        hasError && !stackPosts && 'rounded-[10px] ring-2 ring-red-500'
      )}
      style={{
        opacity: disableDrag ? 1 : opacity,
      }}
    >
      {hasError && !stackPosts && (
        <div
          className="absolute -top-[6px] -left-[6px] z-20 w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center text-white text-[11px] font-bold cursor-pointer"
          data-tooltip-id="tooltip"
          data-tooltip-content={
            errorMessage || 'An error occurred while publishing this post'
          }
        >
          !
        </div>
      )}
      {hasPlatformDeleted && !stackPosts && (
        <div
          className="absolute -top-[6px] -right-[6px] z-20 w-[18px] h-[18px] rounded-full bg-menuDots flex items-center justify-center text-white text-[11px] font-bold cursor-pointer"
          data-tooltip-id="tooltip"
          data-tooltip-content={t(
            'deleted_on_platform',
            'This post was deleted on the platform'
          )}
        >
          ×
        </div>
      )}
      {showCreationMethodBadge && (
        <div className="absolute -bottom-[4px] -right-[4px] z-10">
          <CreationMethodBadge
            creationMethod={post.creationMethod}
            ringColor="var(--new-bgColor)"
          />
        </div>
      )}
      <div
        onClick={editPost}
        className={clsx(
          'text-[11px] max-h-[24px] h-[24px] min-h-[24px] w-full min-w-0 max-w-full rounded-tr-[10px] rounded-tl-[10px] flex items-center gap-[6px] px-[8px] cursor-pointer',
          !headerColor && 'text-white bg-btnPrimary'
        )}
        style={{
          backgroundColor: headerColor,
          color: headerForeground,
        }}
      >
        <ChannelAvatar post={post} size={18} />
        <div className="min-w-0 flex-1 font-[600] truncate text-start">
          {post.integration?.name || post.integration?.providerIdentifier}
        </div>
      </div>
      <div
        onClick={editPost}
        className={clsx(
          'w-full min-w-0 max-w-full flex flex-col gap-[4px] flex-1 rounded-br-[10px] rounded-bl-[10px] p-[8px] text-[14px] bg-newColColor cursor-pointer',
          'relative overflow-hidden',
          isBeforeNow && '!grayscale'
        )}
      >
        <div className="flex items-center gap-[6px] min-w-0 max-w-full">
          <div className="flex-1 min-w-0 overflow-hidden text-ellipsis break-words line-clamp-1 text-start">
            {stripHtmlValidation('none', post.content, false, true, false) ||
              t('no_content', 'no content')}
          </div>
          {showTime && (
            <div className="text-textColor/50 text-[12px] whitespace-nowrap shrink-0">
              {newDayjs(post.publishDate)
                .local()
                .format(isUSCitizen() ? 'hh:mm A' : 'HH:mm')}
            </div>
          )}
        </div>
        {showLikes && (
          <div
            className="flex items-center gap-[4px] text-[12px] text-textColor/50 min-w-0 max-w-full"
            data-tooltip-id="tooltip"
            data-tooltip-content={t('post_likes_count', 'Likes')}
          >
            <CalendarLikesIcon />
            <span className="truncate">{likesLabel}</span>
          </div>
        )}
        <div
          className={clsx(
            'flex items-center gap-[8px] h-[15px] min-w-0 max-w-full invisible opacity-0 pointer-events-none',
            !hideActions &&
              'group-hover:visible group-hover:opacity-100 group-hover:pointer-events-auto'
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {copyDebugJson && (
            <div
              className="hover:underline cursor-pointer"
              onClick={copyDebugJson}
            >
              <CopyDebug />
            </div>
          )}
          <div
            className="hover:underline cursor-pointer"
            onClick={duplicatePost}
          >
            <Duplicate />
          </div>
          {canOpenPublished ? (
            <div
              className="hover:underline cursor-pointer"
              onClick={openPublished}
            >
              <OpenPublished />
            </div>
          ) : (
            <div className="hover:underline cursor-pointer" onClick={preview}>
              <Preview />
            </div>
          )}
          {showStatistics &&
            (post.releaseId === 'missing' && missingRelease ? (
              <div
                className="hover:underline cursor-pointer"
                onClick={missingRelease}
              >
                <Statistics />
              </div>
            ) : post.releaseId !== 'missing' ? (
              <div
                className="hover:underline cursor-pointer"
                onClick={statistics}
              >
                <Statistics />
              </div>
            ) : null)}
          <div className="hover:underline cursor-pointer" onClick={deletePost}>
            <DeletePost />
          </div>
        </div>
      </div>
    </div>
  );
});
const DebugJsonModal: FC<{ post: any }> = ({ post }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { closeCurrent } = useModals();

  const copyPostId = useCallback(() => {
    copy(post.id);
    toaster.show(t('post_id_copied', 'Post ID copied to clipboard'), 'success');
    closeCurrent();
  }, [post, toaster, t, closeCurrent]);

  const copyJson = useCallback(async () => {
    try {
      const data = await (
        await fetch(`/posts/group/${post.group}/debug-export`)
      ).json();
      copy(JSON.stringify(data, null, 2));
      toaster.show(
        t('debug_json_copied', 'Debug JSON copied to clipboard'),
        'success'
      );
      closeCurrent();
    } catch {
      toaster.show(
        t('debug_json_copy_failed', 'Failed to copy debug data'),
        'warning'
      );
    }
  }, [fetch, post, toaster, t, closeCurrent]);

  return (
    <div className="flex flex-col gap-[16px] p-[16px]">
      <div className="text-textColor text-[14px]">
        {t('debug_choose_copy', 'Choose what you want to copy')}
      </div>
      <div className="flex gap-[10px]">
        <Button onClick={copyPostId}>
          {t('copy_post_id', 'Copy post id')}
        </Button>
        <Button secondary onClick={copyJson}>
          {t('copy_debug_json', 'Copy Debug JSON')}
        </Button>
      </div>
    </div>
  );
};
const CopyDebug = () => {
  const t = useT();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('copy_debug_json', 'Copy Debug JSON')}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
};
const Duplicate = () => {
  const t = useT();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 32 32"
      fill="none"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('duplicate_post', 'Duplicate Post')}
    >
      <path
        d="M27 5H9C8.46957 5 7.96086 5.21071 7.58579 5.58579C7.21071 5.96086 7 6.46957 7 7V9H5C4.46957 9 3.96086 9.21071 3.58579 9.58579C3.21071 9.96086 3 10.4696 3 11V25C3 25.5304 3.21071 26.0391 3.58579 26.4142C3.96086 26.7893 4.46957 27 5 27H23C23.5304 27 24.0391 26.7893 24.4142 26.4142C24.7893 26.0391 25 25.5304 25 25V23H27C27.5304 23 28.0391 22.7893 28.4142 22.4142C28.7893 22.0391 29 21.5304 29 21V7C29 6.46957 28.7893 5.96086 28.4142 5.58579C28.0391 5.21071 27.5304 5 27 5ZM23 11V13H5V11H23ZM23 25H5V15H23V25ZM27 21H25V11C25 10.4696 24.7893 9.96086 24.4142 9.58579C24.0391 9.21071 23.5304 9 23 9H9V7H27V21Z"
        fill="currentColor"
      />
    </svg>
  );
};
const Preview = () => {
  const t = useT();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 32 32"
      fill="none"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('preview_post', 'Preview Post')}
    >
      <path
        d="M30.9137 15.595C30.87 15.4963 29.8112 13.1475 27.4575 10.7937C24.3212 7.6575 20.36 6 16 6C11.64 6 7.67874 7.6575 4.54249 10.7937C2.18874 13.1475 1.12499 15.5 1.08624 15.595C1.02938 15.7229 1 15.8613 1 16.0012C1 16.1412 1.02938 16.2796 1.08624 16.4075C1.12999 16.5062 2.18874 18.8538 4.54249 21.2075C7.67874 24.3425 11.64 26 16 26C20.36 26 24.3212 24.3425 27.4575 21.2075C29.8112 18.8538 30.87 16.5062 30.9137 16.4075C30.9706 16.2796 31 16.1412 31 16.0012C31 15.8613 30.9706 15.7229 30.9137 15.595ZM16 24C12.1525 24 8.79124 22.6012 6.00874 19.8438C4.86704 18.7084 3.89572 17.4137 3.12499 16C3.89551 14.5862 4.86686 13.2915 6.00874 12.1562C8.79124 9.39875 12.1525 8 16 8C19.8475 8 23.2087 9.39875 25.9912 12.1562C27.1352 13.2912 28.1086 14.5859 28.8812 16C27.98 17.6825 24.0537 24 16 24ZM16 10C14.8133 10 13.6533 10.3519 12.6666 11.0112C11.6799 11.6705 10.9108 12.6075 10.4567 13.7039C10.0026 14.8003 9.88377 16.0067 10.1153 17.1705C10.3468 18.3344 10.9182 19.4035 11.7573 20.2426C12.5965 21.0818 13.6656 21.6532 14.8294 21.8847C15.9933 22.1162 17.1997 21.9974 18.2961 21.5433C19.3924 21.0892 20.3295 20.3201 20.9888 19.3334C21.6481 18.3467 22 17.1867 22 16C21.9983 14.4092 21.3657 12.884 20.2408 11.7592C19.1159 10.6343 17.5908 10.0017 16 10ZM16 20C15.2089 20 14.4355 19.7654 13.7777 19.3259C13.1199 18.8864 12.6072 18.2616 12.3045 17.5307C12.0017 16.7998 11.9225 15.9956 12.0768 15.2196C12.2312 14.4437 12.6122 13.731 13.1716 13.1716C13.731 12.6122 14.4437 12.2312 15.2196 12.0769C15.9956 11.9225 16.7998 12.0017 17.5307 12.3045C18.2616 12.6072 18.8863 13.1199 19.3259 13.7777C19.7654 14.4355 20 15.2089 20 16C20 17.0609 19.5786 18.0783 18.8284 18.8284C18.0783 19.5786 17.0609 20 16 20Z"
        fill="currentColor"
      />
    </svg>
  );
};
const OpenPublished = () => {
  const t = useT();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('open_post', 'Open Post')}
    >
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
};
export const Statistics = () => {
  const t = useT();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 32 32"
      fill="none"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('post_statistics', 'Post Statistics')}
    >
      <path
        d="M28 25H27V5C27 4.73478 26.8946 4.48043 26.7071 4.29289C26.5196 4.10536 26.2652 4 26 4H19C18.7348 4 18.4804 4.10536 18.2929 4.29289C18.1054 4.48043 18 4.73478 18 5V10H12C11.7348 10 11.4804 10.1054 11.2929 10.2929C11.1054 10.4804 11 10.7348 11 11V16H6C5.73478 16 5.48043 16.1054 5.29289 16.2929C5.10536 16.4804 5 16.7348 5 17V25H4C3.73478 25 3.48043 25.1054 3.29289 25.2929C3.10536 25.4804 3 25.7348 3 26C3 26.2652 3.10536 26.5196 3.29289 26.7071C3.48043 26.8946 3.73478 27 4 27H28C28.2652 27 28.5196 26.8946 28.7071 26.7071C28.8946 26.5196 29 26.2652 29 26C29 25.7348 28.8946 25.4804 28.7071 25.2929C28.5196 25.1054 28.2652 25 28 25ZM20 6H25V25H20V6ZM13 12H18V25H13V12ZM7 18H11V25H7V18Z"
        fill="currentColor"
      />
    </svg>
  );
};

const CalendarLikesIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

export const DeletePost = () => {
  const t = useT();
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('delete_post', 'Delete Post')}
    >
      <path
        d="M15 10V18H9V10H15ZM14 4H9.9L8.9 5H6V7H18V5H15L14 4ZM17 8H7V18C7 19.1 7.9 20 9 20H15C16.1 20 17 19.1 17 18V8Z"
        fill="currentColor"
      />
    </svg>
  );
};

export const SetSelectionModal: FC<{
  sets: any[];
  onSelect: (set: any) => void;
  onContinueWithoutSet: () => void;
}> = ({ sets, onSelect, onContinueWithoutSet }) => {
  const t = useT();

  return (
    <div className="flex flex-col gap-4">
      <div className="text-lg font-medium">
        {t('choose_set_or_continue', 'Choose a set or continue without one')}
      </div>

      <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
        {sets.map((set) => (
          <div
            key={set.id}
            onClick={() => onSelect(set)}
            className="p-3 border border-tableBorder rounded-lg cursor-pointer hover:transition-colors"
          >
            <div className="font-medium">{set.name}</div>
            {set.description && (
              <div className="text-sm text-gray-400 mt-1">
                {set.description}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-2 border-t border-tableBorder">
        <button
          onClick={onContinueWithoutSet}
          className="flex-1 px-4 py-2 text-textColor rounded-lg hover:transition-colors"
        >
          {t('continue_without_set', 'Continue without set')}
        </button>
      </div>
    </div>
  );
};

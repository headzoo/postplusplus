'use client';

import React, { FC, useEffect, useMemo, useRef } from 'react';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { CustomScrollArea } from '@gitroom/frontend/components/ui/custom.scroll.area';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AdminScheduleLogSlug } from '@gitroom/nestjs-libraries/database/prisma/admin-schedule-logs/admin-schedule-log.slugs';
import {
  AdminScheduleLogRow,
  useAdminScheduleLogs,
} from '@gitroom/frontend/components/admin/use.admin-schedule-logs';
import clsx from 'clsx';

const TITLES: Record<AdminScheduleLogSlug, string> = {
  'relationship-grades': 'Relationship grades',
  'follower-bot-scores': 'Follower bot scores',
  'hot-triage': 'Hot triage',
  'follower-cultivate': 'Follower cultivate',
  'lead-bridge': 'Lead discovery',
  'missing-post-recovery': 'Missing post recovery',
  'post-workflows': 'Post workflows',
  'autopost-workflows': 'Autopost workflows',
};

const levelClass = (level: AdminScheduleLogRow['level']) => {
  if (level === 'ERROR') {
    return 'text-red-400';
  }
  if (level === 'WARN') {
    return 'text-yellow-400';
  }
  return 'opacity-70';
};

const safeParseMeta = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const formatMeta = (value: string) => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '{}') {
    return undefined;
  }
  const parsed = safeParseMeta(trimmed);
  return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
};

export const AdminScheduleLogsModal: FC<{ keySlug: AdminScheduleLogSlug }> = ({
  keySlug,
}) => {
  const modal = useModals();
  const t = useT();
  const { data, error, isLoading } = useAdminScheduleLogs(keySlug);
  const viewportRef = useRef<HTMLElement | null>(null);
  const stickToBottom = useRef(true);
  const lastId = useRef<string | undefined>(undefined);

  const rows = useMemo(() => {
    const items = data?.items || [];
    return [...items].reverse();
  }, [data?.items]);

  useEffect(() => {
    const newest = rows[rows.length - 1]?.id;
    if (!newest || newest === lastId.current) {
      return;
    }
    lastId.current = newest;
    if (!stickToBottom.current || !viewportRef.current) {
      return;
    }
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [rows]);

  return (
    <div className="relative flex-1 min-h-0 h-full w-full">
      <CustomScrollArea
        className="h-full w-full rounded-[4px] border border-newTableBorder bg-newBgColorInner"
        contentClassName="px-[16px] pb-[16px] pe-[28px]"
        onScroll={(viewport) => {
          viewportRef.current = viewport;
          const remaining =
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
          stickToBottom.current = remaining < 48;
        }}
      >
        <div className="sticky top-0 bg-newBgColorInner py-[16px] flex items-center justify-between gap-[12px] z-10 border-b border-newTableBorder mb-[12px]">
          <div className="text-[16px] font-[600]">
            {t('admin_schedule_logs_title', 'Logs')}: {TITLES[keySlug]}
          </div>
          <button
            className="outline-none w-[28px] h-[28px] flex items-center justify-center hover:bg-tableBorder cursor-pointer rounded"
            type="button"
            onClick={() => modal.closeCurrent()}
          >
            <svg
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
            >
              <path
                d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44595 11.7816 3.2214C11.5571 2.99685 11.196 2.99685 10.9715 3.2214L7.50005 6.69286L4.02858 3.2214C3.80403 2.99685 3.44296 2.99685 3.21841 3.2214C2.99386 3.44595 2.99386 3.80702 3.21841 4.03157L6.68988 7.50304L3.21841 10.9745C2.99386 11.1991 2.99386 11.5601 3.21841 11.7847C3.44296 12.0092 3.80403 12.0092 4.02858 11.7847L7.50005 8.31322L10.9715 11.7847C11.196 12.0092 11.5571 12.0092 11.7816 11.7847C12.0062 11.5601 12.0062 11.1991 11.7816 10.9745L8.31018 7.50304L11.7816 4.03157Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {isLoading && !data ? (
          <LoadingComponent />
        ) : error ? (
          <div className="text-red-400 text-[13px]">
            {t('admin_schedule_logs_error', 'Failed to load logs.')}
          </div>
        ) : !rows.length ? (
          <div className="opacity-70 text-[13px]">
            {t('admin_schedule_logs_empty', 'No logs yet for this schedule.')}
          </div>
        ) : (
          <div className="flex flex-col gap-[8px] font-mono text-[12px]">
            {rows.map((row) => {
              const meta = formatMeta(row.meta);
              return (
                <div
                  key={row.id}
                  className="border border-newTableBorder/60 rounded-[6px] px-[10px] py-[8px] bg-newBgColorInner"
                >
                  <div className="flex flex-wrap gap-[8px] items-center mb-[4px]">
                    <span className="opacity-60">
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                    <span className={clsx('font-[600]', levelClass(row.level))}>
                      {row.level}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap break-words">{row.message}</div>
                  {meta ? (
                    <pre className="mt-[8px] text-[11px] bg-sixth p-[8px] rounded overflow-auto max-h-[20vh] whitespace-pre-wrap break-all opacity-80">
                      {meta}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CustomScrollArea>
    </div>
  );
};

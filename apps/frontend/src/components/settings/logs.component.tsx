'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import copy from 'copy-to-clipboard';
import { Button } from '@gitroom/react/form/button';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { CustomScrollArea } from '@gitroom/frontend/components/ui/custom.scroll.area';
import {
  LogsResponse,
  PostHttpLogRow,
  usePostLogs,
  useWebhookLogs,
  WebhookHttpLogRow,
} from '@gitroom/frontend/components/settings/use.logs';
import { ChannelTrackingAlert } from '@gitroom/frontend/components/settings/channel-tracking-alert.component';
import { useChannelTrackingAlerts } from '@gitroom/frontend/components/settings/use.channel.tracking.alerts';

const isWebhookLog = (
  row: PostHttpLogRow | WebhookHttpLogRow
): row is WebhookHttpLogRow => 'direction' in row;

const WEBHOOK_EVENT_TYPES = [
  'like.create',
  'follow.follow',
  'follow.unfollow',
  'post.create',
  'post.delete',
  'post.mention.create',
  'post.repost.create',
  'post.reply.create',
  'post.quote.create',
] as const;

const WEBHOOK_EVENT_LABELS: Record<string, string> = {
  'post.create': 'Created Post',
  'follow.follow': 'Follow',
  'follow.unfollow': 'Unfollow',
  'like.create': 'Like',
  'post.delete': 'Deleted Post',
  'post.mention.create': 'Mention',
  'post.repost.create': 'Repost',
  'post.reply.create': 'Reply',
  'post.quote.create': 'Quote',
};

const webhookEventLabel = (eventType?: string | null) => {
  if (!eventType) {
    return '—';
  }
  return WEBHOOK_EVENT_LABELS[eventType] || eventType;
};

const formatWebhookDirection = (direction: string) =>
  direction.charAt(0).toUpperCase() + direction.slice(1).toLowerCase();

const webhookIdentityUrl = (username?: string | null) => {
  if (!username) {
    return undefined;
  }
  const handle = username.replace(/^@+/, '').trim();
  if (!handle || /[\s/]/.test(handle)) {
    return undefined;
  }
  if (handle.includes('.')) {
    return `https://${handle}`;
  }
  return `https://x.com/${encodeURIComponent(handle)}`;
};

const LogIdentity: FC<{
  displayName?: string | null;
  username?: string | null;
}> = ({ displayName, username }) => {
  if (!displayName && !username) {
    return <span>—</span>;
  }
  const profileUrl = webhookIdentityUrl(username);
  return (
    <div className="min-w-0">
      {displayName ? (
        <div className="truncate">{displayName}</div>
      ) : null}
      {username ? (
        profileUrl ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="truncate opacity-60 text-[12px] hover:underline hover:opacity-80 block"
          >
            @{username}
          </a>
        ) : (
          <div className="truncate opacity-60 text-[12px]">@{username}</div>
        )
      ) : null}
    </div>
  );
};

const safeParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const formatJson = (value: string) => {
  const parsed = safeParse(value);
  return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
};

const LogDetailsModal: FC<{
  title: string;
  row: PostHttpLogRow | WebhookHttpLogRow;
}> = ({ title, row }) => {
  const modal = useModals();
  const toaster = useToaster();
  const t = useT();
  const copyAll = useCallback(() => {
    copy(
      JSON.stringify(
        {
          ...row,
          requestHeaders: safeParse(row.requestHeaders),
          requestBody: safeParse(row.requestBody),
          responseHeaders: safeParse(row.responseHeaders),
          responseBody: safeParse(row.responseBody),
        },
        null,
        2
      )
    );
    toaster.show(t('copied_to_clipboard', 'Copied to clipboard'), 'success');
  }, [row, t, toaster]);

  return (
    <CustomScrollArea
      className="rounded-[4px] border border-newTableBorder bg-newBgColorInner relative w-full"
      maxHeight="80vh"
      contentClassName="px-[16px] pb-[16px] pe-[28px]"
    >
      <div className="sticky top-0 bg-newBgColorInner py-[16px] flex items-center justify-between gap-[12px] z-10 border-b border-newTableBorder mb-[12px]">
        <div className="text-[16px] font-[600]">{title}</div>
        <div className="flex gap-[8px] items-center">
          <Button onClick={copyAll} type="button">
            {t('copy', 'Copy')}
          </Button>
          <button
            className="outline-none w-[28px] h-[28px] flex items-center justify-center hover:bg-tableBorder cursor-pointer rounded"
            type="button"
            onClick={() => modal.closeAll()}
          >
            <svg
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
            >
              <path
                d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.557 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[12px] text-[13px] mb-[12px]">
        <div>
          <div className="opacity-60">{t('method', 'Method')}</div>
          <div>
            {row.method} {row.statusCode ?? '—'}
          </div>
        </div>
        <div>
          <div className="opacity-60">{t('created', 'Created')}</div>
          <div>{new Date(row.createdAt).toLocaleString()}</div>
        </div>
        <div className="col-span-2">
          <div className="opacity-60">{t('url', 'URL')}</div>
          <div className="break-all">{row.url}</div>
        </div>
        {isWebhookLog(row) ? (
          <>
            <div>
              <div className="opacity-60">{t('event_type', 'Event type')}</div>
              <div>{webhookEventLabel(row.eventType)}</div>
            </div>
            <div>
              <div className="opacity-60">{t('source', 'Source')}</div>
              <LogIdentity
                displayName={row.sourceDisplayName}
                username={row.sourceUsername}
              />
            </div>
            <div>
              <div className="opacity-60">{t('target', 'Target')}</div>
              <LogIdentity
                displayName={row.targetDisplayName}
                username={row.targetUsername}
              />
            </div>
          </>
        ) : null}
        {row.error ? (
          <div className="col-span-2">
            <div className="opacity-60">{t('error', 'Error')}</div>
            <div className="break-all">{row.error}</div>
          </div>
        ) : null}
      </div>

      <div className="text-[13px] font-[600] mb-[6px]">
        {t('request_headers', 'request headers')}
      </div>
      <pre className="text-[12px] bg-sixth p-[12px] rounded overflow-auto max-h-[20vh] whitespace-pre-wrap break-all">
        {formatJson(row.requestHeaders)}
      </pre>
      <div className="text-[13px] font-[600] mb-[6px] mt-[12px]">
        {t('request_body', 'request body')}
      </div>
      <pre className="text-[12px] bg-sixth p-[12px] rounded overflow-auto max-h-[20vh] whitespace-pre-wrap break-all">
        {formatJson(row.requestBody)}
      </pre>
      <div className="text-[13px] font-[600] mb-[6px] mt-[12px]">
        {t('response_headers', 'response headers')}
      </div>
      <pre className="text-[12px] bg-sixth p-[12px] rounded overflow-auto max-h-[20vh] whitespace-pre-wrap break-all">
        {formatJson(row.responseHeaders)}
      </pre>
      <div className="text-[13px] font-[600] mb-[6px] mt-[12px]">
        {t('response_body', 'response body')}
      </div>
      <pre className="text-[12px] bg-sixth p-[12px] rounded overflow-auto max-h-[20vh] whitespace-pre-wrap break-all">
        {formatJson(row.responseBody)}
      </pre>
    </CustomScrollArea>
  );
};

const PostLogsTable: FC<{
  posts?: LogsResponse<PostHttpLogRow>;
  isLoading: boolean;
  error?: Error;
}> = ({ posts, isLoading, error }) => {
  const t = useT();
  const modal = useModals();

  const openPost = useCallback(
    (row: PostHttpLogRow) => {
      modal.openModal({
        closeOnClickOutside: true,
        withCloseButton: false,
        classNames: {
          modal: 'w-[100%] max-w-[1100px] text-textColor',
        },
        children: (
          <LogDetailsModal title={t('post_log', 'Post log')} row={row} />
        ),
      });
    },
    [modal, t]
  );

  if (isLoading) {
    return <LoadingComponent />;
  }
  if (error) {
    return (
      <div className="text-red-400">
        {t('failed_to_load_logs', 'Failed to load logs.')}
      </div>
    );
  }

  if (!posts || posts.items.length === 0) {
    return (
      <div className="opacity-70">{t('no_logs_found', 'No logs found.')}</div>
    );
  }

  return (
    <div className="border border-newTableBorder rounded-[8px] overflow-hidden">
      <div className="grid grid-cols-[170px_90px_80px_120px_1fr_90px] gap-[12px] px-[12px] py-[10px] bg-newTableHeader text-[12px] uppercase opacity-70 border-b border-newTableBorder">
        <div>{t('created', 'Created')}</div>
        <div>{t('status', 'Status')}</div>
        <div>{t('method', 'Method')}</div>
        <div>{t('provider', 'Provider')}</div>
        <div>{t('url', 'URL')}</div>
        <div className="text-right">{t('actions', 'Actions')}</div>
      </div>
      {posts.items.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[170px_90px_80px_120px_1fr_90px] gap-[12px] px-[12px] py-[10px] text-[13px] border-b border-newTableBorder last:border-b-0 items-center"
        >
          <div>{new Date(row.createdAt).toLocaleString()}</div>
          <div>{row.statusCode ?? row.error ?? '—'}</div>
          <div>{row.method}</div>
          <div>{row.provider}</div>
          <div className="break-all opacity-80">{row.url}</div>
          <div className="flex justify-end">
            <Button secondary type="button" onClick={() => openPost(row)}>
              {t('view', 'View')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

const WebhookLogsTable: FC<{
  webhooks?: LogsResponse<WebhookHttpLogRow>;
  isLoading: boolean;
  error?: Error;
}> = ({ webhooks, isLoading, error }) => {
  const t = useT();
  const modal = useModals();

  const openWebhook = useCallback(
    (row: WebhookHttpLogRow) => {
      modal.openModal({
        closeOnClickOutside: true,
        withCloseButton: false,
        classNames: {
          modal: 'w-[100%] max-w-[1100px] text-textColor',
        },
        children: (
          <LogDetailsModal title={t('webhook_log', 'Webhook log')} row={row} />
        ),
      });
    },
    [modal, t]
  );

  if (isLoading) {
    return <LoadingComponent />;
  }
  if (error) {
    return (
      <div className="text-red-400">
        {t('failed_to_load_logs', 'Failed to load logs.')}
      </div>
    );
  }

  if (!webhooks || webhooks.items.length === 0) {
    return (
      <div className="opacity-70">{t('no_logs_found', 'No logs found.')}</div>
    );
  }

  return (
    <div className="border border-newTableBorder rounded-[8px] overflow-hidden">
      <div className="grid grid-cols-[170px_90px_110px_140px_140px_1fr_90px] gap-[12px] px-[12px] py-[10px] bg-newTableHeader text-[12px] uppercase opacity-70 border-b border-newTableBorder">
        <div>{t('created', 'Created')}</div>
        <div className="text-center">{t('log_status', 'Status')}</div>
        <div>{t('direction', 'Direction')}</div>
        <div>{t('source', 'Source')}</div>
        <div>{t('target', 'Target')}</div>
        <div>{t('event', 'Event')}</div>
        <div className="text-right">{t('actions', 'Actions')}</div>
      </div>
      {webhooks.items.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[170px_90px_110px_140px_140px_1fr_90px] gap-[12px] px-[12px] py-[10px] text-[13px] border-b border-newTableBorder last:border-b-0 items-center"
        >
          <div>{new Date(row.createdAt).toLocaleString()}</div>
          <div className="text-center">{row.statusCode ?? row.error ?? '—'}</div>
          <div>{formatWebhookDirection(row.direction)}</div>
          <LogIdentity
            displayName={row.sourceDisplayName}
            username={row.sourceUsername}
          />
          <LogIdentity
            displayName={row.targetDisplayName}
            username={row.targetUsername}
          />
          <div className="truncate opacity-80">{webhookEventLabel(row.eventType)}</div>
          <div className="flex justify-end">
            <Button secondary type="button" onClick={() => openWebhook(row)}>
              {t('view', 'View')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export const WebhookLogsPanel: FC = () => {
  const t = useT();
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<'INBOUND' | 'OUTBOUND' | ''>('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const limit = 20;
  const webhooks = useWebhookLogs(page, limit, direction, search, eventType);
  const trackingAlerts = useChannelTrackingAlerts();
  const totalPages = Math.max(
    1,
    Math.ceil((webhooks.data?.total || 0) / limit)
  );

  const refreshLogs = useCallback(() => {
    webhooks.mutate();
  }, [webhooks]);

  const applySearch = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setPage(0);
      setSearch(searchDraft.trim());
    },
    [searchDraft]
  );

  return (
    <div className="flex flex-col gap-[16px] w-full">
      {trackingAlerts.data?.map((alert) => (
        <div key={alert.integrationId}>
          <ChannelTrackingAlert
            channelName={alert.channelName}
            tracking={alert.details.tracking}
            subscriptions={alert.details.subscriptions}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-[8px] w-full">
        <Button
          type="button"
          secondary
          loading={!!webhooks.isValidating && !webhooks.isLoading}
          onClick={refreshLogs}
        >
          {t('refresh', 'Refresh')}
        </Button>
        <div className="flex flex-wrap items-center gap-[8px] ml-auto">
          <select
            aria-label={t('direction', 'Direction')}
            value={direction}
            onChange={(event) => {
              setPage(0);
              setDirection(event.target.value as 'INBOUND' | 'OUTBOUND' | '');
            }}
            className="bg-newBgColorInner h-[40px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
          >
            <option value="">{t('all_directions', 'All directions')}</option>
            <option value="OUTBOUND">{t('outbound', 'Outbound')}</option>
            <option value="INBOUND">{t('inbound', 'Inbound')}</option>
          </select>
          <select
            aria-label={t('event_type', 'Event type')}
            value={eventType}
            onChange={(event) => {
              setPage(0);
              setEventType(event.target.value);
            }}
            className="bg-newBgColorInner h-[40px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
          >
            <option value="">{t('all_event_types', 'All event types')}</option>
            {WEBHOOK_EVENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {WEBHOOK_EVENT_LABELS[value]}
              </option>
            ))}
          </select>
          <form className="flex items-center gap-[8px]" onSubmit={applySearch}>
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={t('search_source_or_target', 'Search source or target')}
              className="bg-newBgColorInner h-[40px] w-[220px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
            />
            <Button type="submit" secondary>
              {t('search', 'Search')}
            </Button>
          </form>
        </div>
      </div>
      <div className="w-full">
        <WebhookLogsTable
          webhooks={webhooks.data}
          isLoading={!!webhooks.isLoading}
          error={webhooks.error}
        />
      </div>
      <div className="flex items-center justify-between w-full">
        <div className="text-[13px] opacity-70">
          {t('page', 'Page')} {page + 1} {t('of', 'of')} {totalPages}
        </div>
        <div className="flex gap-[8px]">
          <Button
            secondary
            type="button"
            disabled={page === 0}
            onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
          >
            {t('previous', 'Previous')}
          </Button>
          <Button
            type="button"
            disabled={!webhooks.data?.hasMore}
            onClick={() => setPage((currentPage) => currentPage + 1)}
          >
            {t('next', 'Next')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export const LogsSettings: FC = () => {
  const t = useT();
  const [page, setPage] = useState(0);
  const limit = 20;
  const posts = usePostLogs(page, limit);
  const totalPages = Math.max(1, Math.ceil((posts.data?.total || 0) / limit));

  const refreshLogs = useCallback(() => {
    posts.mutate();
  }, [posts]);

  const subtitle = useMemo(
    () =>
      t(
        'inspect_outgoing_http_for_posts',
        'Inspect outgoing HTTP for posts.'
      ),
    [t]
  );

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('logs', 'Logs')}</h3>
      <div className="text-customColor18 mt-[4px]">{subtitle}</div>
      <div className="my-[16px] bg-sixth border-fifth items-center border rounded-[4px] p-[24px] flex flex-col gap-[16px]">
        <div className="flex flex-wrap items-center gap-[8px] w-full">
          <Button
            type="button"
            secondary
            loading={!!posts.isValidating && !posts.isLoading}
            onClick={refreshLogs}
          >
            {t('refresh', 'Refresh')}
          </Button>
        </div>
        <div className="w-full">
          <PostLogsTable
            posts={posts.data}
            isLoading={!!posts.isLoading}
            error={posts.error}
          />
        </div>
        <div className="flex items-center justify-between w-full">
          <div className="text-[13px] opacity-70">
            {t('page', 'Page')} {page + 1} {t('of', 'of')} {totalPages}
          </div>
          <div className="flex gap-[8px]">
            <Button
              secondary
              type="button"
              disabled={page === 0}
              onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
            >
              {t('previous', 'Previous')}
            </Button>
            <Button
              type="button"
              disabled={!posts.data?.hasMore}
              onClick={() => setPage((currentPage) => currentPage + 1)}
            >
              {t('next', 'Next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

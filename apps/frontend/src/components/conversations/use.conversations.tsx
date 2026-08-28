'use client';

import { useCallback, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export type ConversationPost = {
  externalId: string;
  url: string;
  content: string;
  publishedAt: string;
  author: {
    externalId: string;
    name?: string;
    username?: string;
    picture?: string;
    profileUrl?: string;
  };
  media?: Array<{ type: 'image' | 'video'; url: string }>;
  quotedPost?: ConversationPost;
  repostedPost?: ConversationPost;
  version: number;
  completeness: 'complete' | 'partial' | 'missing';
};

export type Conversation = {
  id: string;
  type: 'mention' | 'quote' | 'repost';
  eventAt: string;
  provider: string;
  channel: {
    id: string;
    name: string;
    picture?: string;
    username?: string;
  };
  actor: ConversationPost['author'];
  post?: ConversationPost;
  snapshotState: 'complete' | 'partial' | 'missing';
  actions: {
    likeUrl?: string;
    replyUrl?: string;
    canRepost: boolean;
    canQuote?: boolean;
    repostReason?: string;
  };
};

export type ConversationRepostResult =
  | { status: 'reposted'; remoteReleaseId: string }
  | { status: 'already_reposted' }
  | { status: 'auth_error' }
  | { status: 'unsupported' }
  | { status: 'retryable_failure'; reason?: string };

export type ConversationsPage = {
  items: Conversation[];
  nextCursor?: string;
};

export type UseConversationsParams = {
  integrationId?: string;
  cursor?: string;
  limit?: number;
};

export const buildConversationsUrl = ({
  integrationId,
  cursor,
  limit = 20,
}: UseConversationsParams) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (integrationId) params.set('integrationId', integrationId);
  if (cursor) params.set('cursor', cursor);
  return `/conversations?${params.toString()}`;
};

export const useConversations = (params: UseConversationsParams = {}) => {
  const fetch = useFetch();
  const url = useMemo(
    () => buildConversationsUrl(params),
    [params.cursor, params.integrationId, params.limit]
  );
  const load = useCallback(
    async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error('Failed to load conversations');
      return (await response.json()) as ConversationsPage;
    },
    [fetch]
  );

  return useSWR<ConversationsPage>(url, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

export const useConversationMutations = () => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();

  const revalidateConversations = useCallback(
    () =>
      mutate(
        (key) => typeof key === 'string' && key.startsWith('/conversations?')
      ),
    [mutate]
  );

  const hydrate = useCallback(
    async (eventIds: string[]) => {
      if (!eventIds.length) return;
      const response = await fetch('/conversations/hydrate', {
        method: 'POST',
        body: JSON.stringify({ eventIds }),
      });
      if (!response.ok) throw new Error('Failed to hydrate conversations');
      await revalidateConversations();
    },
    [fetch, revalidateConversations]
  );

  const repost = useCallback(
    async (eventId: string) => {
      const response = await fetch(`/conversations/${eventId}/repost`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => undefined)) as
        | ConversationRepostResult
        | { message?: string | string[] }
        | undefined;
      if (!response.ok) {
        const errorPayload =
          payload && 'message' in payload ? payload : undefined;
        const message = Array.isArray(errorPayload?.message)
          ? errorPayload.message[0]
          : errorPayload?.message;
        throw new Error(
          typeof message === 'string' && message.length
            ? message
            : 'Failed to repost conversation'
        );
      }
      await revalidateConversations();
      return payload as ConversationRepostResult;
    },
    [fetch, revalidateConversations]
  );

  return { hydrate, repost };
};

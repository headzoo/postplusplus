'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCopilotReadable } from '@copilotkit/react-core';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useCopilotFollowerPageProperties } from '@gitroom/frontend/components/followers/use.copilot.follower.page';
import {
  formatFollowerPageContext,
  normalizeFollowerSearch,
} from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';
import {
  buildFollowerDetailHref,
  useFollowerChannels,
  useFollowerDetail,
  useFollowerMemberTimeline,
} from '@gitroom/frontend/components/followers/use.followers';
import { getFollowerTimelinePostRenderer } from '@gitroom/frontend/components/followers/follower.timeline.provider.renderers';

const TIMELINE_PAGE_SIZE = 20;

const decodeFollowerPathSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const FollowerTimelineComponent: FC = () => {
  const t = useT();
  const params = useParams();
  const searchParams = useSearchParams();
  const integrationId =
    typeof params?.view === 'string'
      ? decodeFollowerPathSegment(params.view)
      : '';
  const rawHandle =
    typeof params?.handle === 'string'
      ? decodeFollowerPathSegment(params.handle)
      : '';
  const username = rawHandle.startsWith('@')
    ? normalizeFollowerSearch(rawHandle)
    : undefined;
  const externalIdFromQuery = searchParams.get('externalId') ?? undefined;

  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const currentCursor = cursorHistory[cursorHistory.length - 1];
  const { data: followerChannels = [] } = useFollowerChannels();

  const { data: memberDetail } = useFollowerDetail(
    integrationId || undefined,
    externalIdFromQuery
      ? { externalId: externalIdFromQuery }
      : username
      ? { username }
      : undefined
  );

  const timelineIdentity = useMemo(() => {
    if (externalIdFromQuery) {
      return { externalId: externalIdFromQuery };
    }
    if (username) {
      return { username };
    }
    return undefined;
  }, [externalIdFromQuery, username]);

  const {
    data: timelinePage,
    error,
    isLoading,
    mutate,
  } = useFollowerMemberTimeline({
    integrationId: integrationId || undefined,
    ...timelineIdentity,
    cursor: currentCursor,
    limit: TIMELINE_PAGE_SIZE,
  });

  const timelineContext = useMemo(
    () =>
      formatFollowerPageContext({
        kind: 'timeline',
        route: `/followers/${integrationId}/${rawHandle}/timeline`,
        channel: { id: integrationId },
        follower: {
          id: memberDetail?.follower.id || externalIdFromQuery,
          username: memberDetail?.follower.username || username,
          name: memberDetail?.follower.name,
        },
        pagination: {
          size: TIMELINE_PAGE_SIZE,
          number: cursorHistory.length + 1,
        },
      }),
    [
      cursorHistory.length,
      externalIdFromQuery,
      integrationId,
      memberDetail?.follower,
      rawHandle,
      username,
    ]
  );

  useCopilotReadable({
    description: 'followerPage',
    value: timelineContext,
  });
  useCopilotFollowerPageProperties(timelineContext);

  const backHref = useMemo(() => {
    if (!integrationId || !username) {
      return '/followers';
    }
    return buildFollowerDetailHref(integrationId, username);
  }, [integrationId, username]);

  const handleNext = useCallback(() => {
    if (!timelinePage?.nextCursor) {
      return;
    }
    setCursorHistory((previous) => [...previous, timelinePage.nextCursor!]);
  }, [timelinePage?.nextCursor]);

  const handlePrevious = useCallback(() => {
    if (!cursorHistory.length) {
      return;
    }
    setCursorHistory((previous) => previous.slice(0, -1));
  }, [cursorHistory.length]);

  if (!integrationId || (!username && !externalIdFromQuery)) {
    return (
      <div className="flex flex-col items-center gap-[12px] py-[48px] text-center">
        <p className="text-[16px] text-newTextColor">
          {t('followers_timeline_invalid', 'This timeline link is invalid.')}
        </p>
        <Link
          href="/followers"
          className="text-[14px] text-newTextColor hover:underline"
        >
          {t('followers_back_to_followers', 'Back to followers')}
        </Link>
      </div>
    );
  }

  const follower = memberDetail?.follower;
  const PostRenderer = getFollowerTimelinePostRenderer(
    followerChannels.find((channel) => channel.id === integrationId)?.identifier
  );
  const displayName = follower?.name || username || externalIdFromQuery || '';
  const handle = follower?.username
    ? `@${follower.username}`
    : username
    ? `@${username}`
    : undefined;

  return (
    <div className="flex flex-col gap-[20px] max-w-[720px] mx-auto w-full py-[24px] px-[16px]">
      <div className="flex flex-col gap-[12px]">
        <Link
          href={backHref}
          className="text-[13px] text-textItemBlur hover:text-newTextColor hover:underline"
        >
          {t('followers_timeline_back', 'Back to profile')}
        </Link>

        <div className="flex items-start gap-[12px]">
          <ImageWithFallback
            fallbackSrc="/no-picture.jpg"
            src={follower?.picture || '/no-picture.jpg'}
            className="rounded-full shrink-0 object-cover"
            alt={displayName}
            width={48}
            height={48}
          />
          <div className="min-w-0">
            <h1 className="text-[20px] font-[600] text-newTextColor truncate">
              {displayName}
            </h1>
            {follower?.profileUrl ? (
              <a
                href={follower.profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[13px] text-textItemBlur hover:underline"
              >
                {handle}
              </a>
            ) : handle ? (
              <p className="text-[13px] text-textItemBlur">{handle}</p>
            ) : null}
            <p className="mt-[4px] text-[13px] text-textItemBlur">
              {t('followers_timeline_heading', 'Timeline')}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex flex-col items-center gap-[12px] rounded-[12px] border border-newTableBorder bg-newTableHeader p-[24px] text-center">
          <p className="text-[16px] text-newTextColor">
            {t(
              'followers_timeline_load_error',
              'We could not load this timeline right now.'
            )}
          </p>
          <Button onClick={() => mutate()}>
            {t('followers_retry', 'Retry')}
          </Button>
        </div>
      )}

      {!error && isLoading && (
        <div className="flex min-h-[200px] items-center justify-center">
          <LoadingComponent />
        </div>
      )}

      {!error && !isLoading && !timelinePage?.items.length && (
        <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader p-[24px] text-center text-[14px] text-textItemBlur">
          {t('followers_timeline_empty', 'No recent posts to show.')}
        </div>
      )}

      {!error && !isLoading && timelinePage?.items.length > 0 && (
        <>
          <div className="flex flex-col gap-[12px]">
            {timelinePage.items.map((post) => (
              <PostRenderer
                key={post.externalId}
                post={post}
                author={{
                  externalId:
                    follower?.id ||
                    externalIdFromQuery ||
                    username ||
                    post.externalId,
                  name: follower?.name,
                  username: follower?.username || username,
                  picture: follower?.picture,
                }}
              />
            ))}
          </div>
          {(cursorHistory.length > 0 || timelinePage.hasMore) && (
            <div className="flex items-center justify-between gap-[12px]">
              <Button disabled={!cursorHistory.length} onClick={handlePrevious}>
                {t('followers_previous_page', 'Previous')}
              </Button>
              <Button disabled={!timelinePage.hasMore} onClick={handleNext}>
                {t('followers_next_page', 'Next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

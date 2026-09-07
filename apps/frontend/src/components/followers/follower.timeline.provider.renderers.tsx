'use client';

import { ComponentType, FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { XPost } from '@gitroom/frontend/components/conversations/providers/x.post.component';
import { openExternalPost } from '@gitroom/frontend/components/external-post/open.external.post';
import { MemberPost } from '@gitroom/frontend/components/followers/use.followers';

export type FollowerTimelinePostProps = {
  post: MemberPost;
  author: {
    externalId: string;
    name?: string;
    username?: string;
    picture?: string;
  };
};

const XFollowerTimelinePost: FC<FollowerTimelinePostProps> = ({
  post,
  author,
}) => (
  <article className="rounded-[14px] border border-newTableBorder bg-newBgColorInner p-[16px]">
    <XPost post={{ ...post, author }} />
  </article>
);

const formatPostDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const DefaultFollowerTimelinePost: FC<FollowerTimelinePostProps> = ({
  post,
}) => {
  const t = useT();
  const timestamp = formatPostDate(post.publishedAt);

  return (
    <article
      className={clsx(
        'flex flex-col gap-[10px] rounded-[12px] border border-newTableBorder',
        'bg-newTableHeader p-[16px]'
      )}
    >
      {post.content && (
        <p className="text-[14px] text-newTextColor whitespace-pre-wrap break-words">
          {post.content}
        </p>
      )}
      {post.media?.length > 0 && (
        <div className="flex flex-wrap gap-[8px]">
          {post.media.map((item, index) => (
            <a
              key={`${post.externalId}-${index}`}
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block overflow-hidden rounded-[8px] border border-newTableBorder"
            >
              {item.type === 'video' ? (
                <video
                  src={item.url}
                  className="max-h-[240px] max-w-full object-cover"
                  controls
                  preload="metadata"
                />
              ) : (
                <img
                  src={item.url}
                  alt=""
                  className="max-h-[240px] max-w-full object-cover"
                />
              )}
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[4px] text-[12px] text-textItemBlur">
        {timestamp && <span>{timestamp}</span>}
        <button
          type="button"
          className="text-newTextColor hover:underline"
          onClick={() => openExternalPost(post.url)}
        >
          {t('followers_timeline_view_post', 'View post')}
        </button>
      </div>
    </article>
  );
};

const followerTimelinePostRenderers: Record<
  string,
  ComponentType<FollowerTimelinePostProps>
> = {
  x: XFollowerTimelinePost,
};

export const getFollowerTimelinePostRenderer = (providerIdentifier?: string) =>
  (providerIdentifier && followerTimelinePostRenderers[providerIdentifier]) ||
  DefaultFollowerTimelinePost;

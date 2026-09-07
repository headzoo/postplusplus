'use client';

import { FC, Fragment, MouseEvent } from 'react';
import clsx from 'clsx';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  isSafeHttpUrl,
  openExternalPost,
} from '@gitroom/frontend/components/external-post/open.external.post';

export type XPostData = {
  externalId: string;
  url: string;
  content: string;
  publishedAt: string;
  author: {
    externalId: string;
    name?: string;
    username?: string;
    picture?: string;
  };
  media?: Array<{ type?: 'image' | 'video'; url: string }>;
  quotedPost?: XPostData;
  repostedPost?: XPostData;
};

const openLinkedDestination = (
  event: MouseEvent<HTMLAnchorElement>,
  url: string
) => {
  event.preventDefault();
  event.stopPropagation();
  openExternalPost(url);
};

const linkifyContent = (content: string) =>
  content
    .split(/(https?:\/\/[^\s]+|@[a-zA-Z0-9_]+|#[\p{L}\p{N}_]+)/gu)
    .map((part, index) => {
      if (/^https?:\/\//u.test(part) && isSafeHttpUrl(part)) {
        return (
          <a
            key={`url-${index}`}
            href={part}
            className="text-blue-500 hover:underline"
            onClick={(event) => openLinkedDestination(event, part)}
          >
            {part}
          </a>
        );
      }
      if (/^@[a-zA-Z0-9_]+$/u.test(part)) {
        const handle = part.slice(1);
        const href = `https://x.com/${encodeURIComponent(handle)}`;
        return (
          <a
            key={`mention-${index}`}
            href={href}
            className="text-blue-500 hover:underline"
            onClick={(event) => openLinkedDestination(event, href)}
          >
            {part}
          </a>
        );
      }
      if (/^#[\p{L}\p{N}_]+$/u.test(part)) {
        const tag = part.slice(1);
        const href = `https://x.com/hashtag/${encodeURIComponent(tag)}`;
        return (
          <a
            key={`hashtag-${index}`}
            href={href}
            className="text-blue-500 hover:underline"
            onClick={(event) => openLinkedDestination(event, href)}
          >
            {part}
          </a>
        );
      }
      return <Fragment key={`text-${index}`}>{part}</Fragment>;
    });

const relativeTime = (value: string) => {
  const date = new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const XPost: FC<{ post: XPostData; nested?: boolean }> = ({
  post,
  nested = false,
}) => {
  const t = useT();
  const timestamp = relativeTime(post.publishedAt);
  const postLink = isSafeHttpUrl(post.url) ? post.url : undefined;

  return (
    <div
      className={clsx(
        nested &&
          'mt-[10px] rounded-[12px] border border-newTableBorder p-[12px]'
      )}
    >
      <div className="flex items-start gap-[10px]">
        <ImageWithFallback
          src={post.author.picture || '/no-picture.jpg'}
          fallbackSrc="/no-picture.jpg"
          alt=""
          width={nested ? 28 : 42}
          height={nested ? 28 : 42}
          className={clsx(
            'shrink-0 rounded-full object-cover',
            nested ? 'min-h-[28px] min-w-[28px]' : 'min-h-[42px] min-w-[42px]'
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-[5px] text-[14px] leading-[18px]">
            <span className="font-semibold text-newTextColor">
              {post.author.name || post.author.username || 'Unknown'}
            </span>
            {post.author.username && (
              <span className="text-newTableText">
                @{post.author.username.replace(/^@/, '')}
              </span>
            )}
            {postLink ? (
              <a
                href={postLink}
                className="text-newTableText hover:underline"
                title={new Date(post.publishedAt).toLocaleString()}
                aria-label={t('conversation_view_post', 'View post')}
                onClick={(event) => openLinkedDestination(event, postLink)}
              >
                · {timestamp}
              </a>
            ) : (
              <span
                className="text-newTableText"
                title={new Date(post.publishedAt).toLocaleString()}
              >
                · {timestamp}
              </span>
            )}
          </div>
          <p className="mt-[3px] whitespace-pre-wrap break-words text-[15px] leading-[20px] text-newTextColor">
            {linkifyContent(post.content)}
          </p>
          {!!post.media?.length && (
            <div
              className={clsx(
                'mt-[10px] grid overflow-hidden rounded-[12px] border border-newTableBorder gap-[2px]',
                post.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
              )}
            >
              {post.media
                .slice(0, 4)
                .map((media, index) =>
                  media.type === 'video' ? (
                    <video
                      key={`${media.url}-${index}`}
                      src={media.url}
                      controls
                      preload="metadata"
                      className="aspect-video h-full w-full object-cover"
                    />
                  ) : (
                    <img
                      key={`${media.url}-${index}`}
                      src={media.url}
                      alt=""
                      className="aspect-video h-full w-full object-cover"
                    />
                  )
                )}
            </div>
          )}
          {post.quotedPost && <XPost post={post.quotedPost} nested />}
          {post.repostedPost && <XPost post={post.repostedPost} nested />}
        </div>
      </div>
    </div>
  );
};

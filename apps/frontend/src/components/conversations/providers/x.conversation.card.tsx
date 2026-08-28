'use client';

import { FC, Fragment, MouseEvent, useCallback } from 'react';
import clsx from 'clsx';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useOpenComposer } from '@gitroom/frontend/components/new-launch/use.open.composer';
import {
  isSafeHttpUrl,
  openExternalPost,
} from '@gitroom/frontend/components/external-post/open.external.post';
import { ConversationCardProps } from '@gitroom/frontend/components/conversations/conversation.provider.renderers';
import { ConversationPost } from '@gitroom/frontend/components/conversations/use.conversations';

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

const XPostPreview: FC<{ post: ConversationPost; nested?: boolean }> = ({
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
      <div className="flex gap-[10px]">
        <ImageWithFallback
          src={post.author.picture || '/no-picture.jpg'}
          fallbackSrc="/no-picture.jpg"
          alt=""
          width={nested ? 28 : 42}
          height={nested ? 28 : 42}
          className="shrink-0 rounded-full object-cover"
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
          {post.quotedPost && <XPostPreview post={post.quotedPost} nested />}
          {post.repostedPost && (
            <XPostPreview post={post.repostedPost} nested />
          )}
        </div>
      </div>
    </div>
  );
};

export const XConversationCard: FC<ConversationCardProps> = ({
  conversation,
  integration,
  reposting,
  reposted,
  onRepost,
}) => {
  const t = useT();
  const { openComposer } = useOpenComposer();
  const post = conversation.post;
  const canQuote = conversation.actions.canQuote === true;
  const showRepostAction =
    conversation.actions.canRepost ||
    !!conversation.actions.repostReason ||
    reposted;
  const repostDisabled =
    reposting ||
    reposted ||
    !conversation.actions.canRepost ||
    !!conversation.actions.repostReason;
  const repostLabel = reposted
    ? t('conversation_reposted_action', 'Reposted')
    : reposting
    ? t('conversation_reposting', 'Reposting…')
    : t('conversation_repost', 'Repost');

  const quote = useCallback(async () => {
    if (!post || !integration || !canQuote) return;
    await openComposer({
      integrations: [integration],
      selectedChannels: [integration.id],
      focusedChannel: integration.id,
      initialPostReference: {
        type: 'quote',
        providerIdentifier: conversation.provider,
        externalId: post.externalId,
        url: post.url,
        preview: {
          authorName: post.author.name,
          authorUsername: post.author.username,
          authorPicture: post.author.picture,
          content: post.content,
          publishedAt: post.publishedAt,
          media: post.media,
        },
      },
    });
  }, [canQuote, conversation.provider, integration, openComposer, post]);

  if (!post) return null;

  return (
    <article className="rounded-[14px] border border-newTableBorder bg-newBgColorInner p-[16px]">
      {conversation.type === 'repost' && (
        <p className="mb-[8px] text-[13px] text-newTableText">
          {t('conversation_reposted', 'Reposted')}
        </p>
      )}
      {conversation.type === 'quote' && (
        <p className="mb-[8px] text-[13px] text-newTableText">
          {t('conversation_quoted', 'Quoted your post')}
        </p>
      )}
      <XPostPreview post={post} />
      <div className="mt-[14px] flex items-center gap-[8px] border-t border-newTableBorder pt-[10px] text-[13px]">
        {conversation.actions.likeUrl && (
          <button
            type="button"
            onClick={() => openExternalPost(conversation.actions.likeUrl!)}
            className="rounded-[6px] px-[8px] py-[4px] text-newTableText hover:bg-newTextColor/5 hover:text-newTextColor"
          >
            {t('conversation_like', 'Like')}
          </button>
        )}
        {conversation.actions.replyUrl && (
          <button
            type="button"
            onClick={() => openExternalPost(conversation.actions.replyUrl!)}
            className="rounded-[6px] px-[8px] py-[4px] text-newTableText hover:bg-newTextColor/5 hover:text-newTextColor"
          >
            {t('conversation_reply', 'Reply')}
          </button>
        )}
        {canQuote && (
          <button
            type="button"
            disabled={!integration}
            onClick={quote}
            className="rounded-[6px] px-[8px] py-[4px] text-newTableText hover:bg-newTextColor/5 hover:text-newTextColor disabled:opacity-50"
          >
            {t('conversation_quote', 'Quote')}
          </button>
        )}
        {showRepostAction && (
          <button
            type="button"
            disabled={repostDisabled}
            title={conversation.actions.repostReason}
            aria-disabled={repostDisabled}
            onClick={onRepost}
            className="rounded-[6px] px-[8px] py-[4px] text-newTableText hover:bg-newTextColor/5 hover:text-newTextColor disabled:opacity-50"
          >
            {repostLabel}
          </button>
        )}
      </div>
    </article>
  );
};

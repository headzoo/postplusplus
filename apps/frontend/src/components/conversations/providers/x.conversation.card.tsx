'use client';

import { FC, useCallback } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useOpenComposer } from '@gitroom/frontend/components/new-launch/use.open.composer';
import { openExternalPost } from '@gitroom/frontend/components/external-post/open.external.post';
import { ConversationCardProps } from '@gitroom/frontend/components/conversations/conversation.provider.renderers';
import { XPost } from '@gitroom/frontend/components/conversations/providers/x.post.component';

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
      <XPost post={post} />
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

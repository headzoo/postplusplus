'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { PostReferencePreview } from '@gitroom/frontend/components/new-launch/post-reference.types';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { CloseIcon } from '@gitroom/frontend/components/ui/icons';

export const PostReferencePreviewCard: FC<{
  preview: PostReferencePreview;
  onRemove: () => void;
}> = ({ preview, onRemove }) => {
  const t = useT();
  const handle = preview.authorUsername
    ? `@${preview.authorUsername.replace(/^@/, '')}`
    : undefined;

  return (
    <div
      role="region"
      aria-label={t('quoted_post_preview', 'Quoted post preview')}
      className="mx-[15px] mb-[12px] border border-newTableBorder bg-newBgColorInner rounded-[8px] overflow-hidden"
    >
      <div className="flex items-start gap-[10px] px-[12px] py-[10px]">
        {preview.authorPicture ? (
          <ImageWithFallback
            fallbackSrc="/no-picture.jpg"
            src={preview.authorPicture}
            alt=""
            width={36}
            height={36}
            className="rounded-full min-w-[36px] min-h-[36px] object-cover"
          />
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-[6px] gap-y-[2px] text-[14px]">
            {preview.authorName ? (
              <span className="font-semibold text-newTextColor truncate">
                {preview.authorName}
              </span>
            ) : null}
            {handle ? (
              <span className="text-newTableText truncate">{handle}</span>
            ) : null}
          </div>
          {preview.content ? (
            <p className="mt-[4px] text-[14px] text-newTextColor whitespace-pre-wrap break-words line-clamp-4">
              {preview.content}
            </p>
          ) : null}
          {preview.media?.length ? (
            <div
              className={clsx(
                'mt-[8px] grid gap-[4px]',
                preview.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
              )}
            >
              {preview.media.slice(0, 4).map((item, index) => (
                <div
                  key={`${item.url}-${index}`}
                  className="rounded-[6px] overflow-hidden bg-newTextColor/5 aspect-video max-h-[120px]"
                >
                  <img
                    src={item.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('remove_quoted_post', 'Remove quoted post')}
          className="shrink-0 p-[4px] rounded-[6px] text-newTableText hover:text-newTextColor hover:bg-newTextColor/5 transition-colors"
        >
          <CloseIcon className="w-[16px] h-[16px]" />
        </button>
      </div>
    </div>
  );
};

export const ComposerPostReferencePreview: FC = () => {
  const postReference = useLaunchStore((state) => state.postReference);
  const clearPostReference = useLaunchStore(
    (state) => state.clearPostReference
  );

  if (!postReference?.preview) {
    return null;
  }

  return (
    <PostReferencePreviewCard
      preview={postReference.preview}
      onRemove={clearPostReference}
    />
  );
};

'use client';

import { FC, useMemo } from 'react';
import { Post } from '@prisma/client';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { usePostLikers } from '@gitroom/frontend/components/new-launch/use.post.likers';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import SafeImage from '@gitroom/react/helpers/safe.image';

const resolvePublishedPost = (
  posts: Post[] | undefined,
  channels: { integration: string; posts: Post[] }[] | undefined,
  integrationId: string | undefined
): Post | undefined => {
  if (integrationId && channels?.length) {
    const channel = channels.find((item) => item.integration === integrationId);
    if (channel?.posts?.[0]) {
      return channel.posts[0];
    }
  }

  return posts?.[0];
};

export const ComposerPostLikers: FC = () => {
  const t = useT();
  const existingData = useExistingData();
  const { integration } = useIntegration();
  const current = useLaunchStore((state) => state.current);

  const publishedPost = useMemo(() => {
    if (current === 'global') {
      return undefined;
    }

    return resolvePublishedPost(
      existingData.posts,
      existingData.channels,
      integration?.id
    );
  }, [current, existingData.channels, existingData.posts, integration?.id]);

  const canLoad =
    publishedPost?.state === 'PUBLISHED' &&
    !!publishedPost.releaseId &&
    publishedPost.releaseId !== 'missing';

  const { data, error, isLoading } = usePostLikers(
    canLoad ? publishedPost.id : null
  );

  if (!canLoad) {
    return null;
  }

  if (data && !data.supported) {
    return null;
  }

  return (
    <div className="mx-[15px] mb-[15px] border-t border-newTableBorder pt-[12px]">
      <div className="text-[12px] font-[600] text-newTableText uppercase tracking-wide mb-[8px]">
        {t('post_likers', 'Liked by')}
      </div>

      {isLoading && (
        <div className="text-[13px] text-textItemBlur">
          {t('post_likers_loading', 'Loading likers…')}
        </div>
      )}

      {!isLoading && (error || (data?.supported === true && data.error)) && (
        <div className="text-[13px] text-red-400 break-words">
          {data?.supported === true && data.error
            ? data.error
            : t('post_likers_error', 'Failed to load likers')}
        </div>
      )}

      {!isLoading &&
        !error &&
        data?.supported === true &&
        !data.error &&
        data.users.length === 0 && (
          <div className="text-[13px] text-textItemBlur">
            {t('post_likers_empty', 'No likers returned')}
          </div>
        )}

      {!isLoading &&
        !error &&
        data?.supported === true &&
        !data.error &&
        data.users.length > 0 && (
          <div className="flex flex-col gap-[8px] max-h-[220px] overflow-y-auto">
            {data.users.map((user) => {
              const content = (
                <>
                  <SafeImage
                    alt={user.name}
                    width={28}
                    height={28}
                    className="min-w-[28px] min-h-[28px] w-[28px] h-[28px] rounded-full"
                    src={user.picture || '/no-picture.jpg'}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-[600] truncate">
                      {user.name}
                    </div>
                    {user.username && (
                      <div className="text-[12px] text-textItemBlur truncate">
                        @{user.username}
                      </div>
                    )}
                  </div>
                </>
              );

              if (user.profileUrl) {
                return (
                  <a
                    key={user.id}
                    href={user.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-[8px] no-underline text-inherit hover:opacity-80"
                  >
                    {content}
                  </a>
                );
              }

              return (
                <div key={user.id} className="flex items-center gap-[8px]">
                  {content}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
};

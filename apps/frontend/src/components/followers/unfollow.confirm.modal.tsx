'use client';

import { FC, useCallback } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';

export type UnfollowConfirmAction = 'unfollow' | null;

export const UnfollowConfirmModal: FC<{
  resolution: (action: UnfollowConfirmAction) => void;
}> = ({ resolution }) => {
  const t = useT();
  const { closeCurrent } = useModals();

  const cancel = useCallback(() => {
    resolution(null);
    closeCurrent();
  }, [closeCurrent, resolution]);

  const confirm = useCallback(() => {
    resolution('unfollow');
    closeCurrent();
  }, [closeCurrent, resolution]);

  return (
    <div className="flex max-w-[420px] flex-col gap-[12px]">
      <p className="text-[14px] text-textItemBlur">
        {t(
          'followers_unfollow_description',
          'This profile will be unfollowed and removed from your Followed list.'
        )}
      </p>
      <div className="mt-[4px] flex flex-wrap gap-[12px]">
        <Button onClick={confirm}>
          {t('followers_unfollow_confirm', 'Unfollow')}
        </Button>
        <Button onClick={cancel}>{t('cancel', 'Cancel')}</Button>
      </div>
    </div>
  );
};

export const useUnfollowConfirmModal = () => {
  const modals = useModals();
  const t = useT();

  return {
    open: () =>
      new Promise<UnfollowConfirmAction>((resolve) => {
        modals.openModal({
          title: t('followers_unfollow_title', 'Unfollow this profile?'),
          children: () => (
            <UnfollowConfirmModal resolution={(action) => resolve(action)} />
          ),
        });
      }),
  };
};

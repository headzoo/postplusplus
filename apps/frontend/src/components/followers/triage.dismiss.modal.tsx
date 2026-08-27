'use client';

import { FC, useCallback } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { RELATIONSHIP_TRIAGE_SNOOZE_DAYS } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.scoring';

export type TriageDismissAction = 'remove' | 'snooze' | null;

export const TriageDismissModal: FC<{
  label: string;
  resolution: (action: TriageDismissAction) => void;
}> = ({ label, resolution }) => {
  const t = useT();
  const { closeCurrent } = useModals();

  const cancel = useCallback(() => {
    resolution(null);
    closeCurrent();
  }, [closeCurrent, resolution]);

  const remove = useCallback(() => {
    resolution('remove');
    closeCurrent();
  }, [closeCurrent, resolution]);

  const snooze = useCallback(() => {
    resolution('snooze');
    closeCurrent();
  }, [closeCurrent, resolution]);

  return (
    <div className="flex max-w-[420px] flex-col gap-[12px]">
      <p className="text-[14px] text-textItemBlur">
        {t(
          'followers_triage_remove_description',
          'This follower will be removed from the {{label}} list.',
          { label }
        )}
      </p>
      <div className="mt-[4px] flex flex-wrap gap-[12px]">
        <Button onClick={remove}>{t('yes', 'Yes')}</Button>
        <Button onClick={snooze}>
          {t('followers_triage_snooze', 'Snooze {{days}} days', {
            days: RELATIONSHIP_TRIAGE_SNOOZE_DAYS,
          })}
        </Button>
        <Button onClick={cancel}>{t('cancel', 'Cancel')}</Button>
      </div>
    </div>
  );
};

export const useTriageDismissModal = () => {
  const modals = useModals();
  const t = useT();

  const open = useCallback(
    (label: string) => {
      return new Promise<TriageDismissAction>((resolve) => {
        modals.openModal({
          title: t('followers_triage_remove_title', 'Remove {{label}} badge?', {
            label,
          }),
          askClose: false,
          onClose: () => resolve(null),
          children: (
            <TriageDismissModal
              label={label}
              resolution={(action) => resolve(action)}
            />
          ),
        });
      });
    },
    [modals, t]
  );

  return { open };
};

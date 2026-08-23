'use client';

import { FC, useCallback, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { RELATIONSHIP_TRIAGE_SNOOZE_DAYS } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.scoring';
import {
  LEAD_FIT_DISMISS_REASONS,
  LEAD_FIT_DISMISS_REASON_LABELS,
  LeadFitDismissReason,
} from '@gitroom/nestjs-libraries/dtos/integrations/lead-fit-feedback.types';

export type LeadDismissResult =
  | { action: 'remove'; reasons: LeadFitDismissReason[] }
  | { action: 'snooze' }
  | null;

export const LeadDismissModal: FC<{
  resolution: (result: LeadDismissResult) => void;
}> = ({ resolution }) => {
  const t = useT();
  const { closeCurrent } = useModals();
  const [selected, setSelected] = useState<LeadFitDismissReason[]>([]);

  const toggleReason = useCallback((reason: LeadFitDismissReason) => {
    setSelected((current) =>
      current.includes(reason)
        ? current.filter((item) => item !== reason)
        : [...current, reason]
    );
  }, []);

  const cancel = useCallback(() => {
    resolution(null);
    closeCurrent();
  }, [closeCurrent, resolution]);

  const confirm = useCallback(() => {
    if (!selected.length) {
      return;
    }
    resolution({ action: 'remove', reasons: selected });
    closeCurrent();
  }, [closeCurrent, resolution, selected]);

  const snooze = useCallback(() => {
    resolution({ action: 'snooze' });
    closeCurrent();
  }, [closeCurrent, resolution]);

  return (
    <div className="flex max-w-[420px] flex-col gap-[12px]">
      <p className="text-[14px] text-textItemBlur">
        {t(
          'followers_lead_dismiss_description',
          'This person will be removed from Leads. Choose why they are not a lead so future suggestions can improve.'
        )}
      </p>
      <div className="flex flex-col gap-[8px]">
        {LEAD_FIT_DISMISS_REASONS.map((reason) => {
          const label = LEAD_FIT_DISMISS_REASON_LABELS[reason];
          return (
            <Checkbox
              key={reason}
              disableForm={true}
              name={`lead-dismiss-${reason}`}
              checked={selected.includes(reason)}
              label={t(label.key, label.defaultLabel)}
              onChange={() => toggleReason(reason)}
            />
          );
        })}
      </div>
      <div className="mt-[4px] flex flex-wrap gap-[12px]">
        <Button onClick={confirm} disabled={!selected.length}>
          {t('followers_lead_dismiss_confirm', 'Remove Lead')}
        </Button>
        <Button onClick={snooze}>
          {t('followers_triage_snooze', 'Snooze {{days}} days', {
            days: RELATIONSHIP_TRIAGE_SNOOZE_DAYS,
          })}
        </Button>
        <Button onClick={cancel}>
          {t('cancel', 'Cancel')}
        </Button>
      </div>
    </div>
  );
};

export const useLeadDismissModal = () => {
  const modals = useModals();
  const t = useT();

  const open = useCallback(() => {
    return new Promise<LeadDismissResult>((resolve) => {
      modals.openModal({
        title: t('followers_lead_dismiss_title', 'Remove Lead badge?'),
        askClose: false,
        onClose: () => resolve(null),
        children: (
          <LeadDismissModal
            resolution={(result) => resolve(result)}
          />
        ),
      });
    });
  }, [modals, t]);

  return { open };
};

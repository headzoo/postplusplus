'use client';

import { FC, useCallback, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { Select } from '@gitroom/react/form/select';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { RELATIONSHIP_TRIAGE_SNOOZE_DAYS } from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.scoring';
import {
  LEAD_FIT_DISMISS_REASONS,
  LEAD_FIT_DISMISS_REASON_LABELS,
  LeadFitDismissReason,
} from '@gitroom/nestjs-libraries/dtos/integrations/lead-fit-feedback.types';
import { FollowerList } from '@gitroom/frontend/components/followers/use.followers';

export type LeadDismissResult =
  | { action: 'remove'; reasons: LeadFitDismissReason[] }
  | { action: 'snooze' }
  | { action: 'follow' }
  | { action: 'moveToList'; listId: string }
  | null;

export type LeadDismissModalOptions = {
  canFollow?: boolean;
  lists?: FollowerList[];
};

export const LeadDismissModal: FC<{
  canFollow?: boolean;
  lists?: FollowerList[];
  resolution: (result: LeadDismissResult) => void;
}> = ({ canFollow = false, lists = [], resolution }) => {
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

  const follow = useCallback(() => {
    resolution({ action: 'follow' });
    closeCurrent();
  }, [closeCurrent, resolution]);

  const moveToList = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const listId = event.target.value;
      if (!listId) {
        return;
      }
      resolution({ action: 'moveToList', listId });
      closeCurrent();
    },
    [closeCurrent, resolution]
  );

  return (
    <div className="flex max-w-[420px] flex-col gap-[12px]">
      <Select
        disableForm={true}
        name="lead-move-list"
        label={t('followers_lead_move_to_list', 'Move to custom list')}
        translationKey="followers_lead_move_to_list"
        value=""
        onChange={moveToList}
      >
        <option value="">
          {lists.length
            ? t('followers_lead_select_list', 'Select a list…')
            : t('followers_lists_empty_menu', 'Create a custom list first.')}
        </option>
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
      </Select>
      {canFollow && (
        <div className="flex flex-col gap-[8px]">
          <h4 className="text-[16px] font-[600] text-newTextColor">
            {t('followers_lead_add_to_followed', 'Add to followed')}
          </h4>
          <Button onClick={follow}>
            {t('followers_lead_follow', 'Follow')}
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-[8px]">
        <h4 className="text-[16px] font-[600] text-newTextColor">
          {t('followers_lead_remove_from_leads', 'Remove from Leads')}
        </h4>
        <p className="text-[13px] text-textItemBlur">
          {t(
            'followers_lead_dismiss_reasons_prompt',
            'Choose why they are not a lead'
          )}
        </p>
      </div>
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
      </div>
      <div className="mt-[28px]">
        <Button onClick={cancel}>{t('cancel', 'Cancel')}</Button>
      </div>
    </div>
  );
};

export const useLeadDismissModal = () => {
  const modals = useModals();
  const t = useT();

  const open = useCallback(
    (options: LeadDismissModalOptions = {}) => {
      return new Promise<LeadDismissResult>((resolve) => {
        modals.openModal({
          title: t('followers_lead_manage_title', 'Manage lead'),
          askClose: false,
          onClose: () => resolve(null),
          children: (
            <LeadDismissModal
              canFollow={options.canFollow}
              lists={options.lists}
              resolution={(result) => resolve(result)}
            />
          ),
        });
      });
    },
    [modals, t]
  );

  return { open };
};

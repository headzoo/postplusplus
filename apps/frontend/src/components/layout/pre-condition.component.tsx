import React, { FC, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { ModalWrapperComponent } from '@gitroom/frontend/components/new-launch/modal.wrapper.component';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Button } from '@gitroom/react/form/button';

export const PreConditionComponentModal: FC = () => {
  const modal = useModals();
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="whitespace-pre-line">
        This social channel was connected previously to another Post Plus Plus
        account.
        {'\n'}
        To continue, please fast-track your trial for an immediate charge.{'\n'}
        {'\n'}
        ** Please be advised that the account will not eligible for a refund,
        and the charge is final.
      </div>
      <div className="flex gap-[2px] justify-center">
        <Button
          onClick={() => (window.location.href = '/billing?finishTrial=true')}
        >
          Fast track - Charge me now
        </Button>
        <Button onClick={modal.closeCurrent} secondary={true}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
export const PreConditionComponent: FC = () => {
  const modal = useModals();
  const query = useSearchParams();
  const precondition = query.get('precondition');
  const openedRef = useRef(false);
  useEffect(() => {
    if (!precondition || openedRef.current) {
      return;
    }
    openedRef.current = true;
    modal.openModal({
      title: 'Suspicious activity detected',
      withCloseButton: true,
      classNames: {
        modal: 'text-textColor',
      },
      children: <PreConditionComponentModal />,
    });
  }, [modal, precondition]);
  return null;
};

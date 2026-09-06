'use client';

import { FC, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { Select } from '@gitroom/react/form/select';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PipelineSummary } from '@gitroom/frontend/components/pipelines/pipeline.types';

export const PipelineCopyToModal: FC<{
  destinations: PipelineSummary[];
  onCopy: (destinationPipelineId: string) => void | Promise<void>;
}> = ({ destinations, onCopy }) => {
  const t = useT();
  const modal = useModals();
  const [destinationPipelineId, setDestinationPipelineId] = useState(
    destinations[0]?.id || ''
  );
  const [pending, setPending] = useState(false);

  if (!destinations.length) {
    return (
      <div className="flex flex-col gap-[16px]">
        <div className="text-[13px] opacity-70">
          {t(
            'pipeline_copy_to_no_destinations',
            'No other Pipelines share the same channel set. Create another Pipeline with the same channels to copy here.'
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" secondary onClick={() => modal.closeCurrent()}>
            {t('close', 'Close')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="text-[13px] opacity-70">
        {t(
          'pipeline_copy_to_hint',
          'Clone this post into another Pipeline. The copy is queued at the end for the next available recurring slot. The original stays in place.'
        )}
      </div>
      <Select
        label={t('pipeline', 'Pipeline')}
        name="destinationPipelineId"
        disableForm={true}
        hideErrors={true}
        value={destinationPipelineId}
        onChange={(event) => setDestinationPipelineId(event.target.value)}
      >
        {destinations.map((pipeline) => (
          <option key={pipeline.id} value={pipeline.id}>
            {pipeline.name}
          </option>
        ))}
      </Select>
      <div className="flex justify-end gap-[10px]">
        <Button
          type="button"
          secondary
          disabled={pending}
          onClick={() => modal.closeCurrent()}
        >
          {t('cancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          disabled={!destinationPipelineId || pending}
          loading={pending}
          onClick={async () => {
            if (!destinationPipelineId) return;
            setPending(true);
            try {
              await onCopy(destinationPipelineId);
              modal.closeCurrent();
            } finally {
              setPending(false);
            }
          }}
        >
          {t('copy', 'Copy')}
        </Button>
      </div>
    </div>
  );
};

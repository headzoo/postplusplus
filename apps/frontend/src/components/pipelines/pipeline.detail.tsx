'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { Slider } from '@gitroom/react/form/slider';
import {
  useModals,
  useDecisionModal,
} from '@gitroom/frontend/components/layout/new-modal';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PipelineChannels } from '@gitroom/frontend/components/pipelines/pipeline.channels';
import { PipelineForm } from '@gitroom/frontend/components/pipelines/pipeline.form';
import { PipelineQueue } from '@gitroom/frontend/components/pipelines/pipeline.queue';
import { PipelineScheduleEditor } from '@gitroom/frontend/components/pipelines/pipeline.schedule.editor';
import { PipelineScheduleSlot } from '@gitroom/frontend/components/pipelines/pipeline.types';
import { formatPipelineSlot } from '@gitroom/frontend/components/pipelines/pipeline.utils';
import { usePipelineDetail } from '@gitroom/frontend/components/pipelines/use.pipeline.detail';
import { usePipelineStatus } from '@gitroom/frontend/components/pipelines/use.pipeline.status';
import { useDeletePipeline } from '@gitroom/frontend/components/pipelines/use.pipeline.delete';
import { usePipelineList } from '@gitroom/frontend/components/pipelines/use.pipeline.list';
import { useUpdatePipelineSchedule } from '@gitroom/frontend/components/pipelines/use.pipeline.schedule.update';
import { PipelineContextDocumentsPanel } from '@gitroom/frontend/components/context-documents/context-document.assignment-picker';
import { PipelineAutopostPanel } from '@gitroom/frontend/components/pipelines/pipeline.autopost';

const EMPTY_SCHEDULE_SLOTS: PipelineScheduleSlot[] = [];

const getScheduleSignature = (slots: PipelineScheduleSlot[]) =>
  [...slots]
    .sort(
      (left, right) =>
        left.dayOfWeek - right.dayOfWeek || left.minuteOfDay - right.minuteOfDay
    )
    .map((slot) => `${slot.dayOfWeek}:${slot.minuteOfDay}`)
    .join('|');

export const PipelineDetailView: FC<{ pipelineId: string }> = ({
  pipelineId,
}) => {
  const t = useT();
  const router = useRouter();
  const modal = useModals();
  const decision = useDecisionModal();
  const toaster = useToaster();
  const { data, error, isLoading, mutate } = usePipelineDetail(pipelineId);
  const { data: pipelines, mutate: mutateList } = usePipelineList();
  const setPipelineStatus = usePipelineStatus();
  const deletePipeline = useDeletePipeline();
  const updatePipelineSchedule = useUpdatePipelineSchedule();
  const [draftScheduleSlots, setDraftScheduleSlots] = useState<
    PipelineScheduleSlot[]
  >([]);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const scheduleWasModified = useRef(false);
  const hasInitializedSchedule = useRef(false);
  const serverScheduleSlots = data?.scheduleSlots ?? EMPTY_SCHEDULE_SLOTS;
  const serverScheduleSignature = useMemo(
    () => getScheduleSignature(serverScheduleSlots),
    [serverScheduleSlots]
  );
  const serverScheduleSlotsRef =
    useRef<PipelineScheduleSlot[]>(EMPTY_SCHEDULE_SLOTS);

  useEffect(() => {
    serverScheduleSlotsRef.current = serverScheduleSlots;
    if (!hasInitializedSchedule.current || !scheduleWasModified.current) {
      setDraftScheduleSlots(serverScheduleSlots);
    }
    hasInitializedSchedule.current = true;
  }, [serverScheduleSignature, serverScheduleSlots]);

  const updateDraftSchedule = useCallback((slots: PipelineScheduleSlot[]) => {
    scheduleWasModified.current =
      getScheduleSignature(slots) !==
      getScheduleSignature(serverScheduleSlotsRef.current);
    setDraftScheduleSlots(slots);
    setScheduleError('');
  }, []);

  const resetDraftSchedule = useCallback(() => {
    scheduleWasModified.current = false;
    setDraftScheduleSlots(serverScheduleSlotsRef.current);
    setScheduleError('');
  }, []);

  const scheduleIsDirty =
    getScheduleSignature(draftScheduleSlots) !== serverScheduleSignature;
  const queueCount =
    data?.queueCount ??
    (data?.queueItems || []).filter((item) => item.status === 'QUEUED').length;

  const openEdit = useCallback(() => {
    if (!data) {
      return;
    }
    modal.openModal({
      title: t('edit_pipeline', 'Edit Pipeline'),
      withCloseButton: true,
      classNames: {
        modal: 'w-[100%] max-w-[760px] text-textColor',
      },
      children: (
        <PipelineForm
          pipeline={data}
          onSaved={() => {
            mutate();
            mutateList();
          }}
        />
      ),
    });
  }, [data, modal, mutate, mutateList, t]);

  const toggleActive = useCallback(
    async (value: 'on' | 'off') => {
      try {
        await setPipelineStatus(pipelineId, value === 'on');
        await Promise.all([mutate(), mutateList()]);
      } catch (err: any) {
        toaster.show(
          err?.message || 'Failed to update Pipeline status.',
          'warning'
        );
      }
    },
    [mutate, mutateList, pipelineId, setPipelineStatus, toaster]
  );

  const confirmDelete = useCallback(async () => {
    if (!data) {
      return;
    }
    const approved = await decision.open({
      title: t('delete_pipeline', 'Delete Pipeline?'),
      description: `Deleting "${
        data.name
      }" will remove the Pipeline schedule. ${queueCount} queued item${
        queueCount === 1 ? '' : 's'
      } will be preserved as drafts in your calendar — no content will be deleted.`,
      approveLabel: t('delete_pipeline_confirm', 'Delete Pipeline'),
      cancelLabel: t('cancel', 'Cancel'),
    });
    if (!approved) {
      return;
    }
    try {
      await deletePipeline(pipelineId);
      toaster.show(
        t(
          'pipeline_deleted_successfully',
          'Pipeline deleted. Queued posts were kept as drafts.'
        ),
        'success'
      );
      router.push('/pipelines');
    } catch (err: any) {
      toaster.show(err?.message || 'Failed to delete Pipeline.', 'warning');
    }
  }, [
    data,
    decision,
    deletePipeline,
    pipelineId,
    queueCount,
    router,
    t,
    toaster,
  ]);

  const saveSchedule = useCallback(async () => {
    setIsSavingSchedule(true);
    setScheduleError('');
    try {
      const updated = await updatePipelineSchedule(pipelineId, {
        scheduleSlots: draftScheduleSlots,
      });
      scheduleWasModified.current = false;
      setDraftScheduleSlots(updated.scheduleSlots);
      toaster.show(
        t('pipeline_schedule_updated', 'Weekly schedule updated successfully'),
        'success'
      );
    } catch (err: any) {
      const message = err?.message || 'Failed to update the weekly schedule.';
      setScheduleError(message);
      toaster.show(message, 'warning');
    } finally {
      setIsSavingSchedule(false);
    }
  }, [draftScheduleSlots, pipelineId, t, toaster, updatePipelineSchedule]);

  if (isLoading) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] text-textColor">
        <div className="rounded-[12px] border border-red-500/30 px-[16px] py-[12px] text-red-500">
          {t('pipeline_not_found', 'Pipeline not found.')}
        </div>
        <Button onClick={() => router.push('/pipelines')}>
          {t('back_to_pipelines', 'Back to Pipelines')}
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[20px] transition-all text-textColor min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
      <div className="flex flex-col gap-[12px] lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-[8px]">
          <Button secondary onClick={() => router.push('/pipelines')}>
            {t('back_to_pipelines', 'Back to Pipelines')}
          </Button>
          <h1 className="text-[24px] font-[600]">{data.name}</h1>
          <div className="text-[14px] opacity-70">
            {t('timezone', 'Timezone')}: {data.timezone}
          </div>
          <span
            className={clsx(
              'inline-flex w-fit text-[12px] px-[8px] py-[2px] rounded-full border',
              data.active
                ? 'border-green-500/40 text-green-500'
                : 'border-newBorder opacity-70'
            )}
          >
            {data.active ? t('active', 'Active') : t('paused', 'Paused')}
          </span>
        </div>
        <div className="flex items-center gap-[10px] flex-wrap">
          <Button onClick={openEdit}>{t('edit', 'Edit')}</Button>
          <Button secondary onClick={confirmDelete}>
            {t('delete', 'Delete')}
          </Button>
          <div className="flex items-center gap-[8px] px-[8px]">
            <span className="text-[12px] opacity-70">
              {data.active ? t('pause', 'Pause') : t('resume', 'Resume')}
            </span>
            <Slider
              value={data.active ? 'on' : 'off'}
              onChange={toggleActive}
              fill={true}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px]">
        <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[8px]">
          <div className="text-[12px] uppercase opacity-60">
            {t('channels', 'Channels')}
          </div>
          <PipelineChannels channels={data.channels} />
        </div>
        <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[8px]">
          <div className="text-[12px] uppercase opacity-60">
            {t('queued', 'Queued')}
          </div>
          <div className="text-[24px] font-[600]">{queueCount}</div>
        </div>
        <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[8px]">
          <div className="text-[12px] uppercase opacity-60">
            {t('next_slot', 'Next slot')}
          </div>
          <div className="text-[14px]">
            {data.active
              ? formatPipelineSlot(data.nextSlot, data.timezone)
              : t('pipeline_paused', 'Paused')}
          </div>
        </div>
      </div>

      <div className="shrink-0 rounded-[12px] border border-newBorder bg-newBgColor overflow-hidden">
        <div className="flex flex-col gap-[10px] border-b border-newBorder px-[20px] py-[14px] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[16px] font-[600]">
              {t('weekly_schedule', 'Weekly schedule')}
            </div>
            {scheduleIsDirty && (
              <div className="text-[12px] text-newTableText">
                {t('unsaved_changes', 'Unsaved changes')}
              </div>
            )}
          </div>
          <div className="flex items-center gap-[8px]">
            {scheduleIsDirty && (
              <Button
                secondary
                type="button"
                onClick={resetDraftSchedule}
                disabled={isSavingSchedule}
              >
                {t('reset', 'Reset')}
              </Button>
            )}
            <Button
              type="button"
              onClick={saveSchedule}
              disabled={!scheduleIsDirty || isSavingSchedule}
            >
              {isSavingSchedule ? t('saving', 'Saving...') : t('save', 'Save')}
            </Button>
          </div>
        </div>
        <div className="p-[16px]">
          {scheduleError && (
            <div className="mb-[12px] rounded-[8px] border border-red-500/30 px-[12px] py-[8px] text-[13px] text-red-500">
              {scheduleError}
            </div>
          )}
          <PipelineScheduleEditor
            value={draftScheduleSlots}
            pipelineColor={data.color}
            onChange={updateDraftSchedule}
          />
        </div>
      </div>

      <PipelineQueue
        pipeline={data}
        pipelines={pipelines || []}
        mutate={mutate}
      />

      <PipelineContextDocumentsPanel
        documents={data.contextDocuments}
        onEdit={openEdit}
      />

      <PipelineAutopostPanel pipelineId={pipelineId} channels={data.channels} />
    </div>
  );
};

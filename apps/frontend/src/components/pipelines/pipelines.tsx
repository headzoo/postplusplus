'use client';

import { FC, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { Button } from '@gitroom/react/form/button';
import { Slider } from '@gitroom/react/form/slider';
import { useModals, useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { MoreIcon } from '@gitroom/frontend/components/ui/icons';
import { PipelineChannels } from '@gitroom/frontend/components/pipelines/pipeline.channels';
import { PipelineForm } from '@gitroom/frontend/components/pipelines/pipeline.form';
import {
  filterPipelinesByChannel,
  formatPipelineSlotShort,
  formatPipelineTimezoneLabel,
} from '@gitroom/frontend/components/pipelines/pipeline.utils';
import { usePipelineList } from '@gitroom/frontend/components/pipelines/use.pipeline.list';
import { usePipelineDetail } from '@gitroom/frontend/components/pipelines/use.pipeline.detail';
import { usePipelineStatus } from '@gitroom/frontend/components/pipelines/use.pipeline.status';
import { useDeletePipeline } from '@gitroom/frontend/components/pipelines/use.pipeline.delete';
import { PipelineSummary } from '@gitroom/frontend/components/pipelines/pipeline.types';
import { PipelineContextDocumentsPanel } from '@gitroom/frontend/components/context-documents/context-document.assignment-picker';
import {
  ChannelMenu,
  ChannelsSidebar,
} from '@gitroom/frontend/components/launches/channels.sidebar';
import { setLastChannelId, resolveChannelId } from '@gitroom/frontend/components/launches/helpers/last-channel';
import {
  IntegrationListItem,
  useIntegrationList,
} from '@gitroom/frontend/components/launches/helpers/use.integration.list';

const pipelineMetaChipClass =
  'inline-flex items-center gap-[6px] text-[12px] px-[8px] py-[3px] rounded-full border border-newBorder bg-newBgColorInner text-textItemBlur';

const PipelineActionsMenu: FC<{
  disabled?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ disabled, onEdit, onDelete }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-label={t('pipeline_actions', 'Pipeline actions')}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center justify-center w-[32px] h-[32px] rounded-[6px] text-menuDots hover:text-menuDotsHover hover:bg-newBgColor disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <MoreIcon size={20} />
      </button>
      {open && (
        <div className="z-[300] absolute end-0 top-full mt-[6px] min-w-[140px] bg-newBgColorInner p-[8px] menu-shadow flex flex-col rounded-[8px] border border-newBorder">
          <button
            type="button"
            onClick={run(onEdit)}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor"
          >
            {t('edit', 'Edit')}
          </button>
          <button
            type="button"
            onClick={run(onDelete)}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor text-red-500"
          >
            {t('delete', 'Delete')}
          </button>
        </div>
      )}
    </div>
  );
};

const PipelineListCard: FC<{
  pipeline: PipelineSummary;
  pending: boolean;
  onSchedule: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (value: 'on' | 'off') => void;
}> = ({ pipeline, pending, onSchedule, onEdit, onDelete, onToggleActive }) => {
  const t = useT();
  const nextSlotLabel = pipeline.active
    ? formatPipelineSlotShort(pipeline.nextSlot, pipeline.timezone)
    : '—';

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSchedule();
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSchedule}
      onKeyDown={handleCardKeyDown}
      className={clsx(
        'relative flex flex-col rounded-[12px] border border-newTableBorder bg-newTableHeader',
        'transition-all duration-200 hover:border-newTextColor/20',
        'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-newTextColor/30',
        pending && 'opacity-70 pointer-events-none'
      )}
    >
      <div className="flex flex-col gap-[12px] p-[16px]">
        <div className="flex flex-col gap-[12px] lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-[10px] min-w-0 flex-1">
            <div className="flex items-center gap-[8px] flex-wrap min-w-0">
              <span className="text-[18px] font-[600] truncate min-w-0">
                {pipeline.name}
              </span>
              <div
                className="w-[12px] h-[12px] rounded-full shrink-0 border border-newBorder"
                style={{ backgroundColor: pipeline.color }}
                aria-hidden="true"
              />
            </div>

            <div className="flex flex-wrap items-center gap-[6px]">
              {pipeline.channels.length > 0 && (
                <span className={clsx(pipelineMetaChipClass, 'py-[2px]')}>
                  <PipelineChannels channels={pipeline.channels} stacked />
                </span>
              )}
              <span className={pipelineMetaChipClass}>
                <span className="font-[600] text-textColor">{pipeline.queueCount}</span>
                {` ${t('queued', 'queued')}`}
              </span>
              <span
                className={pipelineMetaChipClass}
                title={pipeline.timezone}
              >
                {formatPipelineTimezoneLabel(pipeline.timezone)}
              </span>
              <span
                className={clsx(
                  pipelineMetaChipClass,
                  !pipeline.active && 'opacity-70'
                )}
              >
                {nextSlotLabel}
              </span>
              {!!pipeline.contextDocuments?.length && (
                <PipelineContextDocumentsPanel
                  documents={pipeline.contextDocuments}
                  compact
                />
              )}
            </div>
          </div>

          <div
            className="flex items-center gap-[8px] shrink-0"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Slider
              value={pipeline.active ? 'on' : 'off'}
              onChange={onToggleActive}
              fill={true}
            />
            <PipelineActionsMenu
              disabled={pending}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        </div>
      </div>
    </article>
  );
};

const PipelineEditModal: FC<{
  pipelineId: string;
  onSaved: () => void;
}> = ({ pipelineId, onSaved }) => {
  const { data, isLoading, error } = usePipelineDetail(pipelineId);

  if (isLoading) {
    return <LoadingComponent height={60} width={60} />;
  }

  if (error || !data) {
    return (
      <div className="text-[14px] text-red-500">
        Failed to load Pipeline settings.
      </div>
    );
  }

  return <PipelineForm pipeline={data} onSaved={onSaved} />;
};

export const Pipelines: FC = () => {
  const t = useT();
  const router = useRouter();
  const modal = useModals();
  const decision = useDecisionModal();
  const toaster = useToaster();
  const { data, error, isLoading, mutate } = usePipelineList();
  const { data: integrations = [], isLoading: integrationsLoading } =
    useIntegrationList();
  const setPipelineStatus = usePipelineStatus();
  const deletePipeline = useDeletePipeline();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string>();
  const hasRestoredChannel = useRef(false);
  const visiblePipelines = useMemo(
    () => filterPipelinesByChannel(data || [], selectedChannelId),
    [data, selectedChannelId]
  );

  useEffect(() => {
    if (hasRestoredChannel.current || !integrations.length) {
      return;
    }
    hasRestoredChannel.current = true;
    const restored = resolveChannelId({
      eligibleIds: integrations.map((integration) => integration.id),
      currentId: undefined,
      fallbackId: integrations[0]?.id,
    });
    if (restored) {
      setSelectedChannelId(restored);
    }
  }, [integrations]);

  const handleChannelSelect = useCallback(
    (integration: IntegrationListItem) => {
      const nextId =
        selectedChannelId === integration.id ? undefined : integration.id;
      if (nextId) {
        setLastChannelId(nextId);
      }
      setSelectedChannelId(nextId);
    },
    [selectedChannelId]
  );

  const openCreate = useCallback(() => {
    modal.openModal({
      title: t('create_pipeline', 'Create Pipeline'),
      withCloseButton: true,
      classNames: {
        modal: 'w-[100%] max-w-[760px] text-textColor',
      },
      children: <PipelineForm onSaved={() => mutate()} />,
    });
  }, [modal, mutate, t]);

  const openEdit = useCallback(
    (pipeline: PipelineSummary) => {
      modal.openModal({
        title: t('edit_pipeline', 'Edit Pipeline'),
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[760px] text-textColor',
        },
        children: <PipelineEditModal pipelineId={pipeline.id} onSaved={() => mutate()} />,
      });
    },
    [modal, mutate, t]
  );

  const toggleActive = useCallback(
    (pipeline: PipelineSummary) => async (value: 'on' | 'off') => {
      setPendingId(pipeline.id);
      try {
        await setPipelineStatus(pipeline.id, value === 'on');
        await mutate();
      } catch (err: any) {
        toaster.show(err?.message || 'Failed to update Pipeline status.', 'warning');
      } finally {
        setPendingId(null);
      }
    },
    [mutate, setPipelineStatus, toaster]
  );

  const confirmDelete = useCallback(
    (pipeline: PipelineSummary) => async () => {
      const approved = await decision.open({
        title: t('delete_pipeline', 'Delete Pipeline?'),
        description: `Deleting "${pipeline.name}" will remove the Pipeline schedule. ${pipeline.queueCount} queued item${pipeline.queueCount === 1 ? '' : 's'} will be preserved as drafts in your calendar — no content will be deleted.`,
        approveLabel: t('delete_pipeline_confirm', 'Delete Pipeline'),
        cancelLabel: t('cancel', 'Cancel'),
      });
      if (!approved) {
        return;
      }
      setPendingId(pipeline.id);
      try {
        await deletePipeline(pipeline.id);
        toaster.show(
          t('pipeline_deleted_successfully', 'Pipeline deleted. Queued posts were kept as drafts.'),
          'success'
        );
        await mutate();
      } catch (err: any) {
        toaster.show(err?.message || 'Failed to delete Pipeline.', 'warning');
      } finally {
        setPendingId(null);
      }
    },
    [decision, deletePipeline, mutate, t, toaster]
  );

  if (isLoading || integrationsLoading) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <>
      <ChannelsSidebar
        integrationCount={integrations.length}
        showAddProvider={false}
      >
        {(collapsed) => (
          <ChannelMenu
            collapsed={collapsed}
            integrations={integrations}
            selectedIds={selectedChannelId ? [selectedChannelId] : undefined}
            onSelect={handleChannelSelect}
          />
        )}
      </ChannelsSidebar>
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[20px] transition-all text-textColor min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-[6px]">
          <h1 className="text-[24px] font-[600]">
            {t('pipelines', 'Pipelines')} ({visiblePipelines.length})
          </h1>
          <p className="text-[14px] opacity-70 max-w-[760px]">
            {t(
              'pipelines_description',
              'Schedule recurring posting slots for a fixed set of channels. Queue content without picking dates — the server projects the next available slot in the Pipeline timezone.'
            )}
          </p>
        </div>

        {error && (
          <div className="rounded-[12px] border border-red-500/30 bg-newBgColor px-[16px] py-[12px] text-[14px] text-red-500">
            {t('pipelines_load_error', 'Failed to load Pipelines. Please refresh and try again.')}
          </div>
        )}

        <div className="flex justify-between items-center gap-[12px] flex-wrap">
          <div className="flex items-center gap-[10px] flex-wrap">
            <Button onClick={openCreate}>{t('create', '+ Create')}</Button>
            <Button secondary onClick={() => router.push('/pipelines/schedule')}>
              {t('pipeline_schedule', 'Schedule')}
            </Button>
          </div>
        </div>

        {!data?.length ? (
          <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[32px] flex flex-col items-center justify-center gap-[12px] text-center">
            <div className="text-[18px] font-[600]">
              {t('no_pipelines_yet', 'No Pipelines yet')}
            </div>
            <div className="text-[14px] opacity-70 max-w-[520px]">
              {t(
                'no_pipelines_description',
                'Create a Pipeline to define channels and timezone, then configure weekly posting times from its detail page.'
              )}
            </div>
            <Button onClick={openCreate}>{t('create', '+ Create')}</Button>
          </div>
        ) : !visiblePipelines.length ? (
          <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[32px] flex flex-col items-center justify-center gap-[12px] text-center">
            <div className="text-[18px] font-[600]">
              {t(
                'no_pipelines_for_channel',
                'No Pipelines for this channel'
              )}
            </div>
            <div className="text-[14px] opacity-70 max-w-[520px]">
              {t(
                'no_pipelines_for_channel_description',
                'None of your Pipelines include this channel. Select a different channel or click it again to show all Pipelines.'
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[16px]">
            {visiblePipelines.map((pipeline) => (
              <PipelineListCard
                key={pipeline.id}
                pipeline={pipeline}
                pending={pendingId === pipeline.id}
                onSchedule={() => router.push(`/pipelines/${pipeline.id}`)}
                onEdit={() => openEdit(pipeline)}
                onDelete={confirmDelete(pipeline)}
                onToggleActive={toggleActive(pipeline)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

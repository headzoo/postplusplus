'use client';

import { FC, useCallback, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useDrag, useDrop } from 'react-dnd';
import { useClickOutside } from '@mantine/hooks';
import { Button } from '@gitroom/react/form/button';
import { DatePicker } from '@gitroom/frontend/components/launches/helpers/date.picker';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  useDecisionModal,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  ADD_EDIT_MODAL_OPTIONS,
  AddEditModal,
} from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { VideoOrImage } from '@gitroom/react/helpers/video.or.image';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import {
  PipelineDetail,
  PipelineQueueItem,
  PipelineSummary,
} from './pipeline.types';
import {
  buildQueueReorderBody,
  formatPipelineSlot,
  shuffleQueuedOrder,
} from './pipeline.utils';
import { useReorderPipelineQueue } from './use.pipeline.queue.order';

const queueDragType = 'pipeline-queue-item';

const queueStatusClass = (status: PipelineQueueItem['status']) =>
  status === 'FAILED'
    ? 'border-red-500/40 text-red-500'
    : status === 'PUBLISHING'
    ? 'border-yellow-500/40 text-yellow-500'
    : 'border-newBorder opacity-70';

const QueuePostPreview: FC<{ item: PipelineQueueItem }> = ({ item }) => {
  const mediaDir = useMediaDirectory();
  const roots = item.posts.filter((post) => !post.parentPostId);
  const primary = roots[0];
  const content = stripHtmlValidation('none', primary?.content || '').trim();
  const media = primary?.image?.[0];
  const mediaSrc = media
    ? mediaDir.set(media.thumbnail || media.path)
    : undefined;
  const integration = primary?.integration;

  return (
    <div className="flex flex-col gap-[10px] p-[12px] bg-newBgColor min-h-[220px]">
      <div className="flex gap-[8px] items-start">
        <div className="relative min-w-[36px] h-[36px] w-[36px]">
          <img
            src={integration?.picture || '/no-picture.jpg'}
            alt={integration?.name || 'channel'}
            draggable={false}
            className="rounded-full relative z-[2] w-[36px] h-[36px]"
          />
          {integration?.identifier && (
            <SafeImage
              src={`/icons/platforms/${integration.identifier}.png`}
              className="min-w-[16px] min-h-[16px] rounded-full absolute z-10 -bottom-[3px] -end-[3px] border border-newBorder"
              alt={integration.identifier}
              width={16}
              height={16}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-[600] truncate">
            {integration?.name || 'Untitled post'}
          </div>
          {integration?.display && (
            <div className="text-[12px] opacity-60 truncate">
              {integration.display}
            </div>
          )}
        </div>
      </div>
      <div className="text-[13px] whitespace-pre-wrap break-words line-clamp-4">
        {content || 'Untitled post'}
      </div>
      {mediaSrc ? (
        <div className="rounded-[10px] overflow-hidden h-[140px] bg-newBgColorInner">
          <VideoOrImage autoplay={false} src={mediaSrc} />
        </div>
      ) : (
        <div className="rounded-[10px] h-[80px] border border-newBorder bg-newBgColorInner flex items-center justify-center text-[12px] opacity-50">
          No media
        </div>
      )}
      {roots.length > 1 && (
        <div className="flex gap-[5px] flex-wrap">
          {roots.map((post) => (
            <span
              key={post.id}
              className="text-[11px] border border-newBorder rounded-full px-[6px] py-[1px]"
            >
              {post.integration.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const QueueItemMenu: FC<{
  queued: boolean;
  locked: boolean;
  cleanupAllowed: boolean;
  onEdit: () => void;
  onNow: () => void;
  onSchedule: () => void;
  onRemove: () => void;
  onDelete: () => void;
}> = ({
  queued,
  locked,
  cleanupAllowed,
  onEdit,
  onNow,
  onSchedule,
  onRemove,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Queue item actions"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center justify-center w-[28px] h-[28px] rounded-[6px] text-menuDots hover:text-menuDotsHover hover:bg-newBgColor"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M13.125 12C13.125 12.2225 13.059 12.44 12.9354 12.625C12.8118 12.81 12.6361 12.9542 12.4305 13.0394C12.225 13.1245 11.9988 13.1468 11.7805 13.1034C11.5623 13.06 11.3618 12.9528 11.2045 12.7955C11.0472 12.6382 10.94 12.4377 10.8966 12.2195C10.8532 12.0012 10.8755 11.775 10.9606 11.5695C11.0458 11.3639 11.19 11.1882 11.375 11.0646C11.56 10.941 11.7775 10.875 12 10.875C12.2984 10.875 12.5845 10.9935 12.7955 11.2045C13.0065 11.4155 13.125 11.7016 13.125 12ZM12 6.75C12.2225 6.75 12.44 6.68402 12.625 6.5604C12.81 6.43679 12.9542 6.26109 13.0394 6.05552C13.1245 5.84995 13.1468 5.62375 13.1034 5.40552C13.06 5.1873 12.9528 4.98684 12.7955 4.82951C12.6382 4.67217 12.4377 4.56503 12.2195 4.52162C12.0012 4.47821 11.775 4.50049 11.5695 4.58564C11.3639 4.67078 11.1882 4.81498 11.0646 4.99998C10.941 5.18499 10.875 5.4025 10.875 5.625C10.875 5.92337 10.9935 6.20952 11.2045 6.4205C11.4155 6.63147 11.7016 6.75 12 6.75ZM12 17.25C11.7775 17.25 11.56 17.316 11.375 17.4396C11.19 17.5632 11.0458 17.7389 10.9606 17.9445C10.8755 18.15 10.8532 18.3762 10.8966 18.5945C10.94 18.8127 11.0472 19.0132 11.2045 19.1705C11.3618 19.3278 11.5623 19.435 11.7805 19.4784C11.9988 19.5218 12.225 19.4995 12.4305 19.4144C12.6361 19.3292 12.8118 19.185 12.9354 19C13.059 18.815 13.125 18.5975 13.125 18.375C13.125 18.0766 13.0065 17.7905 12.7955 17.5795C12.5845 17.3685 12.2984 17.25 12 17.25Z"
            fill="currentColor"
          />
        </svg>
      </button>
      {open && (
        <div className="z-[300] absolute end-0 bottom-full mb-[6px] min-w-[140px] bg-newBgColorInner p-[8px] menu-shadow flex flex-col rounded-[8px] border border-newBorder">
          <button
            type="button"
            disabled={!queued || locked}
            onClick={run(onEdit)}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={!queued || locked}
            onClick={run(onNow)}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            Now
          </button>
          <button
            type="button"
            disabled={!queued || locked}
            onClick={run(onSchedule)}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            Schedule
          </button>
          <button
            type="button"
            disabled={!cleanupAllowed || locked}
            onClick={run(onRemove)}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            Remove
          </button>
          <button
            type="button"
            disabled={!cleanupAllowed || locked}
            onClick={run(onDelete)}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

const QueueItem: FC<{
  item: PipelineQueueItem;
  index: number;
  queue: PipelineQueueItem[];
  projectedFor?: string;
  timezone: string;
  pending: boolean;
  onMove: (from: number, to: number) => void;
  onReorderLocal: (from: number, to: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onAction: (
    item: PipelineQueueItem,
    action: 'remove' | 'delete' | 'publish-now'
  ) => void;
  onMoveTo: (item: PipelineQueueItem, pipelineId: string) => void;
  onSchedule: (item: PipelineQueueItem, date: string) => void;
  onEdit: (item: PipelineQueueItem) => void;
  destinations: PipelineSummary[];
}> = ({
  item,
  index,
  queue,
  projectedFor,
  timezone,
  pending,
  onMove,
  onReorderLocal,
  onDragStart,
  onDragEnd,
  onAction,
  onMoveTo,
  onSchedule,
  onEdit,
  destinations,
}) => {
  const [showSchedule, setShowSchedule] = useState(false);
  const [date, setDate] = useState(dayjs());
  const locked = pending || item.status === 'PUBLISHING';
  const queued = item.status === 'QUEUED';
  const cleanupAllowed = item.status === 'QUEUED' || item.status === 'FAILED';
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: queueDragType,
      item: () => {
        onDragStart();
        return { id: item.id, index };
      },
      end: () => {
        onDragEnd();
      },
      canDrag: !locked && item.status === 'QUEUED',
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [index, item.id, item.status, locked, onDragEnd, onDragStart]
  );
  const [, drop] = useDrop(
    () => ({
      accept: queueDragType,
      canDrop: () => item.status === 'QUEUED' && !locked,
      hover: (dragged: {
        id: string;
        index: number;
        lastTargetId?: string;
      }) => {
        if (
          dragged.id === item.id ||
          dragged.lastTargetId === item.id ||
          item.status !== 'QUEUED'
        ) {
          return;
        }
        if (dragged.index !== index) {
          onReorderLocal(dragged.index, index);
          dragged.index = index;
        }
        dragged.lastTargetId = item.id;
      },
      drop: () => {
        onDragEnd();
      },
    }),
    [index, item.id, item.status, locked, onDragEnd, onReorderLocal]
  );

  return (
    <div
      // @ts-ignore react-dnd connector type
      ref={drop}
      className="relative h-full"
    >
      <div
        className={clsx(
          'h-full rounded-[8px] border border-newBorder bg-newBgColorInner flex flex-col',
          isDragging && 'opacity-40'
        )}
      >
        <div
          // @ts-ignore react-dnd connector type
          ref={drag}
          className={clsx(
            'relative flex-1 overflow-hidden rounded-t-[8px] select-none',
            queued && !locked
              ? 'cursor-grab active:cursor-grabbing'
              : 'cursor-default'
          )}
          aria-label={queued ? 'Drag to reorder queue item' : undefined}
        >
          <button
            type="button"
            disabled={locked || item.status !== 'QUEUED'}
            className="absolute z-[2] top-[8px] start-[8px] pointer-events-none opacity-60 px-[4px] bg-newBgColorInner rounded-[4px]"
            aria-hidden="true"
            tabIndex={-1}
          >
            ⠿
          </button>
          <QueuePostPreview item={item} />
        </div>
        <div className="relative z-[3] p-[12px] border-t border-newBorder flex flex-col gap-[8px] rounded-b-[8px]">
          <div className="flex items-start justify-between gap-[8px]">
            <div className="min-w-0 flex flex-wrap gap-[6px] items-center">
              <span className="font-[600] text-[13px]">#{index + 1}</span>
              <span
                className={clsx(
                  'text-[11px] px-[7px] py-[2px] rounded-full border',
                  queueStatusClass(item.status)
                )}
              >
                {item.status}
              </span>
              {projectedFor && (
                <span className="text-[12px] opacity-70">
                  Pipeline time: {formatPipelineSlot(projectedFor, timezone)}
                </span>
              )}
            </div>
            <QueueItemMenu
              queued={queued}
              locked={locked}
              cleanupAllowed={cleanupAllowed}
              onEdit={() => onEdit(item)}
              onNow={() => onAction(item, 'publish-now')}
              onSchedule={() => setShowSchedule((current) => !current)}
              onRemove={() => onAction(item, 'remove')}
              onDelete={() => onAction(item, 'delete')}
            />
          </div>
          {item.error && (
            <div className="text-[12px] text-red-500">{item.error}</div>
          )}
          <div className="flex gap-[6px] items-center flex-wrap opacity-80">
            <button
              type="button"
              disabled={!queued || locked || index === 0}
              onClick={() => onMove(index, index - 1)}
              className="h-[28px] min-w-[28px] px-[8px] rounded-[6px] border border-newBorder bg-newBgColor text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={!queued || locked || index === queue.length - 1}
              onClick={() => onMove(index, index + 1)}
              className="h-[28px] min-w-[28px] px-[8px] rounded-[6px] border border-newBorder bg-newBgColor text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Move down"
            >
              ↓
            </button>
            <select
              disabled={!queued || locked || !destinations.length}
              className="bg-newBgColor border border-newBorder rounded-[6px] text-[12px] max-w-[150px] h-[28px] disabled:opacity-40"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) onMoveTo(item, event.target.value);
              }}
            >
              <option value="">Move to…</option>
              {destinations.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {showSchedule && (
        <div className="absolute top-full start-0 end-0 z-[20] mt-[8px] p-[10px] border border-newBorder rounded-[8px] bg-newBgColor flex gap-[8px] items-center flex-wrap">
          <DatePicker date={date} onChange={setDate} />
          <Button
            disabled={!queued || locked}
            onClick={() => onSchedule(item, date.toISOString())}
          >
            Confirm schedule
          </Button>
        </div>
      )}
    </div>
  );
};

export const PipelineQueue: FC<{
  pipeline: PipelineDetail;
  pipelines: PipelineSummary[];
  mutate: () => Promise<PipelineDetail | undefined>;
}> = ({ pipeline, pipelines, mutate }) => {
  const fetch = useFetch();
  const reorderQueue = useReorderPipelineQueue();
  const modal = useModals();
  const decision = useDecisionModal();
  const toaster = useToaster();
  const [items, setItems] = useState(pipeline.queueItems);
  const [pending, setPending] = useState(false);
  const itemsRef = useRef(items);
  const dragStartOrderRef = useRef<string[] | null>(null);
  itemsRef.current = items;
  const projections = useMemo(
    () =>
      new Map(
        pipeline.projections.map((projection) => [
          projection.itemId,
          projection.projectedFor,
        ])
      ),
    [pipeline.projections]
  );
  const queue = items.filter((item) => item.status === 'QUEUED');
  const otherItems = items.filter((item) => item.status !== 'QUEUED');
  const destinations = pipelines.filter(
    (candidate) =>
      candidate.id !== pipeline.id &&
      candidate.channels
        .map((channel) => channel.id)
        .sort()
        .join(',') ===
        pipeline.channels
          .map((channel) => channel.id)
          .sort()
          .join(',')
  );

  const refresh = useCallback(async () => {
    const result = await mutate();
    if (result) setItems(result.queueItems);
  }, [mutate]);
  const beginDrag = useCallback(() => {
    dragStartOrderRef.current = itemsRef.current
      .filter((item) => item.status === 'QUEUED')
      .map((item) => item.id);
  }, []);
  const reorderLocal = useCallback((from: number, to: number) => {
    if (from === to) {
      return;
    }
    setItems((current) => {
      const queued = current.filter((item) => item.status === 'QUEUED');
      const rest = current.filter((item) => item.status !== 'QUEUED');
      if (from < 0 || to < 0 || from >= queued.length || to >= queued.length) {
        return current;
      }
      const next = [...queued];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const reordered = [...next, ...rest];
      itemsRef.current = reordered;
      return reordered;
    });
  }, []);
  const persistDragReorder = useCallback(async () => {
    const startIds = dragStartOrderRef.current;
    dragStartOrderRef.current = null;
    if (!startIds) {
      return;
    }
    const queued = itemsRef.current.filter((item) => item.status === 'QUEUED');
    const currentIds = queued.map((item) => item.id);
    if (
      startIds.length !== currentIds.length ||
      startIds.every((id, index) => id === currentIds[index])
    ) {
      return;
    }
    setPending(true);
    try {
      await reorderQueue(pipeline.id, { itemIds: currentIds });
      await refresh();
    } catch (error: any) {
      const byId = new Map(itemsRef.current.map((item) => [item.id, item]));
      const restoredQueue = startIds
        .map((id) => byId.get(id))
        .filter((item): item is PipelineQueueItem => Boolean(item));
      const rest = itemsRef.current.filter((item) => item.status !== 'QUEUED');
      setItems([...restoredQueue, ...rest]);
      toaster.show(error?.message || 'Unable to reorder queue.', 'warning');
    } finally {
      setPending(false);
    }
  }, [pipeline.id, refresh, reorderQueue, toaster]);
  const move = useCallback(
    async (from: number, to: number) => {
      if (from === to || pending) return;
      const next = [...queue];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      setItems([...next, ...otherItems]);
      setPending(true);
      try {
        await fetch(`/pipelines/${pipeline.id}/items/${item.id}/reorder`, {
          method: 'POST',
          body: JSON.stringify(buildQueueReorderBody(next, to)),
        });
        await refresh();
      } catch (error: any) {
        setItems(pipeline.queueItems);
        toaster.show(error?.message || 'Unable to reorder queue.', 'warning');
      } finally {
        setPending(false);
      }
    },
    [
      fetch,
      otherItems,
      pending,
      pipeline.id,
      pipeline.queueItems,
      queue,
      refresh,
      toaster,
    ]
  );
  const shuffle = useCallback(async () => {
    if (pending || queue.length < 2) {
      return;
    }
    const shuffled = shuffleQueuedOrder(queue);
    const previousItems = items;
    setItems([...shuffled, ...otherItems]);
    setPending(true);
    try {
      await reorderQueue(pipeline.id, {
        itemIds: shuffled.map((item) => item.id),
      });
      await refresh();
      toaster.show('Queue shuffled.', 'success');
    } catch (error: any) {
      setItems(previousItems);
      await refresh();
      toaster.show(error?.message || 'Unable to shuffle queue.', 'warning');
    } finally {
      setPending(false);
    }
  }, [
    items,
    otherItems,
    pending,
    pipeline.id,
    queue,
    refresh,
    reorderQueue,
    toaster,
  ]);
  const action = useCallback(
    async (
      item: PipelineQueueItem,
      type: 'remove' | 'delete' | 'publish-now'
    ) => {
      const actionText =
        type === 'publish-now'
          ? 'Publish now'
          : type === 'delete'
          ? 'Delete'
          : 'Remove';
      const description =
        type === 'publish-now'
          ? 'This will detach the item and publish its channel posts immediately.'
          : type === 'delete'
          ? 'This will delete this content from the Pipeline and soft-delete its channel posts.'
          : 'This will remove the item from the Pipeline but keep its channel posts as drafts.';
      const approved = await decision.open({
        title: `${actionText} this Pipeline item?`,
        description,
        approveLabel: 'Confirm',
        cancelLabel: 'Cancel',
      });
      if (!approved) return;
      setPending(true);
      try {
        await fetch(`/pipelines/items/${item.id}/action`, {
          method: 'POST',
          body: JSON.stringify({ action: type }),
        });
        await refresh();
      } catch (error: any) {
        toaster.show(
          error?.message || 'Unable to update queue item.',
          'warning'
        );
      } finally {
        setPending(false);
      }
    },
    [decision, fetch, refresh, toaster]
  );
  const moveTo = useCallback(
    async (item: PipelineQueueItem, destinationPipelineId: string) => {
      setPending(true);
      try {
        await fetch(`/pipelines/items/${item.id}/move`, {
          method: 'POST',
          body: JSON.stringify({ destinationPipelineId }),
        });
        await refresh();
        toaster.show(
          'Item moved. Destination projections were updated.',
          'success'
        );
      } catch (error: any) {
        toaster.show(error?.message || 'Unable to move queue item.', 'warning');
      } finally {
        setPending(false);
      }
    },
    [fetch, refresh, toaster]
  );
  const schedule = useCallback(
    async (item: PipelineQueueItem, date: string) => {
      setPending(true);
      try {
        await fetch(`/pipelines/items/${item.id}/schedule`, {
          method: 'POST',
          body: JSON.stringify({ date }),
        });
        await refresh();
      } catch (error: any) {
        toaster.show(
          error?.message || 'Unable to schedule queue item.',
          'warning'
        );
      } finally {
        setPending(false);
      }
    },
    [fetch, refresh, toaster]
  );
  const edit = useCallback(
    (item: PipelineQueueItem) => {
      const channels = item.posts
        .filter((post) => !post.parentPostId)
        .map((root) => ({
          integration: root.integration.id,
          posts: item.posts.filter(
            (post) => post.integration.id === root.integration.id
          ),
          settings: root.settings || {},
        }));
      modal.openModal({
        ...ADD_EDIT_MODAL_OPTIONS,
        children: (
          <ExistingDataContextProvider
            value={{
              integration: channels[0]?.integration,
              group: item.group,
              posts: channels[0]?.posts || [],
              settings: channels[0]?.settings || {},
              channels,
            }}
          >
            <AddEditModal
              allIntegrations={pipeline.channels}
              integrations={pipeline.channels}
              date={dayjs()}
              reopenModal={() => {}}
              mutate={refresh}
            />
          </ExistingDataContextProvider>
        ),
      });
    },
    [modal, pipeline.channels, refresh]
  );

  return (
    <DNDProvider>
      <div className="rounded-[12px] border border-newBorder bg-newBgColor">
        <div className="px-[20px] py-[14px] border-b border-newBorder flex items-center justify-between gap-[12px]">
          <span className="text-[16px] font-[600]">Queue</span>
          <Button
            secondary
            disabled={pending || queue.length < 2}
            onClick={shuffle}
            aria-label="Shuffle queued posts"
            data-tooltip-id="tooltip"
            data-tooltip-content="Randomize the order of queued posts"
          >
            Shuffle
          </Button>
        </div>
        <div className="p-[16px] flex flex-col gap-[16px]">
          {queue.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[12px]">
              {queue.map((item, index) => (
                <QueueItem
                  key={item.id}
                  item={item}
                  index={index}
                  queue={queue}
                  projectedFor={projections.get(item.id)}
                  timezone={pipeline.timezone}
                  pending={pending}
                  onMove={move}
                  onReorderLocal={reorderLocal}
                  onDragStart={beginDrag}
                  onDragEnd={persistDragReorder}
                  onAction={action}
                  onMoveTo={moveTo}
                  onSchedule={schedule}
                  onEdit={edit}
                  destinations={destinations}
                />
              ))}
            </div>
          ) : (
            <div className="text-[13px] opacity-60">No queued items.</div>
          )}
          {otherItems.length > 0 && (
            <>
              <div className="text-[13px] font-[600] opacity-70">
                Publishing and failed
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[12px]">
                {otherItems.map((item) => (
                  <QueueItem
                    key={item.id}
                    item={item}
                    index={queue.length}
                    queue={queue}
                    projectedFor={projections.get(item.id)}
                    timezone={pipeline.timezone}
                    pending={pending}
                    onMove={move}
                    onReorderLocal={reorderLocal}
                    onDragStart={beginDrag}
                    onDragEnd={persistDragReorder}
                    onAction={action}
                    onMoveTo={moveTo}
                    onSchedule={schedule}
                    onEdit={edit}
                    destinations={destinations}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </DNDProvider>
  );
};

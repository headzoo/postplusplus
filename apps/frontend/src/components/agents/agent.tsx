'use client';

import React, {
  createContext,
  FC,
  useCallback,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { PipelineSummary } from '@gitroom/frontend/components/pipelines/pipeline.types';
import { usePipelineList } from '@gitroom/frontend/components/pipelines/use.pipeline.list';
import { PipelineSidebarList } from '@gitroom/frontend/components/pipelines/pipeline.sidebar.list';
import {
  ChannelMenu,
  ChannelsSidebar,
} from '@gitroom/frontend/components/launches/channels.sidebar';
import {
  IntegrationListItem,
  useIntegrationList,
} from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import useCookie from 'react-use-cookie';

export interface AgentSelectionState {
  properties: Integrations[];
  selectedPipeline: PipelineSummary | null;
}

export interface SelectedPipelineContext {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
  channels: Array<{
    id: string;
    name: string;
    platform: string;
    picture: string;
  }>;
  contextDocuments: Array<{
    id: string;
    name: string;
    fileSize: number;
    updatedAt: string;
  }>;
}

export const defaultAgentSelectionState: AgentSelectionState = {
  properties: [],
  selectedPipeline: null,
};

export function mapSelectedPipelineContext(
  pipeline: PipelineSummary | null
): SelectedPipelineContext | null {
  if (!pipeline) {
    return null;
  }

  return {
    id: pipeline.id,
    name: pipeline.name,
    timezone: pipeline.timezone,
    active: pipeline.active,
    channels: pipeline.channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      platform: channel.identifier,
      picture: channel.picture,
    })),
    contextDocuments: (pipeline.contextDocuments || []).map((document) => ({
      id: document.id,
      name: document.name,
      fileSize: document.fileSize,
      updatedAt: document.updatedAt,
    })),
  };
}

export function buildAgentTransportMetadata(
  properties: Integrations[],
  selectedPipeline: PipelineSummary | null
): string {
  const pipeline = mapSelectedPipelineContext(selectedPipeline);
  const integrations = properties.length
    ? `\n[--integrations--]
Use the following social media platforms: ${JSON.stringify(
      properties.map((p) => ({
        id: p.id,
        platform: p.identifier,
        profilePicture: p.picture,
        additionalSettings: p.additionalSettings,
      }))
    )}
[--integrations--]`
    : '';

  return (
    integrations +
    (pipeline
      ? `\n[--pipeline--]
${JSON.stringify(pipeline)}
[--pipeline--]`
      : '')
  );
}

export function stripAgentTransportMetadata(content: string): string {
  return content
    .replace(/\n?\[--integrations--\][\s\S]*?\[--integrations--\]/g, '')
    .replace(/\n?\[--pipeline--\][\s\S]*?\[--pipeline--\]/g, '');
}

export function applyChannelToggle(
  properties: Integrations[],
  selectedPipeline: PipelineSummary | null,
  integration: Integrations
): AgentSelectionState {
  const currentProperties = properties;
  const isSelected = currentProperties.some((p) => p.id === integration.id);

  if (isSelected) {
    return {
      properties: currentProperties.filter((p) => p.id !== integration.id),
      selectedPipeline: null,
    };
  }

  return {
    properties: [...currentProperties, integration],
    selectedPipeline: null,
  };
}

export function applyPipelineSelection(
  selectedPipeline: PipelineSummary | null,
  pipeline: PipelineSummary
): AgentSelectionState {
  if (selectedPipeline?.id === pipeline.id) {
    return { properties: [], selectedPipeline: null };
  }

  return {
    properties: [...pipeline.channels],
    selectedPipeline: pipeline,
  };
}

export const MediaPortal: FC<{
  media: { path: string; id: string }[];
  value: string;
  setMedia: (event: {
    target: {
      name: string;
      value?: {
        id: string;
        path: string;
        alt?: string;
        thumbnail?: string;
        thumbnailTimestamp?: number;
      }[];
    };
  }) => void;
  hideToolbar?: boolean;
  attachTriggerRef?: React.MutableRefObject<(() => void) | null>;
}> = ({ media, setMedia, value, hideToolbar, attachTriggerRef }) => {
  const t = useT();
  return (
    <div
      className={
        hideToolbar
          ? 'w-full editor rm-bg'
          : 'pl-[14px] pr-[24px] whitespace-nowrap editor rm-bg'
      }
    >
      <MultiMediaComponent
        allData={[{ content: value }]}
        text={value}
        label={t('attachments', 'Attachments')}
        description=""
        value={media}
        dummy={false}
        name="image"
        onChange={setMedia}
        onOpen={() => { }}
        onClose={() => { }}
        hideToolbar={hideToolbar}
        attachTriggerRef={attachTriggerRef}
      />
    </div>
  );
};

export const AgentList: FC<{
  selectedIntegrations: Integrations[];
  selectedPipeline: PipelineSummary | null;
  onToggleIntegration: (integration: Integrations) => void;
  onSelectPipeline: (pipeline: PipelineSummary) => void;
}> = ({
  selectedIntegrations,
  selectedPipeline,
  onToggleIntegration,
  onSelectPipeline,
}) => {
    const { data: integrations = [] } = useIntegrationList();

    const {
      data: pipelines,
      error: pipelinesError,
      isLoading: pipelinesLoading,
    } = usePipelineList();

    const handleSelect = useCallback(
      (integration: IntegrationListItem) => {
        onToggleIntegration(integration as Integrations);
      },
      [onToggleIntegration]
    );

    return (
      <ChannelsSidebar
        integrationCount={integrations.length}
        showAddProvider={false}
      >
        {(collapsed) => (
          <>
            <ChannelMenu
              collapsed={collapsed}
              integrations={integrations}
              selectedIds={selectedIntegrations.map((integration) => integration.id)}
              onSelect={handleSelect}
            />
            <PipelineSidebarList
              collapsed={collapsed}
              pipelines={pipelines || []}
              selectedPipelineId={selectedPipeline?.id}
              isLoading={pipelinesLoading}
              error={pipelinesError}
              onSelectPipeline={onSelectPipeline}
              activeOnly
            />
          </>
        )}
      </ChannelsSidebar>
    );
  };

export const PropertiesContext =
  createContext<AgentSelectionState>(defaultAgentSelectionState);

export const Agent: FC<{ children: ReactNode }> = ({ children }) => {
  const [selection, setSelection] = useState<AgentSelectionState>(
    defaultAgentSelectionState
  );
  const [threadsOpen, setThreadsOpen] = useState(false);

  const handleToggleIntegration = useCallback((integration: Integrations) => {
    setSelection((current) =>
      applyChannelToggle(
        current.properties,
        current.selectedPipeline,
        integration
      )
    );
  }, []);

  const handleSelectPipeline = useCallback((pipeline: PipelineSummary) => {
    setSelection((current) =>
      applyPipelineSelection(current.selectedPipeline, pipeline)
    );
  }, []);

  const contextValue = useMemo(() => selection, [selection]);

  return (
    <PropertiesContext.Provider value={contextValue}>
      <AgentList
        selectedIntegrations={selection.properties}
        selectedPipeline={selection.selectedPipeline}
        onToggleIntegration={handleToggleIntegration}
        onSelectPipeline={handleSelectPipeline}
      />
      <Threads mobileOpen={threadsOpen} onClose={() => setThreadsOpen(false)} />
      <div className="bg-newBgColorInner flex flex-1 min-w-0 relative">
        <button
          type="button"
          onClick={() => setThreadsOpen(true)}
          className="hidden mobile:flex absolute top-[12px] start-[12px] z-[120] h-[32px] px-[10px] text-[12px] rounded-[8px] bg-btnSimple text-btnText border border-newBorder"
        >
          Threads
        </button>
        {children}
      </div>
    </PropertiesContext.Provider>
  );
};

const ThreadsPanelContent: FC<{
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}> = ({ onNavigate, collapsed = false, onToggleCollapse }) => {
  const fetch = useFetch();
  const t = useT();
  const threads = useCallback(async () => {
    return (await fetch('/copilot/list')).json();
  }, [fetch]);
  const { id } = useParams<{ id: string }>();

  const { data } = useSWR('threads', threads);

  return (
    <div
      className={clsx(
        'absolute top-0 start-0 w-full h-full flex flex-col gap-[15px]',
        collapsed ? 'px-[15px] py-[20px]' : 'p-[20px]'
      )}
    >      <div
      className={clsx(
        'justify-center flex shrink-0',
        collapsed && 'mx-auto w-[44px]'
      )}
    >
        <Link
          href={`/agents`}
          onClick={onNavigate}
          aria-label={t('start_a_new_chat', 'Start a new chat')}
          className={clsx(
            'text-white whitespace-nowrap rounded-md bg-btnPrimary flex justify-center items-center gap-[5px] outline-none',
            collapsed
              ? 'w-[44px] h-[44px] p-0'
              : 'flex-1 pt-[12px] pb-[14px] ps-[16px] pe-[20px] min-h-[44px] max-h-[44px]'
          )}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="21"
            height="20"
            viewBox="0 0 21 20"
            fill="none"
            className="min-w-[21px] min-h-[20px]"
          >
            <path
              d="M10.5001 4.16699V15.8337M4.66675 10.0003H16.3334"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {!collapsed && (
            <div className="flex-1 text-start text-[16px]">
              {t('start_a_new_chat', 'Start a new chat')}
            </div>
          )}
        </Link>
      </div>
      {!collapsed && (
        <div className="flex flex-col gap-[1px] flex-1 min-h-0 overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
          {data?.threads?.map((p: any) => (
            <Link
              className={clsx(
                'overflow-ellipsis overflow-hidden whitespace-nowrap hover:bg-newBgColor px-[10px] py-[6px] rounded-[10px] cursor-pointer',
                p.id === id && 'bg-newBgColor'
              )}
              href={`/agents/${p.id}`}
              onClick={onNavigate}
              key={p.id}
            >
              {p.title}
            </Link>
          ))}
        </div>
      )}
      {onToggleCollapse && (
        <div className="mt-auto shrink-0 flex items-center">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={
              collapsed
                ? t('expand_threads', 'Expand threads')
                : t('collapse_threads', 'Collapse threads')
            }
            className={clsx(
              'text-btnText bg-btnSimple rounded-[6px] w-[24px] h-[24px] flex items-center justify-center cursor-pointer select-none',
              collapsed ? 'mx-auto rotate-[180deg]' : 'ms-auto'
            )}
          >
            <svg width="7" height="13" viewBox="0 0 7 13" fill="none">
              <path
                d="M6 11.5L1 6.5L6 1.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

const Threads: FC<{ mobileOpen: boolean; onClose: () => void }> = ({
  mobileOpen,
  onClose,
}) => {
  const [collapseThreads, setCollapseThreads] = useCookie(
    'collapseThreads',
    '0'
  );
  const collapsed = collapseThreads === '1';

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen, onClose]);

  return (
    <>
      <div
        className={clsx(
          'trz bg-newBgColorInner hidden mobile:hidden md:flex flex-col gap-[15px] transition-all relative shrink-0',
          collapsed ? 'group sidebar w-[74px]' : 'w-[260px]'
        )}
      >
        <ThreadsPanelContent
          collapsed={collapsed}
          onToggleCollapse={() =>
            setCollapseThreads(collapsed ? '0' : '1')
          }
        />
      </div>
      {mobileOpen && (
        <div className="hidden mobile:block fixed inset-0 z-[560]">
          <button
            type="button"
            aria-label="Close threads"
            onClick={onClose}
            className="absolute inset-0 bg-primary/80 transition-opacity duration-200 opacity-100"
          />
          <aside className="absolute top-0 start-0 h-full w-[260px] bg-newBgColorInner transition-transform duration-200 ease-out translate-x-0">
            <ThreadsPanelContent onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
};

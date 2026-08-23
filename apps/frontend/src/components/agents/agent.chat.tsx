'use client';

import React, {
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CopilotChat, CopilotKitCSSProperties } from '@copilotkit/react-ui';
import {
  InputProps,
  UserMessageProps,
} from '@copilotkit/react-ui/dist/components/chat/props';
import { Input } from '@gitroom/frontend/components/agents/agent.input';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import {
  CopilotKit,
  useCopilotAction,
  useCopilotMessagesContext,
} from '@copilotkit/react-core';
import {
  buildAgentTransportMetadata,
  mapSelectedPipelineContext,
  PropertiesContext,
  stripAgentTransportMetadata,
} from '@gitroom/frontend/components/agents/agent';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useParams } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  Message as CopilotMessage,
  TextMessage,
} from '@copilotkit/runtime-client-gql';
import {
  ADD_EDIT_MODAL_OPTIONS,
  AddEditModal,
} from '@gitroom/frontend/components/new-launch/add.edit.modal';
import dayjs from 'dayjs';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';

const isNewAgentChat = (id?: string) => !id || id === 'new';

export const AgentChat: FC = () => {
  const { backendUrl } = useVariables();
  const params = useParams<{ id: string }>();
  const { properties, selectedPipeline } = useContext(PropertiesContext);
  const isNew = isNewAgentChat(params?.id);

  return (
    <CopilotKit
      {...(isNew ? {} : { threadId: params.id })}
      credentials="include"
      runtimeUrl={backendUrl + '/copilot/agent'}
      showDevConsole={false}
      agent="postiz"
      properties={{
        integrations: properties,
        pipeline: mapSelectedPipelineContext(selectedPipeline),
      }}
    >
      <Hooks />
      <LoadMessages id={params?.id} />
      <AgentChatShell isNew={isNew} />
    </CopilotKit>
  );
};

const AgentChatShell: FC<{ isNew: boolean }> = ({ isNew }) => {
  const t = useT();
  const { messages } = useCopilotMessagesContext();
  const showEmptyState = isNew && messages.length === 0;

  return (
    <div
      style={
        {
          '--copilot-kit-primary-color': 'var(--new-btn-text)',
          '--copilot-kit-background-color': 'var(--new-bg-color)',
        } as CopilotKitCSSProperties
      }
      className={`trz agent bg-newBgColorInner flex flex-col gap-[15px] transition-all flex-1 items-center relative${showEmptyState ? ' agent--empty' : ''
        }`}
    >
      <div
        className={`absolute left-0 w-full h-full pb-[20px]${showEmptyState
            ? ' flex flex-col items-center justify-center'
            : ''
          }`}
      >
        {showEmptyState && (
          <div className="agent-empty-heading pointer-events-none z-[1] flex shrink-0 justify-center px-[24px] mb-[16px]">
            <h2 className="text-[28px] md:text-[32px] font-[600] text-center text-textColor">
              {t('how_can_i_help', 'How can I help?')}
            </h2>
          </div>
        )}
        <div
          className={
            showEmptyState ? 'w-full max-w-[720px] px-[24px]' : 'h-full w-full'
          }
        >
          <CopilotChat
            className={showEmptyState ? 'w-full' : 'w-full h-full'}
            labels={{
              title: t('your_assistant', 'Your Assistant'),
            }}
            UserMessage={Message}
            Input={NewInput}
          />
        </div>
      </div>
    </div>
  );
};

const LoadMessages: FC<{ id?: string }> = ({ id }) => {
  const { messages, setMessages } = useCopilotMessagesContext();
  const fetch = useFetch();
  const currentId = useRef<string | null>(null);
  const loaded = useRef<{ id: string; messages: CopilotMessage[] } | null>(
    null
  );

  const loadMessages = useCallback(async (idToSet: string) => {
    const data = await (await fetch(`/copilot/${idToSet}/list`)).json();
    const list = data.messages.map((p: any) => {
      return new TextMessage({
        content: p.content.content,
        role: p.role,
      });
    });

    if (currentId.current !== idToSet) {
      return;
    }

    loaded.current = { id: idToSet, messages: list };
    setMessages(list);
  }, []);

  useEffect(() => {
    const resolvedId = id || 'new';
    currentId.current = resolvedId;
    if (isNewAgentChat(id)) {
      loaded.current = { id: resolvedId, messages: [] };
      setMessages([]);
      return;
    }
    loaded.current = null;
    loadMessages(id!);
  }, [id]);

  // CopilotKit resolves loadAgentState to an empty list for Mastra local agents
  // and can clobber the messages we hold, depending on which request resolves last
  useEffect(() => {
    if (loaded.current?.id !== id) {
      return;
    }

    if (messages.length) {
      loaded.current.messages = messages;
      return;
    }

    if (loaded.current.messages.length) {
      setMessages(loaded.current.messages);
    }
  }, [messages, id]);

  return null;
};

const Message: FC<UserMessageProps> = (props) => {
  const convertContentToImagesAndVideo = useMemo(() => {
    return (props.message?.content || '')
      .replace(/Video: (http.*mp4\n)/g, (match, p1) => {
        return `<video controls class="h-[150px] w-[150px] rounded-[8px] mb-[10px]"><source src="${p1.trim()}" type="video/mp4">Your browser does not support the video tag.</video>`;
      })
      .replace(/Image: (http.*\n)/g, (match, p1) => {
        return `<img src="${p1.trim()}" class="h-[150px] w-[150px] max-w-full border border-newBgColorInner" />`;
      })
      .replace(/\[\-\-Media\-\-\](.*)\[\-\-Media\-\-\]/g, (match, p1) => {
        return `<div class="flex justify-center mt-[20px]">${p1}</div>`;
      })
      .replace(/[\s\S]*/, (content) => stripAgentTransportMetadata(content));
  }, [props.message?.content]);
  return (
    <div
      className="copilotKitMessage copilotKitUserMessage min-w-0 md:min-w-[300px] max-w-full"
      dangerouslySetInnerHTML={{ __html: convertContentToImagesAndVideo }}
    />
  );
};
const NewInput: FC<InputProps> = (props) => {
  const [media, setMedia] = useState([] as { path: string; id: string }[]);
  const [value, setValue] = useState('');
  const { properties, selectedPipeline } = useContext(PropertiesContext);
  return (
    <Input
      {...props}
      media={media}
      onMediaChange={setMedia}
      onChange={setValue}
      onSend={(text) => {
        const send = props.onSend(
          text +
          (media.length > 0
            ? '\n[--Media--]' +
            media
              .map((m) =>
                hasExtension(m.path, 'mp4')
                  ? `Video: ${m.path}`
                  : `Image: ${m.path}`
              )
              .join('\n') +
            '\n[--Media--]'
            : '') +
          buildAgentTransportMetadata(properties, selectedPipeline)
        );
        setValue('');
        setMedia([]);
        return send;
      }}
    />
  );
};

export const Hooks: FC = () => {
  const modals = useModals();

  useCopilotAction({
    name: 'manualPosting',
    description:
      'This tool should be triggered when the user wants to manually add the generated post',
    parameters: [
      {
        name: 'list',
        type: 'object[]',
        description:
          'list of posts to schedule to different social media (integration ids)',
        attributes: [
          {
            name: 'integrationId',
            type: 'string',
            description: 'The integration id',
          },
          {
            name: 'date',
            type: 'string',
            description: 'UTC date of the scheduled post',
          },
          {
            name: 'settings',
            type: 'object',
            description: 'Settings for the integration [input:settings]',
          },
          {
            name: 'posts',
            type: 'object[]',
            description: 'list of posts / comments (one under another)',
            attributes: [
              {
                name: 'content',
                type: 'string',
                description: 'the content of the post',
              },
              {
                name: 'attachments',
                type: 'object[]',
                description: 'list of attachments',
                attributes: [
                  {
                    name: 'id',
                    type: 'string',
                    description: 'id of the attachment',
                  },
                  {
                    name: 'path',
                    type: 'string',
                    description: 'url of the attachment',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    renderAndWaitForResponse: ({ args, status, respond }) => {
      if (status === 'executing') {
        return <OpenModal args={args} respond={respond} />;
      }

      return null;
    },
  });
  return null;
};

const OpenModal: FC<{
  respond: (value: any) => void;
  args: {
    list: {
      integrationId: string;
      date: string;
      settings?: Record<string, any>;
      posts: { content: string; attachments: { id: string; path: string }[] }[];
    }[];
  };
}> = ({ args, respond }) => {
  const modals = useModals();
  const { properties } = useContext(PropertiesContext);
  const startModal = useCallback(async () => {
    for (const integration of args.list) {
      await new Promise((res) => {
        const group = makeId(10);
        modals.openModal({
          ...ADD_EDIT_MODAL_OPTIONS,
          title: ``,
          children: (
            <ExistingDataContextProvider
              value={{
                group,
                integration: integration.integrationId,
                integrationPicture:
                  properties.find((p) => p.id === integration.integrationId)
                    ?.picture || '',
                settings: integration.settings || {},
                posts: integration.posts.map((p) => ({
                  approvedSubmitForOrder: 'NO',
                  content: p.content,
                  createdAt: new Date().toISOString(),
                  state: 'DRAFT',
                  id: makeId(10),
                  settings: JSON.stringify(integration.settings || {}),
                  group,
                  integrationId: integration.integrationId,
                  integration: properties.find(
                    (p) => p.id === integration.integrationId
                  ),
                  publishDate: dayjs.utc(integration.date).toISOString(),
                  image: p.attachments.map((a) => ({
                    id: a.id,
                    path: a.path,
                  })),
                })),
              }}
            >
              <AddEditModal
                date={dayjs.utc(integration.date)}
                allIntegrations={properties}
                integrations={properties.filter(
                  (p) => p.id === integration.integrationId
                )}
                onlyValues={integration.posts.map((p) => ({
                  content: p.content,
                  id: makeId(10),
                  settings: integration.settings || {},
                  image: p.attachments.map((a) => ({
                    id: a.id,
                    path: a.path,
                  })),
                }))}
                reopenModal={() => { }}
                mutate={() => res(true)}
              />
            </ExistingDataContextProvider>
          ),
        });
      });
    }

    respond('User scheduled all the posts');
  }, [args, respond, properties]);

  useEffect(() => {
    startModal();
  }, []);
  return (
    <div onClick={() => respond('continue')}>
      Opening manually ${JSON.stringify(args)}
    </div>
  );
};

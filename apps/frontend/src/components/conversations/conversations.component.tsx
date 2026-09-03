'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import {
  ChannelMenu,
  ChannelsSidebar,
} from '@gitroom/frontend/components/launches/channels.sidebar';
import { setLastChannelId } from '@gitroom/frontend/components/launches/helpers/last-channel';
import {
  IntegrationListItem,
  useIntegrationList,
} from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import {
  getConversationProviderRenderer,
  supportsConversationProvider,
} from '@gitroom/frontend/components/conversations/conversation.provider.renderers';
import {
  Conversation,
  useConversationMutations,
  useConversations,
} from '@gitroom/frontend/components/conversations/use.conversations';

const PAGE_SIZE = 20;

const toComposerIntegration = (
  integration: IntegrationListItem
): Integrations => ({
  id: integration.id,
  name: integration.name,
  disabled: integration.disabled,
  inBetweenSteps: integration.inBetweenSteps,
  editor: integration.editor,
  display: integration.display,
  identifier: integration.identifier,
  type: integration.type,
  picture: integration.picture || '',
  changeProfilePicture: integration.changeProfilePicture,
  additionalSettings: integration.additionalSettings || '',
  changeNickName: integration.changeNickName,
  time: integration.time,
  ...(integration.customer ? { customer: integration.customer } : {}),
});

const UnsupportedConversation: FC<{ conversation: Conversation }> = ({
  conversation,
}) => (
  <article className="rounded-[14px] border border-newTableBorder bg-newBgColorInner p-[16px]">
    <p className="text-[14px] text-newTextColor">{conversation.channel.name}</p>
    <p className="mt-[4px] text-[13px] text-newTableText">
      This conversation cannot be displayed yet.
    </p>
  </article>
);

export const ConversationsComponent: FC = () => {
  const t = useT();
  const toaster = useToaster();
  const [integrationId, setIntegrationId] = useState<string>();
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [repostingId, setRepostingId] = useState<string>();
  const [repostedIds, setRepostedIds] = useState<Set<string>>(() => new Set());
  const hydrated = useRef(new Set<string>());
  const cursor = cursorHistory[cursorHistory.length - 1];
  const { data: integrations = [] } = useIntegrationList();
  const conversationIntegrations = useMemo(
    () =>
      integrations.filter((integration) =>
        supportsConversationProvider(integration.identifier)
      ),
    [integrations]
  );
  const composerIntegrations = useMemo(
    () => integrations.map(toComposerIntegration),
    [integrations]
  );
  const integrationById = useMemo(
    () =>
      new Map(
        composerIntegrations.map((integration) => [integration.id, integration])
      ),
    [composerIntegrations]
  );
  const { data, error, isLoading, mutate } = useConversations({
    integrationId: integrationId || undefined,
    cursor,
    limit: PAGE_SIZE,
  });
  const { hydrate, repost } = useConversationMutations();

  useEffect(() => {
    const ids = (data?.items ?? [])
      .filter(
        (conversation) =>
          conversation.snapshotState !== 'complete' &&
          !hydrated.current.has(conversation.id)
      )
      .map((conversation) => conversation.id);
    if (!ids.length) return;
    ids.forEach((id) => hydrated.current.add(id));
    hydrate(ids).catch(() => undefined);
  }, [data?.items, hydrate]);

  const handleChannelSelect = useCallback(
    (integration: IntegrationListItem) => {
      const nextId =
        integrationId === integration.id ? undefined : integration.id;
      if (nextId) {
        setLastChannelId(nextId);
      }
      setIntegrationId(nextId);
      setCursorHistory([]);
    },
    [integrationId]
  );
  const handleNext = useCallback(() => {
    if (data?.nextCursor)
      setCursorHistory((history) => [...history, data.nextCursor!]);
  }, [data?.nextCursor]);
  const handlePrevious = useCallback(() => {
    setCursorHistory((history) => history.slice(0, -1));
  }, []);
  const handleRepost = useCallback(
    async (eventId: string) => {
      setRepostingId(eventId);
      try {
        const result = await repost(eventId);
        if (
          result.status === 'reposted' ||
          result.status === 'already_reposted'
        ) {
          setRepostedIds((current) => new Set(current).add(eventId));
        }
        if (result.status === 'already_reposted') {
          toaster.show(
            t(
              'conversation_repost_already',
              'This post was already reposted from this channel.'
            ),
            'success'
          );
        }
        if (result.status === 'retryable_failure') {
          toaster.show(
            result.reason ||
              t(
                'conversation_repost_failed',
                'We could not repost this conversation right now.'
              ),
            'warning'
          );
        }
        if (result.status === 'auth_error') {
          toaster.show(
            t(
              'conversation_repost_auth_error',
              'Reconnect this channel before reposting.'
            ),
            'warning'
          );
        }
        if (result.status === 'unsupported') {
          toaster.show(
            t(
              'conversation_repost_unsupported',
              'Repost is not available for this conversation.'
            ),
            'warning'
          );
        }
      } catch (error) {
        toaster.show(
          error instanceof Error && error.message
            ? error.message
            : t(
                'conversation_repost_failed',
                'We could not repost this conversation right now.'
              ),
          'warning'
        );
      } finally {
        setRepostingId(undefined);
      }
    },
    [repost, t, toaster]
  );

  if (!conversationIntegrations.length) {
    return (
      <div className="bg-newBgColorInner flex flex-1 flex-col gap-[20px] p-[20px] min-w-0 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-[6px]">
          <h1 className="text-[24px] font-[600] text-newTextColor">
            {t('conversations', 'Conversations')}
          </h1>
          <p className="text-[14px] text-newTableText">
            {t(
              'conversations_description',
              'Stay on top of reactions to your posts.'
            )}
          </p>
        </div>
        <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader p-[28px] text-center">
          <p className="text-[18px] text-newTextColor">
            {t(
              'conversations_no_channels_title',
              'No conversation channels yet'
            )}
          </p>
          <p className="mt-[8px] text-[14px] text-newTableText">
            {t(
              'conversations_no_channels_description',
              'Connect a channel that supports Conversations, such as X, from the calendar.'
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ChannelsSidebar
        integrationCount={conversationIntegrations.length}
        showAddProvider={false}
      >
        {(collapsed) => (
          <ChannelMenu
            collapsed={collapsed}
            integrations={conversationIntegrations}
            selectedIds={integrationId ? [integrationId] : undefined}
            onSelect={handleChannelSelect}
          />
        )}
      </ChannelsSidebar>
      <div className="bg-newBgColorInner flex flex-1 flex-col gap-[20px] p-[20px] min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-[6px]">
          <h1 className="text-[24px] font-[600] text-newTextColor">
            {t('conversations', 'Conversations')}
          </h1>
          <p className="text-[14px] text-newTableText">
            {t(
              'conversations_description',
              'Stay on top of reactions to your posts.'
            )}
          </p>
        </div>

        {error ? (
          <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader p-[24px] text-center">
            <p className="text-[15px] text-newTextColor">
              {t(
                'conversations_load_error',
                'We could not load conversations right now.'
              )}
            </p>
            <Button
              secondary
              className="mx-auto mt-[12px]"
              onClick={() => mutate()}
            >
              {t('followers_retry', 'Retry')}
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <LoadingComponent />
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader p-[28px] text-center text-[14px] text-newTableText">
            {t('conversations_empty', 'No conversations yet.')}
          </div>
        ) : (
          <>
            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-[12px]">
              {data.items.map((conversation) => {
                const Renderer = getConversationProviderRenderer(
                  conversation.provider
                );
                return Renderer ? (
                  <Renderer
                    key={conversation.id}
                    conversation={conversation}
                    integration={integrationById.get(conversation.channel.id)}
                    reposting={repostingId === conversation.id}
                    reposted={repostedIds.has(conversation.id)}
                    onRepost={() => handleRepost(conversation.id)}
                  />
                ) : (
                  <UnsupportedConversation
                    key={conversation.id}
                    conversation={conversation}
                  />
                );
              })}
            </div>
            {(cursorHistory.length > 0 || data.nextCursor) && (
              <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-[12px]">
                <Button
                  secondary
                  disabled={!cursorHistory.length}
                  onClick={handlePrevious}
                >
                  {t('followers_previous_page', 'Previous')}
                </Button>
                <Button
                  secondary
                  disabled={!data.nextCursor}
                  onClick={handleNext}
                >
                  {t('followers_next_page', 'Next')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

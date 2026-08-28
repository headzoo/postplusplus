'use client';

import { ComponentType } from 'react';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { Conversation } from '@gitroom/frontend/components/conversations/use.conversations';
import { XConversationCard } from '@gitroom/frontend/components/conversations/providers/x.conversation.card';

export type ConversationCardProps = {
  conversation: Conversation;
  integration?: Integrations;
  reposting: boolean;
  reposted: boolean;
  onRepost: () => Promise<void>;
};

const conversationProviderRenderers: Record<
  string,
  ComponentType<ConversationCardProps>
> = {
  x: XConversationCard,
};

export const getConversationProviderRenderer = (providerIdentifier: string) =>
  conversationProviderRenderers[providerIdentifier];

export const supportsConversationProvider = (providerIdentifier: string) =>
  providerIdentifier in conversationProviderRenderers;

'use client';

import { FC } from 'react';
import { CopilotPopup } from '@copilotkit/react-ui';
import {
  useCopilotMessagesContext,
  type SuggestionItem,
} from '@copilotkit/react-core';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ResizableCopilotWindow } from './copilot.assistant.popup.window';

type CopilotAssistantPopupProps = {
  instructions: string;
  initialMessage?: string;
  suggestions?: SuggestionItem[];
};

export const CopilotAssistantPopup: FC<CopilotAssistantPopupProps> = (props) => {
  return <CopilotAssistantPopupChat {...props} />;
};

const CopilotAssistantPopupChat: FC<CopilotAssistantPopupProps> = ({
  instructions,
  initialMessage,
  suggestions,
}) => {
  const t = useT();
  const { messages } = useCopilotMessagesContext();
  const conversationStarted = messages.length > 0;
  // Pass [] after chat starts so CopilotKit does not fall back to "auto" suggestions.
  // Omit when there are no static suggestions yet (preserves CopilotKit defaults).
  const suggestionProps =
    conversationStarted && suggestions !== undefined
      ? { suggestions: [] as SuggestionItem[] }
      : suggestions?.length
        ? { suggestions }
        : {};

  return (
    <CopilotPopup
      hitEscapeToClose={false}
      clickOutsideToClose={true}
      instructions={instructions}
      Window={ResizableCopilotWindow}
      {...suggestionProps}
      labels={{
        title: t('your_assistant', 'Your Assistant'),
        initial:
          initialMessage ??
          t(
            'assistant_initial_message',
            'Hi! I can help you to refine your social media posts.'
          ),
      }}
    />
  );
};

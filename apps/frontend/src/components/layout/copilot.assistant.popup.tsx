'use client';

import { FC, ReactNode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CopilotPopup } from '@copilotkit/react-ui';
import type {
  InputProps,
  WindowProps,
} from '@copilotkit/react-ui/dist/components/chat/props';
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
  Input?: React.ComponentType<InputProps>;
  showClearChat?: boolean;
  children?: ReactNode;
};

export const CopilotAssistantPopup: FC<CopilotAssistantPopupProps> = (
  props
) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(<CopilotAssistantPopupChat {...props} />, document.body);
};

const CopilotAssistantPopupChat: FC<CopilotAssistantPopupProps> = ({
  instructions,
  initialMessage,
  suggestions,
  Input,
  showClearChat = false,
  children,
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

  const Window = useMemo(() => {
    if (!showClearChat) {
      return ResizableCopilotWindow;
    }

    const ClearChatWindow: FC<WindowProps> = (windowProps) => (
      <ResizableCopilotWindow {...windowProps} showClearChat />
    );
    ClearChatWindow.displayName = 'ClearChatWindow';
    return ClearChatWindow;
  }, [showClearChat]);

  return (
    <CopilotPopup
      hitEscapeToClose={false}
      clickOutsideToClose={true}
      instructions={instructions}
      Window={Window}
      Input={Input}
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
    >
      {children}
    </CopilotPopup>
  );
};

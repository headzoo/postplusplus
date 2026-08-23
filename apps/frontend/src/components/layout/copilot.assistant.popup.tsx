'use client';

import { FC } from 'react';
import { CopilotPopup } from '@copilotkit/react-ui';
import type { SuggestionItem } from '@copilotkit/react-core';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

type CopilotAssistantPopupProps = {
  instructions: string;
  initialMessage?: string;
  suggestions?: SuggestionItem[];
};

export const CopilotAssistantPopup: FC<CopilotAssistantPopupProps> = ({
  instructions,
  initialMessage,
  suggestions,
}) => {
  const t = useT();

  return (
    <CopilotPopup
      hitEscapeToClose={false}
      clickOutsideToClose={true}
      instructions={instructions}
      {...(suggestions?.length ? { suggestions } : {})}
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

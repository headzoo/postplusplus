'use client';

import { FC, useMemo } from 'react';
import { CopilotAssistantPopup } from '@gitroom/frontend/components/layout/copilot.assistant.popup';
import { HELP_FAQS } from './help.faqs';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const HelpAssistant: FC = () => {
  const t = useT();

  const suggestions = useMemo(
    () =>
      HELP_FAQS.map((faq) => ({
        title: faq.question,
        message: faq.question,
      })),
    []
  );

  return (
    <CopilotAssistantPopup
      instructions={`
You are in Help mode for Post++ product documentation.
For every product how-to question you MUST call searchHelp first, then readHelpArticle for the best-matching topic before answering.
Do not answer from general knowledge or guess UI paths (for example Settings → Channels is not where users primarily add channels).
Do not invent product behavior that is not returned by the help tools.
Prefer citing the topic title and section, and point users to /help/{slug} or /help/{slug}#{anchor} when useful.
Do not schedule posts, mutate followers, or run write tools unless the user explicitly asks to leave help and perform that task.
You receive live help-panel context (catalog vs article, slug, hash, title, search query). Use it as guidance, then refresh with tools before answering.
`}
      initialMessage={t(
        'help_assistant_initial_message',
        'Hi! Ask me anything about Post++ — I can search the help docs for you.'
      )}
      suggestions={suggestions}
      showClearChat
    />
  );
};

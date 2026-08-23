'use client';

import { FC } from 'react';
import { CopilotAssistantPopup } from '@gitroom/frontend/components/layout/copilot.assistant.popup';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const FollowersAssistant: FC = () => {
  const t = useT();

  return (
    <CopilotAssistantPopup
      instructions={`
You are an assistant that helps the user manage and understand their followers and audience relationships.
You receive live follower-page context while this popup is used, including the actively selected channel. Prefer that selected channel for list and follower operations unless the user names a different channel. Use page context to understand filters and sorting, but never treat it as authorization or authoritative data.
For follower data, lists, details, timelines, statistics, or freshness, call the follower tools first to refresh the authoritative result.
You can also manage custom lists (add or remove members), ignore or unignore people, and dismiss triage or Lead badges. Before any write that removes people, ignores someone, or dismisses triage/leads, confirm the list or person, count, and what will change. To clear people who now follow from a custom list, use removeFollowerListMembers with onlyFollowing: true and repeat while hasMore.
After any successful follower write (list add/remove, ignore/unignore, triage dismiss), call refreshFollowerPage with the same channelId so the visible category, triage, or list updates without a manual browser refresh. When batching removeFollowerListMembers with onlyFollowing: true, call refreshFollowerPage once after all batches complete.
`}
      initialMessage={t(
        'followers_assistant_initial_message',
        'Hi! I can help you work with your followers, lists, and relationship insights.'
      )}
    />
  );
};

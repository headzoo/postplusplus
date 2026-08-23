'use client';

import { FC } from 'react';
import { useCopilotAction, useCopilotContext } from '@copilotkit/react-core';
import { useSWRConfig } from 'swr';
import { revalidateFollowerChannelCaches } from '@gitroom/frontend/components/followers/use.followers';
import type { FollowerPageContext } from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';

const resolveChannelId = (
  channelId: string | undefined,
  followerPage: unknown
) => {
  if (channelId?.trim()) {
    return channelId.trim();
  }
  const page = followerPage as FollowerPageContext | null | undefined;
  const fromContext = page?.channel?.id;
  return typeof fromContext === 'string' && fromContext.trim()
    ? fromContext.trim()
    : undefined;
};

/**
 * Frontend CopilotAction that revalidates follower SWR caches so the visible
 * category/triage/list UI updates after Mastra follower write tools succeed.
 */
export const useCopilotFollowerRefresh = () => {
  const { mutate: mutateCache } = useSWRConfig();
  const { copilotApiConfig } = useCopilotContext();

  useCopilotAction({
    name: 'refreshFollowerPage',
    description:
      'Revalidate the in-app followers UI for a channel after follower writes (list add/remove, ignore/unignore, triage dismiss). Call once with channelId after writes complete so the visible category, triage, or custom list updates without a manual browser refresh.',
    parameters: [
      {
        name: 'channelId',
        type: 'string',
        description:
          'Follower channel id whose visible list/category/triage should refresh. Prefer the actively selected channel id from follower-page context.',
        required: true,
      },
    ],
    handler: async ({ channelId }) => {
      const resolved = resolveChannelId(
        channelId,
        copilotApiConfig.properties?.followerPage
      );
      if (!resolved) {
        throw new Error('channelId is required to refresh the followers UI');
      }
      await revalidateFollowerChannelCaches(mutateCache, resolved);
      return { ok: true as const, channelId: resolved };
    },
  });
};

export const FollowersCopilotActions: FC = () => {
  useCopilotFollowerRefresh();
  return null;
};

'use client';

import { useEffect } from 'react';
import { useCopilotContext } from '@copilotkit/react-core';
import type { FollowerPageContext } from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';

/**
 * Syncs the active followers page envelope into CopilotKit request properties so
 * Mastra agent instructions receive followerPage via variables.properties.
 * useCopilotReadable alone is not enough for server-side requestContext.
 */
export const useCopilotFollowerPageProperties = (
  followerPage: FollowerPageContext | null | undefined
) => {
  const { copilotApiConfig } = useCopilotContext();

  useEffect(() => {
    if (!copilotApiConfig.properties) {
      copilotApiConfig.properties = {};
    }

    if (followerPage?.channel?.id) {
      copilotApiConfig.properties.followerPage = followerPage;
    } else {
      delete copilotApiConfig.properties.followerPage;
    }

    return () => {
      if (copilotApiConfig.properties) {
        delete copilotApiConfig.properties.followerPage;
      }
    };
  }, [copilotApiConfig, followerPage]);
};

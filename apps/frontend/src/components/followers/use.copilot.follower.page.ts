'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useCopilotContext } from '@copilotkit/react-core';
import type { FollowerPageContext } from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';

let activeFollowerPage: FollowerPageContext | null = null;
const activeFollowerPageListeners = new Set<() => void>();

const publishActiveFollowerPage = (page: FollowerPageContext | null) => {
  activeFollowerPage = page;
  activeFollowerPageListeners.forEach((listener) => listener());
};

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

    const page = followerPage?.channel?.id ? followerPage : null;
    if (page) {
      copilotApiConfig.properties.followerPage = page;
    } else {
      delete copilotApiConfig.properties.followerPage;
    }
    publishActiveFollowerPage(page);

    return () => {
      if (copilotApiConfig.properties) {
        delete copilotApiConfig.properties.followerPage;
      }
      // Another followers view may already have taken over the active page.
      if (activeFollowerPage === page) {
        publishActiveFollowerPage(null);
      }
    };
  }, [copilotApiConfig, followerPage]);
};

/**
 * Reads the follower page envelope published by the currently mounted followers
 * view, for sibling components (such as the assistant) rendered outside it.
 */
export const useActiveFollowerPage = () => {
  const subscribe = useCallback((listener: () => void) => {
    activeFollowerPageListeners.add(listener);
    return () => {
      activeFollowerPageListeners.delete(listener);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => activeFollowerPage,
    () => null
  );
};

'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useCopilotContext } from '@copilotkit/react-core';
import type { HelpPageContext } from '@gitroom/nestjs-libraries/help/help.types';

let helpPanelOpen = false;
const helpPanelOpenListeners = new Set<() => void>();

let activeHelpPage: HelpPageContext | null = null;
const activeHelpPageListeners = new Set<() => void>();

const publishHelpPanelOpen = (open: boolean) => {
  helpPanelOpen = open;
  helpPanelOpenListeners.forEach((listener) => listener());
};

const publishActiveHelpPage = (page: HelpPageContext | null) => {
  activeHelpPage = page;
  activeHelpPageListeners.forEach((listener) => listener());
};

/**
 * Publishes whether the product Help drawer is open so page-local assistants
 * can hide while Help mode owns the floating Copilot popup.
 */
export const usePublishHelpPanelOpen = (open: boolean) => {
  useEffect(() => {
    publishHelpPanelOpen(open);
    return () => {
      if (helpPanelOpen === open) {
        publishHelpPanelOpen(false);
      }
    };
  }, [open]);
};

export const useHelpPanelOpen = () => {
  const subscribe = useCallback((listener: () => void) => {
    helpPanelOpenListeners.add(listener);
    return () => {
      helpPanelOpenListeners.delete(listener);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => helpPanelOpen,
    () => false
  );
};

/**
 * Syncs the active help-panel envelope into CopilotKit request properties so
 * Mastra agent instructions receive helpPage via variables.properties.
 */
export const useCopilotHelpPageProperties = (
  helpPage: HelpPageContext | null | undefined
) => {
  const { copilotApiConfig } = useCopilotContext();

  useEffect(() => {
    if (!copilotApiConfig.properties) {
      copilotApiConfig.properties = {};
    }

    const page = helpPage?.open ? helpPage : null;
    if (page) {
      copilotApiConfig.properties.helpPage = page;
    } else {
      delete copilotApiConfig.properties.helpPage;
    }
    publishActiveHelpPage(page);

    return () => {
      if (copilotApiConfig.properties) {
        delete copilotApiConfig.properties.helpPage;
      }
      if (activeHelpPage === page) {
        publishActiveHelpPage(null);
      }
    };
  }, [copilotApiConfig, helpPage]);
};

export const useActiveHelpPage = () => {
  const subscribe = useCallback((listener: () => void) => {
    activeHelpPageListeners.add(listener);
    return () => {
      activeHelpPageListeners.delete(listener);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => activeHelpPage,
    () => null
  );
};

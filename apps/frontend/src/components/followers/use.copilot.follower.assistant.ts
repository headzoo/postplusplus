'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type FollowerCopilotLaunchRequest = {
  draftMessage: string;
  token: number;
};

let launchRequest: FollowerCopilotLaunchRequest | null = null;
const launchRequestListeners = new Set<() => void>();

const publishLaunchRequest = (request: FollowerCopilotLaunchRequest) => {
  launchRequest = request;
  launchRequestListeners.forEach((listener) => listener());
};

export const launchFollowerCopilotChat = (username: string) => {
  const normalized = username.trim().replace(/^@+/, '');
  if (!normalized) {
    return;
  }

  publishLaunchRequest({
    draftMessage: `@${normalized} `,
    token: Date.now(),
  });
};

export const resetFollowerCopilotLaunchRequest = () => {
  launchRequest = null;
  launchRequestListeners.forEach((listener) => listener());
};

export const useFollowerCopilotLaunchRequest = () => {
  const subscribe = useCallback((listener: () => void) => {
    launchRequestListeners.add(listener);
    return () => {
      launchRequestListeners.delete(listener);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => launchRequest,
    () => null
  );
};

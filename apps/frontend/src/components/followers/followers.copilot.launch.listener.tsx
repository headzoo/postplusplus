'use client';

import { FC, useEffect, useRef } from 'react';
import { useChatContext } from '@copilotkit/react-ui';
import { useCopilotMessagesContext } from '@copilotkit/react-core';
import { useFollowerCopilotLaunchRequest } from '@gitroom/frontend/components/followers/use.copilot.follower.assistant';

export const FollowersCopilotLaunchListener: FC = () => {
  const { setOpen } = useChatContext();
  const { setMessages } = useCopilotMessagesContext();
  const launchRequest = useFollowerCopilotLaunchRequest();
  const lastLaunchTokenRef = useRef(0);

  useEffect(() => {
    if (!launchRequest || launchRequest.token === lastLaunchTokenRef.current) {
      return;
    }

    lastLaunchTokenRef.current = launchRequest.token;
    setMessages([]);
    setOpen(true);
  }, [launchRequest, setMessages, setOpen]);

  return null;
};

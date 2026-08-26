/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { render } from '@testing-library/react';
import { FollowersCopilotLaunchListener } from './followers.copilot.launch.listener';

const setOpen = jest.fn();
const setMessages = jest.fn();
let launchRequest: { draftMessage: string; token: number } | null = null;

jest.mock('@copilotkit/react-ui', () => ({
  useChatContext: () => ({ open: false, setOpen }),
}));

jest.mock('@copilotkit/react-core', () => ({
  useCopilotMessagesContext: () => ({ messages: [], setMessages }),
}));

jest.mock('./use.copilot.follower.assistant', () => ({
  useFollowerCopilotLaunchRequest: () => launchRequest,
}));

describe('FollowersCopilotLaunchListener', () => {
  beforeEach(() => {
    launchRequest = null;
    setOpen.mockReset();
    setMessages.mockReset();
  });

  it('opens a fresh chat when a follower launch request is published', () => {
    launchRequest = { draftMessage: '@alex ', token: 123 };

    render(<FollowersCopilotLaunchListener />);

    expect(setMessages).toHaveBeenCalledWith([]);
    expect(setOpen).toHaveBeenCalledWith(true);
  });

  it('does nothing without a launch request', () => {
    render(<FollowersCopilotLaunchListener />);

    expect(setMessages).not.toHaveBeenCalled();
    expect(setOpen).not.toHaveBeenCalled();
  });
});

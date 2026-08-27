/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { FollowersCopilotInput } from './followers.copilot.input';
import {
  launchFollowerCopilotChat,
  resetFollowerCopilotLaunchRequest,
} from './use.copilot.follower.assistant';

const setOpen = jest.fn();
const setMessages = jest.fn();
const onSend = jest.fn();

jest.mock('@copilotkit/react-core', () => ({
  useCopilotContext: () => ({ copilotApiConfig: {} }),
  useCopilotMessagesContext: () => ({ messages: [], setMessages }),
}));

jest.mock('@copilotkit/react-ui', () => ({
  useChatContext: () => ({
    labels: { placeholder: 'Message' },
    icons: { sendIcon: 'Send', stopIcon: 'Stop', uploadIcon: 'Upload' },
    open: false,
    setOpen,
  }),
}));

describe('FollowersCopilotInput', () => {
  beforeEach(() => {
    resetFollowerCopilotLaunchRequest();
    setOpen.mockReset();
    setMessages.mockReset();
    onSend.mockReset();
  });

  it('opens a fresh chat and prefills the draft from a launch request', () => {
    render(<FollowersCopilotInput inProgress={false} onSend={onSend} />);

    act(() => {
      launchFollowerCopilotChat('alex');
    });

    expect(setMessages).toHaveBeenCalledWith([]);
    expect(setOpen).toHaveBeenCalledWith(true);
    const textarea = screen.getByPlaceholderText(
      'Message'
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('@alex ');
  });
});

/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { act, render } from '@testing-library/react';
import {
  launchFollowerCopilotChat,
  resetFollowerCopilotLaunchRequest,
  useFollowerCopilotLaunchRequest,
} from './use.copilot.follower.assistant';

const Probe: React.FC = () => {
  const request = useFollowerCopilotLaunchRequest();
  return <div data-testid="draft">{request?.draftMessage ?? ''}</div>;
};

describe('use.copilot.follower.assistant', () => {
  beforeEach(() => {
    resetFollowerCopilotLaunchRequest();
  });

  it('publishes a draft message with @username and trailing space', () => {
    const { getByTestId } = render(<Probe />);

    act(() => {
      launchFollowerCopilotChat('alex');
    });

    expect(getByTestId('draft').textContent).toBe('@alex ');
  });

  it('strips leading @ from usernames', () => {
    const { getByTestId } = render(<Probe />);

    act(() => {
      launchFollowerCopilotChat('@alex');
    });

    expect(getByTestId('draft').textContent).toBe('@alex ');
  });

  it('ignores empty usernames', () => {
    const { getByTestId } = render(<Probe />);

    act(() => {
      launchFollowerCopilotChat('   ');
    });

    expect(getByTestId('draft').textContent).toBe('');
  });

  it('updates the draft when launched again', () => {
    const { getByTestId } = render(<Probe />);

    act(() => {
      launchFollowerCopilotChat('alex');
    });
    act(() => {
      launchFollowerCopilotChat('jamie');
    });

    expect(getByTestId('draft').textContent).toBe('@jamie ');
  });
});

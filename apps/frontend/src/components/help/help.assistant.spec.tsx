/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { HelpAssistant } from './help.assistant';

jest.mock('@copilotkit/react-core', () => ({
  useCopilotMessagesContext: () => ({ messages: [] }),
}));

jest.mock('@copilotkit/react-ui', () => ({
  CopilotPopup: (props: any) => (
    <div data-testid="help-copilot-popup">{props.instructions}</div>
  ),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

jest.mock(
  '@gitroom/frontend/components/layout/copilot.assistant.popup',
  () => ({
    CopilotAssistantPopup: ({
      instructions,
      initialMessage,
    }: {
      instructions: string;
      initialMessage?: string;
    }) => (
      <div data-testid="help-assistant">
        <div data-testid="help-instructions">{instructions}</div>
        <div data-testid="help-initial">{initialMessage}</div>
      </div>
    ),
  })
);

describe('HelpAssistant', () => {
  it('renders help-mode instructions', () => {
    render(<HelpAssistant />);

    expect(screen.getByTestId('help-assistant')).toBeTruthy();
    expect(screen.getByTestId('help-instructions').textContent).toContain(
      'Help mode'
    );
    expect(screen.getByTestId('help-instructions').textContent).toContain(
      'searchHelp'
    );
    expect(screen.getByTestId('help-instructions').textContent).toContain(
      'MUST call searchHelp'
    );
    expect(screen.getByTestId('help-initial').textContent).toContain(
      'Ask me anything about Post++'
    );
  });
});

/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CopilotAssistantPopup } from './copilot.assistant.popup';
import {
  COPILOT_POPUP_SIZE_KEY,
  getDefaultCopilotPopupSize,
} from './copilot.assistant.popup.size';
import { ResizableCopilotWindow } from './copilot.assistant.popup.window';

let popupProps: any;
let messages: Array<{ id: string }> = [];
let chatOpen = true;
let setOpen = jest.fn();

jest.mock('@copilotkit/react-core', () => ({
  useCopilotMessagesContext: () => ({ messages }),
}));

jest.mock('@copilotkit/react-ui', () => ({
  CopilotPopup: (props: any) => {
    popupProps = props;
    return <div data-testid="copilot-popup" />;
  },
  useChatContext: () => ({ open: chatOpen, setOpen }),
}));

jest.mock('@copilotkit/shared', () => ({
  isMacOS: () => false,
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

describe('CopilotAssistantPopup', () => {
  beforeEach(() => {
    popupProps = undefined;
    messages = [];
  });

  it('passes suggestions when the conversation is empty', () => {
    render(
      <CopilotAssistantPopup
        instructions="help"
        suggestions={[
          {
            title: 'Who should I engage with?',
            message: 'Who should I engage with?',
          },
        ]}
      />
    );

    expect(popupProps.suggestions).toEqual([
      {
        title: 'Who should I engage with?',
        message: 'Who should I engage with?',
      },
    ]);
    expect(popupProps.Window).toBe(ResizableCopilotWindow);
  });

  it('clears suggestions once the conversation has messages', () => {
    messages = [{ id: 'm1' }];

    render(
      <CopilotAssistantPopup
        instructions="help"
        suggestions={[
          {
            title: 'Who should I engage with?',
            message: 'Who should I engage with?',
          },
        ]}
      />
    );

    expect(popupProps.suggestions).toEqual([]);
  });

  it('forwards a custom Input component when provided', () => {
    const CustomInput = () => <div data-testid="custom-input" />;

    render(<CopilotAssistantPopup instructions="help" Input={CustomInput} />);

    expect(popupProps.Input).toBe(CustomInput);
  });
});

describe('ResizableCopilotWindow', () => {
  beforeEach(() => {
    localStorage.clear();
    chatOpen = true;
    setOpen = jest.fn();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('639') ? false : false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    });
  });

  it('applies stored size and resizes from the corner handle', () => {
    localStorage.setItem(
      COPILOT_POPUP_SIZE_KEY,
      JSON.stringify({ width: 400, height: 500 })
    );

    const { container } = render(
      <ResizableCopilotWindow
        clickOutsideToClose={false}
        hitEscapeToClose={false}
        shortcut="/"
      >
        <div>content</div>
      </ResizableCopilotWindow>
    );

    const windowEl = container.querySelector(
      '.copilotKitWindow'
    ) as HTMLElement;
    expect(windowEl.style.width).toBe('400px');
    expect(windowEl.style.height).toBe('500px');

    const handle = screen.getByRole('separator', {
      name: 'Resize assistant panel',
    });
    fireEvent.mouseDown(handle, { button: 0, clientX: 500, clientY: 200 });
    fireEvent.mouseMove(document, { clientX: 450, clientY: 150 });
    fireEvent.mouseUp(document, { clientX: 450, clientY: 150 });

    expect(windowEl.style.width).toBe('450px');
    expect(windowEl.style.height).toBe('550px');
    expect(localStorage.getItem(COPILOT_POPUP_SIZE_KEY)).toBe(
      JSON.stringify({ width: 450, height: 550 })
    );
  });

  it('uses default size when nothing is stored', () => {
    const defaults = getDefaultCopilotPopupSize();
    const { container } = render(
      <ResizableCopilotWindow
        clickOutsideToClose={false}
        hitEscapeToClose={false}
        shortcut="/"
      >
        <div>content</div>
      </ResizableCopilotWindow>
    );

    const windowEl = container.querySelector(
      '.copilotKitWindow'
    ) as HTMLElement;
    expect(windowEl.style.width).toBe(`${defaults.width}px`);
    expect(windowEl.style.height).toBe(`${defaults.height}px`);
  });
});

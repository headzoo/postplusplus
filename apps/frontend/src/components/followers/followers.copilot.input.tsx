'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useChatContext, type InputProps } from '@copilotkit/react-ui';
import {
  useCopilotContext,
  useCopilotMessagesContext,
} from '@copilotkit/react-core';
import AutoResizingTextarea from '@gitroom/frontend/components/agents/agent.textarea';
import { useFollowerCopilotLaunchRequest } from '@gitroom/frontend/components/followers/use.copilot.follower.assistant';

const MAX_NEWLINES = 6;

const FollowersCopilotInputInner: React.FC<
  InputProps & { initialText?: string }
> = ({
  inProgress,
  onSend,
  onStop,
  onUpload,
  hideStopButton = false,
  initialText = '',
}) => {
  const context = useChatContext();
  const copilotContext = useCopilotContext();
  const showPoweredBy = !copilotContext.copilotApiConfig?.publicApiKey;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (!initialText) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      const end = initialText.length;
      textarea.setSelectionRange(end, end);
    });

    return () => cancelAnimationFrame(frame);
  }, [initialText]);

  const handleDivClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;
    if (target.tagName === 'TEXTAREA') return;
    textareaRef.current?.focus();
  };

  const send = () => {
    if (inProgress) return;
    onSend(text);
    setText('');
    textareaRef.current?.focus();
  };

  const isInProgress = inProgress;
  const buttonIcon =
    isInProgress && !hideStopButton
      ? context.icons.stopIcon
      : context.icons.sendIcon;

  const canSend = useMemo(() => {
    const interruptEvent = copilotContext.langGraphInterruptAction?.event;
    const interruptInProgress =
      interruptEvent?.name === 'LangGraphInterruptEvent' &&
      !interruptEvent?.response;

    return !isInProgress && text.trim().length > 0 && !interruptInProgress;
  }, [copilotContext.langGraphInterruptAction?.event, isInProgress, text]);

  const canStop = useMemo(() => {
    return isInProgress && !hideStopButton;
  }, [isInProgress, hideStopButton]);

  const sendDisabled = !canSend && !canStop;

  return (
    <div
      className={`copilotKitInputContainer ${
        showPoweredBy ? 'poweredByContainer' : ''
      }`}
    >
      <div className="copilotKitInput" onClick={handleDivClick}>
        <AutoResizingTextarea
          ref={textareaRef}
          placeholder={context.labels.placeholder}
          autoFocus={false}
          maxRows={MAX_NEWLINES}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
              event.preventDefault();
              if (canSend) {
                send();
              }
            }
          }}
        />
        <div className="copilotKitInputControls">
          {onUpload && (
            <button onClick={onUpload} className="copilotKitInputControlButton">
              {context.icons.uploadIcon}
            </button>
          )}

          <div style={{ flexGrow: 1 }} />

          <button
            disabled={sendDisabled}
            onClick={isInProgress && !hideStopButton ? onStop : send}
            data-copilotkit-in-progress={inProgress}
            data-test-id={
              inProgress
                ? 'copilot-chat-request-in-progress'
                : 'copilot-chat-ready'
            }
            className="copilotKitInputControlButton"
          >
            {buttonIcon}
          </button>
        </div>
      </div>
    </div>
  );
};

export const FollowersCopilotInput: React.FC<InputProps> = (props) => {
  const { setOpen } = useChatContext();
  const { setMessages } = useCopilotMessagesContext();
  const launchRequest = useFollowerCopilotLaunchRequest();
  const [draft, setDraft] = useState<{ text: string; token: number } | null>(
    null
  );
  const lastTokenRef = useRef(0);

  useEffect(() => {
    if (!launchRequest || launchRequest.token === lastTokenRef.current) {
      return;
    }

    lastTokenRef.current = launchRequest.token;
    setMessages([]);
    setOpen(true);
    setDraft({
      text: launchRequest.draftMessage,
      token: launchRequest.token,
    });
  }, [launchRequest, setMessages, setOpen]);

  if (!draft) {
    return <FollowersCopilotInputInner {...props} />;
  }

  return (
    <FollowersCopilotInputInner
      key={draft.token}
      {...props}
      initialText={draft.text}
    />
  );
};

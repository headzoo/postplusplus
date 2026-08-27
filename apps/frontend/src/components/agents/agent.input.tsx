import React, {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useCopilotContext } from '@copilotkit/react-core';
import AutoResizingTextarea from '@gitroom/frontend/components/agents/agent.textarea';
import { useChatContext } from '@copilotkit/react-ui';
import { InputProps } from '@copilotkit/react-ui/dist/components/chat/props';
import { useAgentSkills } from '@gitroom/frontend/components/agents/use.agent.skills';
import { AgentSkillMetadata } from '@gitroom/frontend/components/context-documents/context-document.types';
import { MediaPortal } from '@gitroom/frontend/components/agents/agent';
import { PlusIcon } from '@gitroom/frontend/components/ui/icons';
import { useClickAway } from '@uidotdev/usehooks';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import clsx from 'clsx';

const MAX_NEWLINES = 6;
const MAX_UPLOAD_SIZE = 1024 * 1024 * 1024; // 1 GB

const getSlashQuery = (
  text: string,
  skills: AgentSkillMetadata[]
): string | undefined => {
  if (!text.startsWith('/')) {
    return undefined;
  }

  const tokenMatch = text.match(/^\/[^\s]*/);
  if (!tokenMatch) {
    return undefined;
  }

  const firstToken = tokenMatch[0];
  const afterToken = text.slice(firstToken.length);

  if (afterToken.length > 0 && /^\s/.test(afterToken)) {
    return undefined;
  }

  const isCompletedCommand = skills.some(
    (skill) => skill.command.toLowerCase() === firstToken.toLowerCase()
  );
  if (isCompletedCommand) {
    return undefined;
  }

  return firstToken.slice(1).toLowerCase();
};

export const Input = ({
  inProgress,
  onSend,
  isVisible = false,
  onStop,
  onUpload,
  hideStopButton = false,
  onChange,
  media,
  onMediaChange,
}: InputProps & {
  onChange: (value: string) => void;
  media?: { path: string; id: string }[];
  onMediaChange?: (media: { path: string; id: string }[]) => void;
}) => {
  const context = useChatContext();
  const copilotContext = useCopilotContext();
  const showPoweredBy = !copilotContext.copilotApiConfig?.publicApiKey;
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachTriggerRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const attachMenuRef = useClickAway<HTMLDivElement>(() =>
    setAttachMenuOpen(false)
  );
  const {
    data: skills = [],
    error: skillsError,
    isLoading: skillsLoading,
  } = useAgentSkills();

  useEffect(() => {
    if (!attachMenuOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAttachMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [attachMenuOpen]);

  const handleDivClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    // If the user clicked a button or inside a button, don't focus the textarea
    if (target.closest('button')) return;

    // If the user clicked the textarea, do nothing (it's already focused)
    if (target.tagName === 'TEXTAREA') return;

    // Otherwise, focus the textarea
    textareaRef.current?.focus();
  };

  const [text, setText] = useState('');
  const slashQuery = getSlashQuery(text, skills);
  const suggestions = useMemo(() => {
    if (slashQuery === undefined) {
      return [];
    }

    return skills.filter((skill) =>
      skill.command.slice(1).toLowerCase().startsWith(slashQuery)
    );
  }, [skills, slashQuery]);
  const showSuggestions = suggestionsOpen && slashQuery !== undefined;

  const updateText = (value: string) => {
    setText(value);
    onChange(value);
  };

  const selectSuggestion = (command: string) => {
    const remainingText = text.replace(/^\/[^\s]*/, '').trimStart();
    const value = remainingText ? `${command} ${remainingText}` : `${command} `;
    updateText(value);
    setSuggestionsOpen(false);
    setActiveSuggestion(0);
    textareaRef.current?.focus();
  };

  const send = () => {
    if (inProgress) return;
    onSend(text);
    updateText('');
    setSuggestionsOpen(false);

    textareaRef.current?.focus();
  };

  const selectFromMedia = useCallback(() => {
    setAttachMenuOpen(false);
    attachTriggerRef.current?.();
  }, []);

  const uploadFromComputer = useCallback(() => {
    setAttachMenuOpen(false);
    fileInputRef.current?.click();
  }, []);

  const handleFilesSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = '';

      if (!files.length || !onMediaChange) {
        return;
      }

      const totalSize = files.reduce((acc, file) => acc + file.size, 0);
      if (totalSize > MAX_UPLOAD_SIZE) {
        toaster.show(
          t(
            'upload_size_limit_exceeded',
            'Upload size limit exceeded. Maximum 1 GB per upload session.'
          ),
          'warning'
        );
        return;
      }

      setIsUploading(true);
      try {
        const uploaded: { id: string; path: string }[] = [];
        for (const file of files) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('preventSave', 'true');
          const response = await fetch('/media/upload-simple', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('upload failed');
          }

          const data = await response.json();
          if (!data?.path) {
            throw new Error('upload failed');
          }

          uploaded.push({ id: makeId(10), path: data.path });
        }

        onMediaChange([...(media || []), ...uploaded]);
      } catch {
        toaster.show(
          t(
            'agent_attach_upload_error',
            'Failed to upload file. Please try again.'
          ),
          'warning'
        );
      } finally {
        setIsUploading(false);
      }
    },
    [fetch, media, onMediaChange, t, toaster]
  );

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
      <div className="copilotKitInput relative" onClick={handleDivClick}>
        {showSuggestions && (
          <div
            id="agent-skill-suggestions"
            role="listbox"
            aria-label="Agent skills"
            className="absolute bottom-full left-0 right-0 mb-[8px] max-h-[240px] overflow-y-auto rounded-[8px] border border-newBorder bg-newBgColorInner p-[6px] shadow-lg z-10"
            data-testid="agent-skill-suggestions"
          >
            {skillsLoading && !skills.length && (
              <div className="px-[10px] py-[8px] text-[13px] text-textColor opacity-70">
                Loading skills…
              </div>
            )}
            {skillsError && (
              <div className="px-[10px] py-[8px] text-[13px] text-amber-500">
                Skills are unavailable. You can still enter a command manually.
              </div>
            )}
            {!skillsLoading && !skillsError && !suggestions.length && (
              <div className="px-[10px] py-[8px] text-[13px] text-textColor opacity-70">
                No matching skills.
              </div>
            )}
            {suggestions.map((skill, index) => {
              const optionId = `agent-skill-option-${skill.slug}`;
              return (
                <button
                  key={skill.id}
                  id={optionId}
                  type="button"
                  role="option"
                  aria-selected={activeSuggestion === index}
                  data-testid={`agent-skill-option-${skill.slug}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectSuggestion(skill.command);
                  }}
                  className={`w-full rounded-[6px] px-[10px] py-[8px] text-left text-[13px] text-textColor hover:bg-newBgColor ${
                    activeSuggestion === index ? 'bg-newBgColor' : ''
                  }`}
                >
                  <div className="font-[600]">{skill.command}</div>
                  <div className="opacity-70">{skill.name}</div>
                  {skill.isLarge && (
                    <div className="text-amber-500">Large skill file</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {onMediaChange && (
          <MediaPortal
            value={text}
            media={media || []}
            setMedia={(event) => onMediaChange(event.target.value || [])}
            hideToolbar
            attachTriggerRef={attachTriggerRef}
          />
        )}
        <AutoResizingTextarea
          ref={textareaRef}
          placeholder={context.labels.placeholder}
          autoFocus={false}
          maxRows={MAX_NEWLINES}
          value={text}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={
            showSuggestions ? 'agent-skill-suggestions' : undefined
          }
          aria-expanded={showSuggestions}
          aria-activedescendant={
            showSuggestions && suggestions[activeSuggestion]
              ? `agent-skill-option-${suggestions[activeSuggestion].slug}`
              : undefined
          }
          onChange={(event) => {
            updateText(event.target.value);
            setSuggestionsOpen(true);
            setActiveSuggestion(0);
          }}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={(event) => {
            if (isComposing || event.nativeEvent.isComposing) {
              return;
            }

            if (showSuggestions && suggestions.length) {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveSuggestion((current) =>
                  Math.min(current + 1, suggestions.length - 1)
                );
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveSuggestion((current) => Math.max(current - 1, 0));
                return;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                selectSuggestion(suggestions[activeSuggestion].command);
                return;
              }
            }

            if (event.key === 'Escape' && showSuggestions) {
              event.preventDefault();
              setSuggestionsOpen(false);
              return;
            }

            if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
              event.preventDefault();
              if (canSend) {
                send();
              }
            }
          }}
        />
        <div className="copilotKitInputControls">
          {onMediaChange && (
            <div className="relative" ref={attachMenuRef}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4"
                multiple
                className="hidden"
                data-testid="agent-attach-file-input"
                onChange={handleFilesSelected}
              />
              <button
                type="button"
                aria-label="Insert media"
                aria-expanded={attachMenuOpen}
                aria-haspopup="menu"
                data-testid="agent-attach-media"
                disabled={isUploading}
                onClick={() => setAttachMenuOpen((current) => !current)}
                className="copilotKitInputControlButton"
              >
                {isUploading ? (
                  <div
                    className="animate-spin h-[16px] w-[16px] border-2 border-current border-t-transparent rounded-full"
                    aria-hidden="true"
                  />
                ) : (
                  <PlusIcon />
                )}
              </button>
              <div
                role="menu"
                aria-label={t('attach_media', 'Attach media')}
                data-testid="agent-attach-menu"
                className={clsx(
                  'absolute bottom-full start-0 mb-[8px] min-w-[200px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[6px] shadow-lg z-10',
                  attachMenuOpen ? 'flex flex-col' : 'hidden'
                )}
              >
                <button
                  type="button"
                  role="menuitem"
                  data-testid="agent-attach-upload"
                  disabled={isUploading}
                  onClick={uploadFromComputer}
                  className="w-full rounded-[6px] px-[10px] py-[8px] text-left text-[13px] text-textColor hover:bg-newBgColor disabled:opacity-60"
                >
                  {t('upload_from_computer', 'Upload from computer')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="agent-attach-select-media"
                  disabled={isUploading}
                  onClick={selectFromMedia}
                  className="w-full rounded-[6px] px-[10px] py-[8px] text-left text-[13px] text-textColor hover:bg-newBgColor disabled:opacity-60"
                >
                  {t('select_from_media', 'Select from media')}
                </button>
              </div>
            </div>
          )}
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

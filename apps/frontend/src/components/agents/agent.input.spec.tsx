/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Input } from './agent.input';

const useAgentSkills = jest.fn();
const openMediaLibrary = jest.fn();
const fetchMock = jest.fn();
const toasterShow = jest.fn();

jest.mock('@copilotkit/react-core', () => ({
  useCopilotContext: () => ({ copilotApiConfig: {} }),
  useCopilotReadable: jest.fn(),
}));
jest.mock('@copilotkit/react-ui', () => ({
  useChatContext: () => ({
    labels: { placeholder: 'Message' },
    icons: { sendIcon: 'Send', stopIcon: 'Stop', uploadIcon: 'Upload' },
  }),
}));
jest.mock('./use.agent.skills', () => ({
  useAgentSkills: () => useAgentSkills(),
}));
jest.mock('@gitroom/frontend/components/agents/agent', () => ({
  MediaPortal: ({ attachTriggerRef }: any) => {
    React.useEffect(() => {
      if (!attachTriggerRef) {
        return;
      }
      attachTriggerRef.current = openMediaLibrary;
      return () => {
        attachTriggerRef.current = null;
      };
    }, [attachTriggerRef]);
    return null;
  },
}));
jest.mock('@gitroom/frontend/components/ui/icons', () => ({
  PlusIcon: () => 'Plus',
}));
jest.mock('@uidotdev/usehooks', () => ({
  useClickAway: () => React.createRef<HTMLDivElement>(),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => fetchMock,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toasterShow }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/nestjs-libraries/services/make.is', () => ({
  makeId: () => 'generated-id',
}));

const skills = [
  {
    id: 'campaign',
    slug: 'campaign',
    command: '/campaign',
    name: 'campaign.skill.md',
    fileSize: 100,
    updatedAt: '2026-01-01',
    isLarge: false,
  },
  {
    id: 'campaign-review',
    slug: 'campaign-review',
    command: '/campaign-review',
    name: 'campaign-review.skill.md',
    fileSize: 100,
    updatedAt: '2026-01-01',
    isLarge: false,
  },
  {
    id: 'caption',
    slug: 'caption',
    command: '/caption',
    name: 'caption.skill.md',
    fileSize: 100,
    updatedAt: '2026-01-01',
    isLarge: false,
  },
];

const renderInput = () => {
  const onSend = jest.fn();
  const onChange = jest.fn();
  render(
    <Input
      inProgress={false}
      onSend={onSend}
      onChange={onChange}
      onStop={jest.fn()}
    />
  );
  return { onSend, onChange, textarea: screen.getByRole('combobox') };
};

const renderAttachInput = (media: { id: string; path: string }[] = []) => {
  const onSend = jest.fn();
  const onChange = jest.fn();
  const onMediaChange = jest.fn();
  render(
    <Input
      inProgress={false}
      onSend={onSend}
      onChange={onChange}
      onStop={jest.fn()}
      media={media}
      onMediaChange={onMediaChange}
    />
  );
  return { onSend, onChange, onMediaChange };
};

describe('agent skill autocomplete', () => {
  beforeEach(() => {
    useAgentSkills.mockReturnValue({ data: skills, isLoading: false });
    openMediaLibrary.mockClear();
    fetchMock.mockReset();
    toasterShow.mockClear();
  });

  it('filters commands and inserts a mouse-selected command without sending', () => {
    const { onSend, onChange, textarea } = renderInput();
    fireEvent.change(textarea, { target: { value: '/cam' } });

    expect(screen.getByTestId('agent-skill-option-campaign')).toBeTruthy();
    expect(screen.queryByTestId('agent-skill-option-caption')).toBeNull();

    fireEvent.mouseDown(screen.getByTestId('agent-skill-option-campaign'));
    expect((textarea as HTMLTextAreaElement).value).toBe('/campaign ');
    expect(onChange).toHaveBeenLastCalledWith('/campaign ');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('closes suggestions once the first slash token is followed by arguments', () => {
    const { textarea } = renderInput();
    fireEvent.change(textarea, { target: { value: '/cam draft a post' } });
    expect(screen.queryByTestId('agent-skill-suggestions')).toBeNull();
  });

  it('uses keyboard selection, escape, IME, and ordinary Enter correctly', () => {
    const { onSend, textarea } = renderInput();
    fireEvent.change(textarea, { target: { value: '/' } });
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'Tab' });
    expect((textarea as HTMLTextAreaElement).value).toBe('/caption ');
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.change(textarea, { target: { value: '/' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryByTestId('agent-skill-suggestions')).toBeNull();

    fireEvent.change(textarea, { target: { value: '/campaign' } });
    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.compositionEnd(textarea);

    fireEvent.change(textarea, { target: { value: 'manual command' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('manual command');
  });

  it('does not block manual commands when the catalog fails', () => {
    useAgentSkills.mockReturnValue({
      data: [],
      error: new Error('failed'),
      isLoading: false,
    });
    const { onSend, textarea } = renderInput();
    fireEvent.change(textarea, { target: { value: '/manual' } });
    expect(screen.getByText(/Skills are unavailable/)).toBeTruthy();
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('/manual');
  });

  it('sends completed slash commands with arguments on Enter', () => {
    const { onSend, textarea } = renderInput();
    fireEvent.change(textarea, {
      target: { value: '/campaign-review draft text' },
    });
    expect(screen.queryByTestId('agent-skill-suggestions')).toBeNull();
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('/campaign-review draft text');
  });

  it('sends an exact completed command on Enter without selecting a suggestion', () => {
    const { onSend, textarea } = renderInput();
    fireEvent.change(textarea, { target: { value: '/campaign' } });
    expect(screen.queryByTestId('agent-skill-suggestions')).toBeNull();
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('/campaign');
  });

  it('opens an attach dropdown without sending on click', () => {
    const { onSend } = renderAttachInput();
    const attach = screen.getByTestId('agent-attach-media');
    fireEvent.click(attach);
    expect(screen.getByTestId('agent-attach-menu').className).not.toContain(
      'hidden'
    );
    expect(onSend).not.toHaveBeenCalled();
    expect(openMediaLibrary).not.toHaveBeenCalled();
  });

  it('opens the media library from Select from media', () => {
    renderAttachInput();
    fireEvent.click(screen.getByTestId('agent-attach-media'));
    fireEvent.click(screen.getByTestId('agent-attach-select-media'));
    expect(openMediaLibrary).toHaveBeenCalled();
    expect(screen.getByTestId('agent-attach-menu').className).toContain(
      'hidden'
    );
  });

  it('uploads from computer and appends attachments without opening the library', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ path: 'https://cdn.example/photo.png' }),
    });
    const { onMediaChange } = renderAttachInput([
      { id: 'existing', path: 'https://cdn.example/existing.png' },
    ]);

    fireEvent.click(screen.getByTestId('agent-attach-media'));
    fireEvent.click(screen.getByTestId('agent-attach-upload'));

    const input = screen.getByTestId('agent-attach-file-input');
    const file = new File(['hello'], 'photo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onMediaChange).toHaveBeenCalledWith([
        { id: 'existing', path: 'https://cdn.example/existing.png' },
        { id: 'generated-id', path: 'https://cdn.example/photo.png' },
      ]);
    });

    expect(openMediaLibrary).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/media/upload-simple',
      expect.objectContaining({ method: 'POST' })
    );
    const formData = fetchMock.mock.calls[0][1].body as FormData;
    expect(formData.get('preventSave')).toBe('true');
    expect(formData.get('file')).toBe(file);
  });
});

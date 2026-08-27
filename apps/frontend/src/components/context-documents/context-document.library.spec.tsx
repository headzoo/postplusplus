/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContextDocumentLibrary } from './context-document.library';

const mutate = jest.fn();
const uploadDocument = jest.fn();
const deleteDocument = jest.fn();
const createDocument = jest.fn();
const updateDocument = jest.fn();
const renameDocument = jest.fn();
const decisionOpen = jest.fn();
const openModal = jest.fn();
const closeAll = jest.fn();
const closeCurrent = jest.fn();

jest.mock('@mantine/hooks', () => ({
  useClickOutside: () => React.createRef<HTMLDivElement>(),
}));
jest.mock('remark-gfm', () => jest.fn());
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => (
    <div data-testid="document-markdown-preview">{children}</div>
  ),
}));
jest.mock('@gitroom/react/form/button', () => ({
  Button: ({
    children,
    loading: _loading,
    secondary: _secondary,
    ...props
  }: any) => <button {...props}>{children}</button>,
}));
jest.mock('@gitroom/react/form/input', () => ({
  Input: ({ label, value, onChange, name }: any) => (
    <label>
      {label}
      <input name={name} value={value} onChange={onChange} />
    </label>
  ),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  __esModule: true,
  default: () => null,
  LoadingComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => ({ open: decisionOpen }),
  useModals: () => ({ openModal, closeAll, closeCurrent }),
}));
jest.mock('./use.context-document.list', () => ({
  useContextDocumentList: () => ({
    data: [
      {
        id: 'skill-1',
        organizationId: 'org-1',
        name: 'campaign-review.skill.md',
        fileSize: 12,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        isLarge: false,
        skill: {
          slug: 'campaign-review',
          command: '/campaign-review',
          conflict: false,
        },
      },
      {
        id: 'reserved-1',
        organizationId: 'org-1',
        name: 'followers.skill.md',
        fileSize: 12,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        isLarge: false,
        skill: { slug: 'followers', command: '/followers', conflict: true },
      },
      {
        id: 'doc-1',
        organizationId: 'org-1',
        name: 'BRANDING.md',
        description: 'Describes the channel branding. Colors, language, tone.',
        fileSize: 20,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        isLarge: false,
      },
    ],
    isLoading: false,
    mutate,
  }),
}));
jest.mock('./use.context-document.upload', () => ({
  useContextDocumentUpload: () => uploadDocument,
}));
jest.mock('./use.context-document.delete', () => ({
  useContextDocumentDelete: () => deleteDocument,
}));
jest.mock('./use.context-document.create', () => ({
  useContextDocumentCreate: () => createDocument,
}));
jest.mock('./use.context-document.update', () => ({
  useContextDocumentUpdate: () => updateDocument,
}));
jest.mock('./use.context-document.rename', () => ({
  useContextDocumentRename: () => renameDocument,
}));
jest.mock('./use.context-document.content', () => ({
  useContextDocumentContent: () => ({
    data: {
      id: 'doc-1',
      name: 'BRANDING.md',
      description: 'Describes the channel branding. Colors, language, tone.',
      content: '# Branding',
      fileSize: 10,
      updatedAt: '2026-01-01',
      isLarge: false,
    },
    isLoading: false,
  }),
}));

describe('ContextDocumentLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    decisionOpen.mockResolvedValue(true);
    uploadDocument.mockResolvedValue({ id: 'skill-1' });
    deleteDocument.mockResolvedValue({ id: 'reserved-1' });
    createDocument.mockResolvedValue({
      id: 'new-1',
      name: 'NOTES.md',
      fileSize: 0,
      organizationId: 'org-1',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      isLarge: false,
    });
    updateDocument.mockResolvedValue({ id: 'doc-1', name: 'BRANDING.md' });
    renameDocument.mockResolvedValue({ id: 'doc-1', name: 'VOICE.md' });
  });

  it('shows skill commands and marks reserved legacy skills as conflicts', () => {
    render(<ContextDocumentLibrary />);

    expect(screen.getByText('Skill · /campaign-review')).toBeTruthy();
    expect(screen.getByText('Skill conflict · /followers')).toBeTruthy();
    expect(screen.getByText(/cannot be invoked/i)).toBeTruthy();
  });

  it('shows document descriptions on standard document cards', () => {
    render(<ContextDocumentLibrary />);

    expect(
      screen.getByText(
        'Describes the channel branding. Colors, language, tone.'
      )
    ).toBeTruthy();
  });

  it('opens the editable document modal when a document card is clicked', () => {
    render(<ContextDocumentLibrary />);

    fireEvent.click(screen.getByText('BRANDING.md'));

    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'BRANDING.md',
        top: 20,
        height: 'calc(100dvh - 40px)',
      })
    );
  });

  it('does not open reserved skill conflict documents', () => {
    render(<ContextDocumentLibrary />);

    fireEvent.click(screen.getByText('followers.skill.md'));

    expect(openModal).not.toHaveBeenCalled();
  });

  it('opens a rename modal from the document actions menu', () => {
    render(<ContextDocumentLibrary />);
    const actions = screen.getAllByLabelText('Document actions');
    fireEvent.click(actions[2]);
    fireEvent.click(screen.getByText('Rename'));

    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Rename document',
      })
    );
  });

  it('opens the new document modal from the create button', () => {
    render(<ContextDocumentLibrary />);

    fireEvent.click(screen.getByText('Create'));

    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New document',
      })
    );
  });

  it('creates a document from the name modal and opens the editor', async () => {
    openModal.mockImplementation(({ children }) => {
      if (React.isValidElement(children)) {
        render(children);
      }
    });

    render(<ContextDocumentLibrary />);
    fireEvent.click(screen.getByText('Create'));

    const input = screen.getByLabelText('Filename');
    fireEvent.change(input, { target: { value: 'NOTES.md' } });
    fireEvent.click(screen.getAllByText('Create').at(-1)!);

    await waitFor(() =>
      expect(createDocument).toHaveBeenCalledWith({
        name: 'NOTES.md',
        content: '',
      })
    );
    await waitFor(() =>
      expect(openModal).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'NOTES.md',
        })
      )
    );
  });

  it('saves edited document content and description from the editor modal', async () => {
    openModal.mockImplementation(({ children }) => {
      if (React.isValidElement(children)) {
        render(children);
      }
    });

    render(<ContextDocumentLibrary />);
    fireEvent.click(screen.getByText('BRANDING.md'));

    const description = await screen.findByLabelText('Description');
    const editor = await screen.findByLabelText('Document content');
    fireEvent.change(description, {
      target: { value: 'Updated brand description' },
    });
    fireEvent.change(editor, { target: { value: '# Updated branding' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(updateDocument).toHaveBeenCalledWith(
        'doc-1',
        '# Updated branding',
        {
          documentName: 'BRANDING.md',
          description: 'Updated brand description',
        }
      )
    );
  });

  it('toggles between markdown edit and html preview', async () => {
    openModal.mockImplementation(({ children }) => {
      if (React.isValidElement(children)) {
        render(children);
      }
    });

    render(<ContextDocumentLibrary />);
    fireEvent.click(screen.getByText('BRANDING.md'));

    const editor = await screen.findByLabelText('Document content');
    expect(editor).toBeTruthy();
    expect(screen.getByText('Preview')).toBeTruthy();
    expect(screen.queryByLabelText('Document preview')).toBeNull();

    fireEvent.click(screen.getByText('Preview'));

    expect(screen.queryByLabelText('Document content')).toBeNull();
    expect(screen.getByLabelText('Document preview')).toBeTruthy();
    expect(screen.getByTestId('document-markdown-preview').textContent).toBe(
      '# Branding'
    );
    expect(screen.getByText('Edit')).toBeTruthy();

    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByLabelText('Document content')).toBeTruthy();
    expect(screen.queryByLabelText('Document preview')).toBeNull();
    expect(screen.getByText('Preview')).toBeTruthy();
  });

  it('hides the description field for skill documents', async () => {
    openModal.mockImplementation(({ children }) => {
      if (React.isValidElement(children)) {
        render(children);
      }
    });

    render(<ContextDocumentLibrary />);
    fireEvent.click(screen.getByText('campaign-review.skill.md'));

    await screen.findByLabelText('Document content');
    expect(screen.queryByLabelText('Description')).toBeNull();
  });

  it('confirms replacement and refreshes the library after a skill upload', async () => {
    const { container } = render(<ContextDocumentLibrary />);
    const actions = screen.getAllByLabelText('Document actions');
    fireEvent.click(actions[0]);
    fireEvent.click(screen.getByText('Replace'));

    const input = container.querySelector('input[type="file"]')!;
    const file = new File(['# Updated'], 'campaign-review.skill.md', {
      type: 'text/markdown',
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(decisionOpen).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Replace existing document?' })
      )
    );
    await waitFor(() => expect(uploadDocument).toHaveBeenCalledWith(file));
    expect(mutate).toHaveBeenCalled();
  });

  it('deletes reserved skill conflicts through the management library', async () => {
    render(<ContextDocumentLibrary />);
    const actions = screen.getAllByLabelText('Document actions');
    fireEvent.click(actions[1]);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() =>
      expect(deleteDocument).toHaveBeenCalledWith('reserved-1')
    );
    expect(mutate).toHaveBeenCalled();
  });
});

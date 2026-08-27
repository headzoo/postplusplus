/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PipelineAutopostPanel } from './pipeline.autopost';
import { usePipelineAutoposts } from './use.pipeline.autoposts';
import { usePipelineAutopostMutations } from './use.pipeline.autopost.mutations';

const fetchMock = jest.fn();
const openModal = jest.fn();
const closeAll = jest.fn();
const showToast = jest.fn();
const deleteDialogMock = jest.fn();
const mutateFeeds = jest.fn();
const createAutopost = jest.fn();
const updateAutopost = jest.fn();
const deleteAutopost = jest.fn();
const toggleAutopostActive = jest.fn();

const channels = [
  {
    id: 'channel-1',
    name: 'Headzoo',
    identifier: 'x',
    picture: '/x.png',
    disabled: false,
  },
];

const sampleFeed = {
  id: 'feed-1',
  title: 'Tech Blog',
  url: 'https://example.com/rss.xml',
  content: '',
  lastUrl: 'https://example.com/post-1',
  syncLast: false,
  active: true,
  addPicture: false,
  generateContent: true,
};

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback || key,
}));

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => fetchMock,
}));

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal,
    closeAll,
  }),
}));

jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: showToast }),
}));

jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: (...args: unknown[]) => deleteDialogMock(...args),
}));

jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div>Loading</div>,
}));

jest.mock('@gitroom/frontend/components/pipelines/pipeline.channels', () => ({
  PipelineChannels: () => <div>Pipeline channels</div>,
}));

jest.mock('@copilotkit/react-textarea', () => ({
  CopilotTextarea: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (e: { target: { value: string } }) => void;
  }) => (
    <textarea
      data-testid="copilot-textarea"
      value={value}
      onChange={onChange}
    />
  ),
}));

jest.mock('./use.pipeline.autoposts', () => ({
  usePipelineAutoposts: jest.fn(),
  pipelineAutopostsKey: (id: string) => `/pipelines/${id}/autoposts`,
}));

jest.mock('./use.pipeline.autopost.mutations', () => ({
  usePipelineAutopostMutations: jest.fn(),
}));

const mockUsePipelineAutoposts = usePipelineAutoposts as jest.Mock;
const mockUsePipelineAutopostMutations =
  usePipelineAutopostMutations as jest.Mock;

const renderAddModal = () => {
  const view = render(
    <PipelineAutopostPanel pipelineId="pipeline-1" channels={channels} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add an autopost' }));
  const modalChildren = openModal.mock.calls[0][0].children;
  view.unmount();
  return render(modalChildren);
};

const renderEditModal = () => {
  const view = render(
    <PipelineAutopostPanel pipelineId="pipeline-1" channels={channels} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const modalChildren = openModal.mock.calls[0][0].children;
  view.unmount();
  return render(modalChildren);
};

describe('PipelineAutopostPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    openModal.mockReset();
    closeAll.mockReset();
    showToast.mockReset();
    deleteDialogMock.mockReset();
    mutateFeeds.mockReset();
    createAutopost.mockReset();
    updateAutopost.mockReset();
    deleteAutopost.mockReset();
    toggleAutopostActive.mockReset();

    deleteDialogMock.mockResolvedValue(true);
    createAutopost.mockResolvedValue(sampleFeed);
    updateAutopost.mockResolvedValue(sampleFeed);
    deleteAutopost.mockResolvedValue(undefined);
    toggleAutopostActive.mockResolvedValue(undefined);

    mockUsePipelineAutopostMutations.mockReturnValue({
      createAutopost,
      updateAutopost,
      deleteAutopost,
      toggleAutopostActive,
      invalidate: jest.fn(),
    });

    mockUsePipelineAutoposts.mockReturnValue({
      data: [sampleFeed],
      error: undefined,
      isLoading: false,
      mutate: mutateFeeds,
    });
  });

  it('lists pipeline feeds with title and url', () => {
    render(
      <PipelineAutopostPanel pipelineId="pipeline-1" channels={channels} />
    );

    expect(screen.getByText('Tech Blog')).toBeTruthy();
    expect(screen.getByText('https://example.com/rss.xml')).toBeTruthy();
  });

  it('shows empty state when no feeds exist', () => {
    mockUsePipelineAutoposts.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
      mutate: mutateFeeds,
    });

    render(
      <PipelineAutopostPanel pipelineId="pipeline-1" channels={channels} />
    );

    expect(
      screen.getByText(
        'No RSS feeds yet. Add one to automatically queue new items for this Pipeline.'
      )
    ).toBeTruthy();
  });

  it('opens add modal without integration or immediate-post fields', () => {
    renderAddModal();

    expect(
      screen.getByText(
        'New RSS items are drafted for every channel configured on this Pipeline. There is no per-feed channel picker.'
      )
    ).toBeTruthy();
    expect(screen.queryByText('Integrations')).toBeNull();
    expect(screen.queryByText('Post Immediately')).toBeNull();
    expect(screen.queryByText('When should we post it?')).toBeNull();
  });

  it('requires validated RSS URL before showing save on create', async () => {
    renderAddModal();

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    fireEvent.input(document.querySelector('input[name="title"]')!, {
      target: { value: 'New Feed' },
    });
    fireEvent.input(document.querySelector('input[name="url"]')!, {
      target: { value: 'https://example.com/feed.xml' },
    });

    fetchMock.mockResolvedValue({
      json: async () => ({
        success: true,
        url: 'https://example.com/item-1',
      }),
    });

    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: 'Send Test' }).className
        ).not.toContain('pointer-events-none');
      },
      { timeout: 3000 }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send Test' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    });
  });

  it('creates feed with PipelineAutopostDto payload only', async () => {
    renderAddModal();

    fireEvent.input(document.querySelector('input[name="title"]')!, {
      target: { value: 'New Feed' },
    });
    fireEvent.input(document.querySelector('input[name="url"]')!, {
      target: { value: 'https://example.com/feed.xml' },
    });

    fetchMock.mockResolvedValue({
      json: async () => ({
        success: true,
        url: 'https://example.com/item-1',
      }),
    });

    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: 'Send Test' }).className
        ).not.toContain('pointer-events-none');
      },
      { timeout: 3000 }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send Test' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(createAutopost).toHaveBeenCalledWith({
        title: 'New Feed',
        content: '',
        syncLast: false,
        url: 'https://example.com/feed.xml',
        active: true,
        addPicture: false,
        generateContent: true,
        lastUrl: 'https://example.com/item-1',
      });
    });

    expect(createAutopost.mock.calls[0][0]).not.toHaveProperty('integrations');
    expect(createAutopost.mock.calls[0][0]).not.toHaveProperty('onSlot');
  });

  it('updates feed on edit after validation', async () => {
    renderEditModal();

    fireEvent.change(document.querySelector('input[name="title"]')!, {
      target: { value: 'Updated Feed' },
    });

    fetchMock.mockResolvedValue({
      json: async () => ({
        success: true,
        url: 'https://example.com/post-1',
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Test' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateAutopost).toHaveBeenCalledWith('feed-1', {
        title: 'Updated Feed',
        content: '',
        syncLast: false,
        url: 'https://example.com/rss.xml',
        active: true,
        addPicture: false,
        generateContent: true,
        lastUrl: 'https://example.com/post-1',
      });
    });
  });

  it('toggles active state via mutation', async () => {
    render(
      <PipelineAutopostPanel pipelineId="pipeline-1" channels={channels} />
    );

    const slider = screen.getByTestId('pipeline-autopost-active-feed-1');
    fireEvent.click(slider.firstElementChild!);

    await waitFor(() => {
      expect(toggleAutopostActive).toHaveBeenCalledWith('feed-1', false);
    });
  });

  it('deletes feed after confirmation', async () => {
    render(
      <PipelineAutopostPanel pipelineId="pipeline-1" channels={channels} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deleteDialogMock).toHaveBeenCalled();
      expect(deleteAutopost).toHaveBeenCalledWith('feed-1');
    });
  });

  it('shows API failure state with retry', () => {
    mockUsePipelineAutoposts.mockReturnValue({
      data: undefined,
      error: new Error('network'),
      isLoading: false,
      mutate: mutateFeeds,
    });

    render(
      <PipelineAutopostPanel pipelineId="pipeline-1" channels={channels} />
    );

    expect(screen.getByText('Failed to load Pipeline RSS feeds.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mutateFeeds).toHaveBeenCalled();
  });
});

/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Pipelines } from './pipelines';
import { PipelineSummary } from './pipeline.types';

const push = jest.fn();
const mutate = jest.fn();
const setPipelineStatus = jest.fn();
const deletePipeline = jest.fn();
const openModal = jest.fn();
const decisionOpen = jest.fn();
const usePipelineList = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal }),
  useDecisionModal: () => ({ open: decisionOpen }),
}));

jest.mock('@gitroom/react/form/button', () => ({
  Button: ({
    children,
    secondary: _secondary,
    ...props
  }: {
    children: React.ReactNode;
    secondary?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@gitroom/react/form/slider', () => ({
  Slider: ({
    value,
    onChange,
  }: {
    value: 'on' | 'off';
    onChange: (value: 'on' | 'off') => void;
  }) => (
    <button
      type="button"
      data-testid="pipeline-slider"
      onClick={() => onChange(value === 'on' ? 'off' : 'on')}
    >
      {value}
    </button>
  ),
}));

jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div>Loading</div>,
}));

jest.mock('@mantine/hooks', () => ({
  useClickOutside: () => undefined,
}));

jest.mock('@gitroom/frontend/components/launches/channels.sidebar', () => ({
  ChannelsSidebar: ({
    children,
  }: {
    children: (collapsed: boolean) => React.ReactNode;
  }) => <div>{children(false)}</div>,
  ChannelMenu: () => <div data-testid="channel-menu" />,
}));

jest.mock('@gitroom/frontend/components/launches/helpers/last-channel', () => ({
  setLastChannelId: jest.fn(),
}));

jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({
      data: [
        {
          id: 'channel-1',
          name: 'X Channel',
          disabled: false,
          inBetweenSteps: false,
          editor: 'normal',
          display: 'X Channel',
          identifier: 'x',
          type: 'social',
          picture: '',
          changeProfilePicture: false,
          additionalSettings: '',
          changeNickName: false,
          time: [],
        },
      ],
      isLoading: false,
    }),
  })
);

jest.mock('./use.pipeline.list', () => ({
  usePipelineList: () => usePipelineList(),
}));

jest.mock('./use.pipeline.detail', () => ({
  usePipelineDetail: () => ({ data: null, isLoading: false, error: null }),
}));

jest.mock('./use.pipeline.status', () => ({
  usePipelineStatus: () => setPipelineStatus,
}));

jest.mock('./use.pipeline.delete', () => ({
  useDeletePipeline: () => deletePipeline,
}));

jest.mock('./pipeline.channels', () => ({
  PipelineChannels: ({ channels }: { channels: { id: string }[] }) => (
    <span data-testid="pipeline-channels">{channels.length}</span>
  ),
}));

jest.mock(
  '@gitroom/frontend/components/context-documents/context-document.assignment-picker',
  () => ({
    PipelineContextDocumentsPanel: () => null,
  })
);

jest.mock('./pipeline.form', () => ({
  PipelineForm: () => <div>Pipeline form</div>,
}));

const pipeline: PipelineSummary = {
  id: 'pipeline-1',
  name: 'Weekly updates',
  timezone: 'America/New_York',
  color: '#612BD3',
  active: true,
  scheduleRevision: 1,
  channels: [
    {
      id: 'channel-1',
      name: 'X Channel',
      disabled: false,
      inBetweenSteps: false,
      editor: 'normal',
      display: 'X Channel',
      identifier: 'x',
      type: 'social',
      picture: '',
      changeProfilePicture: false,
      additionalSettings: '',
      changeNickName: false,
      time: [],
    },
  ],
  queueCount: 3,
  nextSlot: '2099-01-05T17:00:00.000Z',
};

describe('Pipelines', () => {
  beforeEach(() => {
    push.mockReset();
    mutate.mockReset().mockResolvedValue(undefined);
    setPipelineStatus.mockReset().mockResolvedValue(undefined);
    deletePipeline.mockReset();
    openModal.mockReset();
    decisionOpen.mockReset();
    usePipelineList.mockReturnValue({
      data: [pipeline],
      error: null,
      isLoading: false,
      mutate,
    });
  });

  it('renders pipelines in the follower-style responsive card grid', () => {
    render(<Pipelines />);

    const grid = screen.getByTestId('pipelines-grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).toContain('xl:grid-cols-3');
  });

  it('shows pipeline card details', () => {
    render(<Pipelines />);

    expect(screen.getByText('Weekly updates')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText(/queued/)).toBeTruthy();
    expect(screen.getByText('New York')).toBeTruthy();
    expect(screen.getByText(/2099/)).toBeTruthy();
  });

  it('navigates to the pipeline detail page when the card is clicked', () => {
    render(<Pipelines />);

    fireEvent.click(screen.getByRole('button', { name: /Weekly updates/i }));

    expect(push).toHaveBeenCalledWith('/pipelines/pipeline-1');
  });

  it('does not navigate when the active slider is clicked', async () => {
    render(<Pipelines />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('pipeline-slider'));
    });

    expect(push).not.toHaveBeenCalled();
    expect(setPipelineStatus).toHaveBeenCalledWith('pipeline-1', false);
  });

  it('does not navigate when the actions menu is opened', () => {
    render(<Pipelines />);

    fireEvent.click(screen.getByRole('button', { name: 'Pipeline actions' }));

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });
});

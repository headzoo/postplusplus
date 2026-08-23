/**
 * @jest-environment ./jest.jsdom.environment.js
 */

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => {
    const React = require('react');
    return React.createElement('a', { href }, children);
  },
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({}),
  usePathname: () => '/agents',
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MultiMediaComponent: () => null,
}));

jest.mock('@gitroom/helpers/utils/use.wait.for.class', () => ({
  useWaitForClass: () => false,
}));

jest.mock('react-hotkeys-hook', () => ({
  useHotkeys: jest.fn(),
}));

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  AgentList,
  applyChannelToggle,
  applyPipelineSelection,
  defaultAgentSelectionState,
} from './agent';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { PipelineSummary } from '@gitroom/frontend/components/pipelines/pipeline.types';

jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
  useSWRConfig: jest.fn(() => ({ mutate: jest.fn() })),
}));

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: jest.fn(() => jest.fn()),
}));

jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: jest.fn(() => ['0', jest.fn()]),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback || key,
}));

jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ totalChannels: 10 }),
}));

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ billingEnabled: false }),
}));

jest.mock('react-dnd', () => ({
  useDrag: () => [{}, (node: unknown) => node, (node: unknown) => node],
  useDrop: () => [{ isOver: false }, (node: unknown) => node],
}));

jest.mock('@gitroom/frontend/components/launches/helpers/dnd.provider', () => ({
  DNDProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@gitroom/frontend/components/launches/add.provider.component', () => ({
  AddProviderButton: () => null,
}));

jest.mock('@gitroom/frontend/components/launches/generator/generator', () => ({
  GeneratorComponent: () => null,
}));

jest.mock('@gitroom/frontend/components/launches/new.post', () => ({
  NewPost: () => null,
}));

jest.mock('@gitroom/frontend/components/launches/menu/menu', () => ({
  Menu: () => null,
}));

jest.mock('@gitroom/frontend/components/launches/helpers/use.integration.list', () => ({
  useIntegrationList: jest.fn(),
}));

jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

jest.mock('@gitroom/frontend/components/launches/launches.component', () => ({
  SVGLine: () => <div data-testid="svg-line" />,
}));

jest.mock('@gitroom/frontend/components/pipelines/pipeline.channels', () => ({
  PipelineChannels: ({ channels }: { channels: Integrations[] }) => (
    <div data-testid="pipeline-channels">{channels.length}</div>
  ),
}));

jest.mock('@gitroom/frontend/components/pipelines/use.pipeline.list', () => ({
  usePipelineList: jest.fn(),
}));

const useSWR = jest.requireMock('swr').default as jest.Mock;
const { usePipelineList } = jest.requireMock(
  '@gitroom/frontend/components/pipelines/use.pipeline.list'
) as { usePipelineList: jest.Mock };
const { useIntegrationList } = jest.requireMock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list'
) as { useIntegrationList: jest.Mock };

const makeIntegration = (
  id: string,
  name: string,
  overrides: Partial<Integrations> = {}
): Integrations => ({
  id,
  name,
  inBetweenSteps: false,
  editor: 'normal',
  display: name,
  identifier: `platform-${id}`,
  type: 'social',
  picture: `/picture/${id}.png`,
  changeProfilePicture: false,
  additionalSettings: '',
  changeNickName: false,
  time: [],
  ...overrides,
});

const makePipeline = (
  id: string,
  name: string,
  channelIds: string[]
): PipelineSummary => ({
  id,
  name,
  timezone: 'UTC',
  color: '#3366ff',
  active: id !== 'pipeline-paused',
  scheduleRevision: 1,
  channels: channelIds.map((channelId) =>
    makeIntegration(channelId, `Channel ${channelId}`)
  ),
  queueCount: 0,
});

const channelA = makeIntegration('channel-a', 'Channel A');
const channelB = makeIntegration('channel-b', 'Channel B');
const channelC = makeIntegration('channel-c', 'Channel C');

const pipelineA = makePipeline('pipeline-a', 'Pipeline A', [
  'channel-a',
  'channel-b',
]);
const pipelineB = makePipeline('pipeline-b', 'Pipeline B', ['channel-c']);
const pipelinePaused = makePipeline('pipeline-paused', 'Pipeline Paused', [
  'channel-a',
]);

describe('applyPipelineSelection', () => {
  it('starts with no pipeline or channels selected', () => {
    expect(defaultAgentSelectionState).toEqual({
      properties: [],
      selectedPipeline: null,
    });
  });

  it('selects pipeline A and replaces channels with its configured channels', () => {
    expect(applyPipelineSelection(null, pipelineA)).toEqual({
      selectedPipeline: pipelineA,
      properties: pipelineA.channels,
    });
  });

  it('replaces pipeline A with pipeline B and its channels', () => {
    const afterA = applyPipelineSelection(null, pipelineA);
    const afterB = applyPipelineSelection(afterA.selectedPipeline, pipelineB);

    expect(afterB).toEqual({
      selectedPipeline: pipelineB,
      properties: pipelineB.channels,
    });
  });

  it('clears pipeline and channels when selecting the active pipeline again', () => {
    const afterA = applyPipelineSelection(null, pipelineA);
    const cleared = applyPipelineSelection(afterA.selectedPipeline, pipelineA);

    expect(cleared).toEqual({
      selectedPipeline: null,
      properties: [],
    });
  });
});

describe('applyChannelToggle', () => {
  it('clears pipeline and preserves channel toggle when editing synchronized channels', () => {
    const synced = applyPipelineSelection(null, pipelineA);
    const toggled = applyChannelToggle(
      synced.properties,
      synced.selectedPipeline,
      synced.properties[0]
    );

    expect(toggled.selectedPipeline).toBeNull();
    expect(toggled.properties.map((integration) => integration.id)).toEqual([
      'channel-b',
    ]);
  });

  it('adds a channel after clearing pipeline selection', () => {
    const synced = applyPipelineSelection(null, pipelineA);
    const toggled = applyChannelToggle(
      synced.properties,
      synced.selectedPipeline,
      channelC
    );

    expect(toggled.selectedPipeline).toBeNull();
    expect(toggled.properties).toEqual([...pipelineA.channels, channelC]);
  });
});

describe('AgentList pipeline sidebar', () => {
  beforeEach(() => {
    useSWR.mockReturnValue({ data: [] });
    useIntegrationList.mockReturnValue({
      data: [channelA, channelB, channelC],
      isLoading: false,
    });

    usePipelineList.mockReturnValue({
      data: [pipelineA, pipelineB, pipelinePaused],
      error: undefined,
      isLoading: false,
    });
  });

  it('renders pipelines beneath select channels with radio semantics', () => {
    const onToggleIntegration = jest.fn();
    const onSelectPipeline = jest.fn();

    render(
      <AgentList
        selectedIntegrations={[]}
        selectedPipeline={null}
        onToggleIntegration={onToggleIntegration}
        onSelectPipeline={onSelectPipeline}
      />
    );

    expect(screen.getByText('Channels')).toBeTruthy();
    expect(screen.getByText('Pipelines')).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Pipelines' })).toBeTruthy();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    radios.forEach((radio) => {
      expect(radio.getAttribute('aria-checked')).toBe('false');
    });

    expect(screen.getByText('Pipeline A')).toBeTruthy();
    expect(screen.getByText('Pipeline B')).toBeTruthy();
    expect(screen.queryByText('Pipeline Paused')).toBeNull();
    expect(screen.queryByText('Active')).toBeNull();
    expect(screen.queryByText('Paused')).toBeNull();
  });

  it('does not render paused pipelines', () => {
    render(
      <AgentList
        selectedIntegrations={[]}
        selectedPipeline={null}
        onToggleIntegration={jest.fn()}
        onSelectPipeline={jest.fn()}
      />
    );

    expect(screen.queryByText('Pipeline Paused')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('marks the selected pipeline radio and invokes selection callback', () => {
    const onSelectPipeline = jest.fn();

    render(
      <AgentList
        selectedIntegrations={pipelineA.channels}
        selectedPipeline={pipelineA}
        onToggleIntegration={jest.fn()}
        onSelectPipeline={onSelectPipeline}
      />
    );

    const selectedRadio = screen.getByRole('radio', { name: /Pipeline A/i });
    expect(selectedRadio.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByText('Pipeline B'));
    expect(onSelectPipeline).toHaveBeenCalledWith(pipelineB);
  });

  it('keeps channels usable while pipelines are loading', () => {
    usePipelineList.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: true,
    });

    const onToggleIntegration = jest.fn();

    render(
      <AgentList
        selectedIntegrations={[]}
        selectedPipeline={null}
        onToggleIntegration={onToggleIntegration}
        onSelectPipeline={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('Channel A'));
    expect(onToggleIntegration).toHaveBeenCalledWith(channelA);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });
});

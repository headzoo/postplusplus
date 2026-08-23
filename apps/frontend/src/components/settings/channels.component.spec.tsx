/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChannelsSettings } from './channels.component';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useChannelDetails } from './use.channel.details';

const fetchMock = jest.fn();
const toastShow = jest.fn();
const globalMutate = jest.fn();
const mutateChannelDetails = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback || key,
}));

jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div>Loading</div>,
}));

jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toastShow }),
}));

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => fetchMock,
}));

jest.mock('swr', () => {
  const actual = jest.requireActual('swr');
  return {
    ...actual,
    useSWRConfig: () => ({ mutate: globalMutate }),
  };
});

jest.mock('@gitroom/frontend/components/launches/helpers/dnd.provider', () => ({
  DNDProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@gitroom/frontend/components/launches/channels.sidebar', () => ({
  ChannelMenu: ({
    integrations,
    onSelect,
  }: {
    integrations: Array<{ id: string; name: string }>;
    onSelect?: (integration: { id: string; name: string }) => void;
  }) => (
    <div>
      {integrations.map((integration) => (
        <button
          key={integration.id}
          type="button"
          onClick={() => onSelect?.(integration)}
        >
          {integration.name}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('@gitroom/frontend/components/launches/helpers/use.integration.list', () => ({
  useIntegrationList: jest.fn(),
}));

jest.mock('./use.channel.details', () => ({
  useChannelDetails: jest.fn(),
  channelStrategyOptions: jest.requireActual('./use.channel.details')
    .channelStrategyOptions,
}));

const strategyApplicableDetails = {
  strategyApplicable: true,
  strategy: {
    id: 'grow_audience',
    version: 1,
    label: {
      key: 'channelStrategies.grow_audience.label',
      defaultValue: 'Grow audience',
    },
    description: {
      key: 'channelStrategies.grow_audience.description',
      defaultValue:
        'Prioritize reciprocal relationships that can expand your audience.',
    },
  },
  recomputing: false,
};

const baseChannelDetails = {
  id: 'channel-a',
  name: 'Headzoo',
  identifier: 'x',
  internalId: '1911740070',
  type: 'social',
  disabled: false,
  refreshNeeded: false,
  inBetweenSteps: false,
  tracking: {
    state: 'partial',
    noBackfill: true,
    failureCategory: 'authorization',
    reason: 'Tracking permissions do not allow this subscription.',
    coverage: [{ kind: 'like', inbound: 'supported', outbound: 'supported' }],
  },
  subscriptions: [
    {
      eventKey: 'like.create',
      direction: 'inbound',
      state: 'error',
      remoteIdentifier: 'sub-like',
      reason: 'Tracking permissions do not allow this subscription.',
    },
    {
      eventKey: 'follow.follow',
      direction: 'inbound',
      state: 'active',
      remoteIdentifier: 'sub-follow',
    },
  ],
};

describe('ChannelsSettings', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    fetchMock.mockReset();
    toastShow.mockReset();
    globalMutate.mockReset();
    mutateChannelDetails.mockReset();
    globalMutate.mockResolvedValue(undefined);
    mutateChannelDetails.mockResolvedValue(undefined);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });
    (useIntegrationList as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'channel-a',
          name: 'Headzoo',
          identifier: 'x',
          internalId: '1911740070',
          display: '@headzoo',
          disabled: false,
          refreshNeeded: false,
          inBetweenSteps: false,
        },
      ],
      isLoading: false,
    });
    (useChannelDetails as jest.Mock).mockReturnValue({
      data: {
        ...baseChannelDetails,
        ...strategyApplicableDetails,
      },
      isLoading: false,
      mutate: mutateChannelDetails,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('shows tracking state, subscriptions, and starts OAuth refresh', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://x.com/oauth' }),
    });

    render(<ChannelsSettings />);

    expect(screen.getByText('Partial')).toBeTruthy();
    expect(screen.getAllByText('like.create · inbound').length).toBe(2);
    expect(screen.getByText('follow.follow · inbound')).toBeTruthy();
    expect(
      screen.getAllByText(
        'Tracking permissions do not allow this subscription.'
      ).length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh OAuth' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/integrations/social/x?refresh=1911740070'
      );
      expect(window.location.href).toBe('https://x.com/oauth');
    });
  });

  it('starts the tracking authorization for channels that need one', async () => {
    (useChannelDetails as jest.Mock).mockReturnValue({
      data: {
        ...baseChannelDetails,
        ...strategyApplicableDetails,
        trackingAuthorization: { connected: false },
        tracking: { state: 'partial', coverage: [] },
        subscriptions: [],
      },
      isLoading: false,
      mutate: mutateChannelDetails,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://x.com/i/oauth2/authorize' }),
    });

    render(<ChannelsSettings />);

    expect(
      screen.getByText(
        'Some interaction events need an extra permission grant before they can be tracked. Use Authorize tracking to give it.'
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Authorize tracking' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/integrations/channel-a/tracking-authorization'
      );
      expect(window.location.href).toBe('https://x.com/i/oauth2/authorize');
    });
  });

  it('renders all five strategy options with grow audience marked default', () => {
    render(<ChannelsSettings />);

    expect(
      screen.getByRole('radiogroup', { name: 'Channel strategy' })
    ).toBeTruthy();
    expect(screen.getByText('Grow audience (Default)')).toBeTruthy();
    expect(screen.getByText('Capture leads')).toBeTruthy();
    expect(screen.getByText('Retain community')).toBeTruthy();
    expect(screen.getByText('Build awareness')).toBeTruthy();
    expect(screen.getByText('Support customers')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('marks the current strategy selection', () => {
    (useChannelDetails as jest.Mock).mockReturnValue({
      data: {
        ...baseChannelDetails,
        strategyApplicable: true,
        strategy: {
          id: 'lead_capture',
          version: 1,
          label: {
            key: 'channelStrategies.lead_capture.label',
            defaultValue: 'Capture leads',
          },
          description: {
            key: 'channelStrategies.lead_capture.description',
            defaultValue: 'Surface high-intent inbound conversations and follows.',
          },
        },
      },
      isLoading: false,
      mutate: mutateChannelDetails,
    });

    render(<ChannelsSettings />);

    expect(
      screen.getByRole('radio', { name: /Capture leads/i }).getAttribute(
        'aria-checked'
      )
    ).toBe('true');
    expect(
      screen.getByRole('radio', { name: /Grow audience/i }).getAttribute(
        'aria-checked'
      )
    ).toBe('false');
  });

  it('saves a changed strategy and revalidates caches', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        strategy: { id: 'lead_capture', version: 1 },
        recomputeRequested: true,
      }),
    });

    render(<ChannelsSettings />);

    fireEvent.click(screen.getByText('Capture leads'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/integrations/channel-a/strategy', {
        method: 'PUT',
        body: JSON.stringify({ strategyId: 'lead_capture' }),
      });
      expect(mutateChannelDetails).toHaveBeenCalled();
      expect(globalMutate).toHaveBeenCalledWith('/integrations/list');
      expect(globalMutate).toHaveBeenCalledWith('/followers/channels');
      expect(toastShow).toHaveBeenCalledWith(
        'Channel strategy updated.',
        'success'
      );
      expect(
        screen.getByText(
          'Relationship rankings are updating. Existing grades stay visible while the new strategy is applied.'
        )
      ).toBeTruthy();
    });
  });

  it('shows a failure toast and restores the persisted selection on save error', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

    render(<ChannelsSettings />);

    fireEvent.click(screen.getByText('Capture leads'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(toastShow).toHaveBeenCalledWith(
        'Could not update the channel strategy.'
      );
      expect(
        screen.getByRole('radio', { name: /Grow audience/i }).getAttribute(
          'aria-checked'
        )
      ).toBe('true');
    });
  });

  it('allows saving the current strategy without requesting changes', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        strategy: { id: 'grow_audience', version: 1 },
        recomputeRequested: false,
      }),
    });

    render(<ChannelsSettings />);

    fireEvent.click(screen.getByText('Grow audience (Default)'));
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(
      true
    );

    fireEvent.click(screen.getByText('Capture leads'));
    fireEvent.click(screen.getByText('Grow audience (Default)'));
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(
      true
    );
  });

  it('shows strategy loading state while channel details load', () => {
    (useChannelDetails as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      mutate: mutateChannelDetails,
    });

    render(<ChannelsSettings />);

    expect(screen.getByText('Loading')).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Channel strategy' })).toBeNull();
  });

  it('shows N/A for channels without follower identities', () => {
    (useChannelDetails as jest.Mock).mockReturnValue({
      data: {
        ...baseChannelDetails,
        strategyApplicable: false,
      },
      isLoading: false,
      mutate: mutateChannelDetails,
    });

    render(<ChannelsSettings />);

    expect(
      screen.getByText(
        'Not available for this channel because it does not expose follower identities.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Channel strategy' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('shows recomputing copy when channel details report stale projections', () => {
    (useChannelDetails as jest.Mock).mockReturnValue({
      data: {
        ...baseChannelDetails,
        ...strategyApplicableDetails,
        recomputing: true,
      },
      isLoading: false,
      mutate: mutateChannelDetails,
    });

    render(<ChannelsSettings />);

    expect(
      screen.getByText(
        'Relationship rankings are updating. Existing grades stay visible while the new strategy is applied.'
      )
    ).toBeTruthy();
  });
});

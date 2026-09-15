/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PicksSocialsComponent } from './picks.socials.component';
import { useLaunchStore } from './store';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';

jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const channel = (id: string, identifier: string, overrides = {}) => ({
  id,
  name: identifier,
  identifier,
  inBetweenSteps: false,
  disabled: false,
  editor: 'normal' as const,
  display: identifier,
  type: 'social',
  picture: '/picture.png',
  changeProfilePicture: false,
  additionalSettings: '',
  changeNickName: false,
  time: [],
  ...overrides,
});

const xChannel = channel('x-channel', 'x');
const instagramChannel = channel('instagram-channel', 'instagram');

describe('PicksSocialsComponent', () => {
  beforeEach(() => {
    useLaunchStore.getState().reset();
    useLaunchStore.getState().setAllIntegrations([xChannel, instagramChannel]);
  });

  it('shows every channel of the post being edited', () => {
    render(
      <ExistingDataContextProvider
        value={{
          integration: 'x-channel',
          posts: [],
          settings: {},
          channels: [
            { integration: 'x-channel', settings: {}, posts: [] },
            { integration: 'instagram-channel', settings: {}, posts: [] },
          ],
        }}
      >
        <PicksSocialsComponent />
      </ExistingDataContextProvider>
    );

    expect(screen.getAllByAltText('x').length).toBeGreaterThan(0);
    expect(screen.getAllByAltText('instagram').length).toBeGreaterThan(0);
  });

  it('shows only the focused channel for a single channel edit', () => {
    render(
      <ExistingDataContextProvider
        value={{ integration: 'x-channel', posts: [], settings: {} }}
      >
        <PicksSocialsComponent />
      </ExistingDataContextProvider>
    );

    expect(screen.getAllByAltText('x').length).toBeGreaterThan(0);
    expect(screen.queryByAltText('instagram')).toBeNull();
  });

  it('cannot add or remove channels while editing an existing post', () => {
    render(
      <ExistingDataContextProvider
        value={{
          integration: 'x-channel',
          posts: [],
          settings: {},
          channels: [
            { integration: 'x-channel', settings: {}, posts: [] },
            { integration: 'instagram-channel', settings: {}, posts: [] },
          ],
        }}
      >
        <PicksSocialsComponent />
      </ExistingDataContextProvider>
    );

    fireEvent.click(screen.getAllByAltText('instagram')[0]);

    expect(useLaunchStore.getState().selectedIntegrations).toHaveLength(0);
  });

  it('hides unavailable channels when creating a post', () => {
    useLaunchStore
      .getState()
      .setAllIntegrations([
        xChannel,
        channel('instagram-channel', 'instagram', { disabled: true }),
      ]);

    render(
      <ExistingDataContextProvider value={{ posts: [], settings: {} }}>
        <PicksSocialsComponent />
      </ExistingDataContextProvider>
    );

    expect(screen.getAllByAltText('x').length).toBeGreaterThan(0);
    expect(screen.queryByAltText('instagram')).toBeNull();
  });
});

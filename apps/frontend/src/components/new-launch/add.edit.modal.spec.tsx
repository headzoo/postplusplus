/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { AddEditModalInnerInner } from './add.edit.modal';
import { useLaunchStore } from './store';
import { PostReferenceState } from './post-reference.types';

jest.mock('@gitroom/frontend/components/new-launch/manage.modal', () => ({
  ManageModal: () => <div data-testid="manage-modal" />,
}));

jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({
    useExistingData: () => ({}),
  })
);

const quoteReference: PostReferenceState = {
  type: 'quote',
  providerIdentifier: 'x',
  externalId: '1234567890',
  url: 'https://x.com/user/status/1234567890',
  preview: {
    authorName: 'Jane Doe',
    authorUsername: 'jane',
    content: 'Quoted status text',
  },
};

const baseProps = {
  date: { utc: () => ({ format: () => '2026-08-28T12:00:00' }) } as any,
  integrations: [
    {
      id: 'x-channel',
      name: 'X Account',
      identifier: 'x',
      inBetweenSteps: false,
      editor: 'normal' as const,
      display: 'x',
      type: 'social',
      picture: '/picture.png',
      changeProfilePicture: false,
      additionalSettings: '',
      changeNickName: false,
      time: [],
    },
  ],
  reopenModal: jest.fn(),
  mutate: jest.fn(),
};

describe('AddEditModalInnerInner quote initialization', () => {
  beforeEach(() => {
    useLaunchStore.getState().reset();
    useLaunchStore.getState().setAllIntegrations(baseProps.integrations);
  });

  it('seeds quote reference state and manual publishing mode on mount', () => {
    render(
      <AddEditModalInnerInner
        {...baseProps}
        selectedChannels={['x-channel']}
        focusedChannel="x-channel"
        initialPostReference={quoteReference}
      />
    );

    expect(useLaunchStore.getState().postReference).toEqual(quoteReference);
    expect(useLaunchStore.getState().publishingMode).toBe('manual');
    expect(useLaunchStore.getState().current).toBe('x-channel');
    expect(screen.getByTestId('manage-modal')).toBeTruthy();
  });

  it('clears quote reference on unmount reset', () => {
    const view = render(
      <AddEditModalInnerInner
        {...baseProps}
        selectedChannels={['x-channel']}
        focusedChannel="x-channel"
        initialPostReference={quoteReference}
      />
    );

    act(() => {
      view.unmount();
    });

    expect(useLaunchStore.getState().postReference).toBeNull();
  });
});

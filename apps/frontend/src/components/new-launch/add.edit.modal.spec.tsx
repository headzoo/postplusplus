/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import {
  AddEditModalInnerInner,
  orderComposerPosts,
  toComposerMedia,
} from './add.edit.modal';
import { useLaunchStore } from './store';
import { PostReferenceState } from './post-reference.types';

jest.mock('@gitroom/frontend/components/new-launch/manage.modal', () => ({
  ManageModal: () => <div data-testid="manage-modal" />,
}));

const mockUseExistingData = jest.fn(() => ({} as any));

jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({
    useExistingData: () => mockUseExistingData(),
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
    mockUseExistingData.mockReturnValue({});
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

describe('composer media helpers', () => {
  it('parses stored post images into an array', () => {
    expect(toComposerMedia([{ id: 'media', path: 'image.jpg' }])).toEqual([
      { id: 'media', path: 'image.jpg' },
    ]);
    expect(toComposerMedia('[{"id":"media","path":"image.jpg"}]')).toEqual([
      { id: 'media', path: 'image.jpg' },
    ]);
    expect(toComposerMedia('')).toEqual([]);
    expect(toComposerMedia(undefined)).toEqual([]);
  });

  it('keeps root posts ahead of comments', () => {
    expect(
      orderComposerPosts([
        { id: 'comment', parentPostId: 'root' },
        { id: 'root', parentPostId: null },
      ]).map((post) => post.id)
    ).toEqual(['root', 'comment']);
  });
});

describe('AddEditModalInnerInner existing post hydration', () => {
  const xChannel = {
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
  };
  const instagramChannel = {
    ...xChannel,
    id: 'instagram-channel',
    name: 'Cooper',
    identifier: 'instagram',
    display: 'cooper',
  };

  beforeEach(() => {
    mockUseExistingData.mockReturnValue({
      integration: 'x-channel',
      posts: [],
      settings: {},
      channels: [
        {
          integration: 'x-channel',
          settings: {},
          posts: [
            {
              id: 'x-root',
              parentPostId: null,
              content: 'Hello',
              delay: 0,
              image: [{ id: 'media', path: 'image.jpg' }],
            },
          ],
        },
        {
          integration: 'instagram-channel',
          settings: {},
          posts: [
            {
              id: 'ig-comment',
              parentPostId: 'ig-root',
              content: 'comment',
              delay: 0,
              image: [],
            },
            {
              id: 'ig-root',
              parentPostId: null,
              content: 'Hello',
              delay: 0,
              image: [],
            },
          ],
        },
      ],
    });
    useLaunchStore.getState().reset();
    useLaunchStore.getState().setAllIntegrations([xChannel, instagramChannel]);
    useLaunchStore.getState().setSelectedIntegrations([
      { selectedIntegrations: xChannel, settings: {} },
      { selectedIntegrations: instagramChannel, settings: {} },
    ]);
  });

  it('copies sibling media onto an Instagram root that was saved without attachments', () => {
    render(
      <AddEditModalInnerInner
        {...baseProps}
        integrations={[xChannel, instagramChannel]}
      />
    );

    const instagram = useLaunchStore
      .getState()
      .internal.find((item) => item.integration.id === 'instagram-channel');

    expect(instagram?.integrationValue.map((value) => value.id)).toEqual([
      'ig-root',
      'ig-comment',
    ]);
    expect(instagram?.integrationValue[0].media).toEqual([
      { id: 'media', path: 'image.jpg' },
    ]);
    expect(instagram?.integrationValue[1].media).toEqual([]);
  });
});

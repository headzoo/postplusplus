/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  attachRootPostReference,
  postReferenceSnapshotKey,
  serializePostReferenceForPublish,
} from './post-reference.types';
import { PostReferencePreviewCard } from './post-reference.preview';
import { useLaunchStore } from './store';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const quoteReference = {
  type: 'quote' as const,
  providerIdentifier: 'x',
  externalId: '1234567890',
  url: 'https://x.com/user/status/1234567890',
  preview: {
    authorName: 'Jane Doe',
    authorUsername: 'jane',
    content: 'Quoted status text',
  },
};

describe('post reference serialization', () => {
  it('serializes publish fields without preview data', () => {
    expect(serializePostReferenceForPublish(quoteReference)).toEqual({
      type: 'quote',
      providerIdentifier: 'x',
      externalId: '1234567890',
      url: 'https://x.com/user/status/1234567890',
    });
  });

  it('attaches reference only to the root post value', () => {
    const post = {
      integration: { id: 'x-channel' },
      group: 'group-1',
      settings: {},
      value: [
        { content: 'root', delay: 0, image: [] },
        { content: 'thread', delay: 1, image: [] },
      ],
    };

    expect(attachRootPostReference(post, quoteReference)).toEqual({
      ...post,
      value: [
        {
          content: 'root',
          delay: 0,
          image: [],
          reference: serializePostReferenceForPublish(quoteReference),
        },
        { content: 'thread', delay: 1, image: [] },
      ],
    });
  });

  it('changes composer snapshot key when reference identity changes', () => {
    const first = postReferenceSnapshotKey(quoteReference);
    const second = postReferenceSnapshotKey({
      ...quoteReference,
      externalId: '999',
    });

    expect(first).not.toEqual(second);
  });
});

describe('PostReferencePreviewCard', () => {
  it('renders preview content and removes reference on button click', () => {
    useLaunchStore.getState().reset();
    useLaunchStore.getState().setPostReference(quoteReference);

    const onRemove = jest.fn();

    render(
      <PostReferencePreviewCard
        preview={quoteReference.preview!}
        onRemove={onRemove}
      />
    );

    expect(
      screen.getByRole('region', { name: 'Quoted post preview' })
    ).toBeTruthy();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('@jane')).toBeTruthy();
    expect(screen.getByText('Quoted status text')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove quoted post' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('ManageModal quote guards', () => {
  it('treats an active quote reference as unsaved composer state', () => {
    useLaunchStore.getState().reset();
    useLaunchStore.getState().setPostReference(quoteReference);

    const hasUnsaved =
      !!useLaunchStore.getState().postReference ||
      useLaunchStore.getState().global.some((value) => value.content.trim());

    expect(hasUnsaved).toBe(true);
  });

  it('forces manual publishing mode when quote reference is active', () => {
    useLaunchStore.getState().reset();
    useLaunchStore.getState().setPublishingMode('pipeline');
    useLaunchStore.getState().setPipelineId('pipeline-1');
    useLaunchStore.getState().setPostReference(quoteReference);

    if (useLaunchStore.getState().postReference) {
      useLaunchStore.getState().setPublishingMode('manual');
      useLaunchStore.getState().setPipelineId(undefined);
    }

    expect(useLaunchStore.getState().publishingMode).toBe('manual');
    expect(useLaunchStore.getState().pipelineId).toBeUndefined();
  });
});

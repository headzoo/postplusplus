/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { PipelineQueue } from './pipeline.queue';
import {
  PipelineDetail,
  PipelineQueueItem,
} from '@gitroom/frontend/components/pipelines/pipeline.types';

jest.mock('react-dnd', () => ({
  useDrag: () => [{ isDragging: false }, jest.fn()],
  useDrop: () => [{}, jest.fn()],
}));

jest.mock('@mantine/hooks', () => ({
  useClickOutside: () => ({ current: null }),
}));

jest.mock('@gitroom/frontend/components/launches/helpers/dnd.provider', () => ({
  DNDProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: jest.fn() }),
  useDecisionModal: () => ({ open: jest.fn() }),
}));

jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

jest.mock('@gitroom/react/form/button', () => ({
  Button: ({
    children,
    secondary: _secondary,
    ...props
  }: React.ComponentProps<'button'> & { secondary?: boolean }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  ADD_EDIT_MODAL_OPTIONS: {},
  AddEditModal: () => null,
}));

jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({
    ExistingDataContextProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => children,
  })
);

jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (path: string) => path }),
}));

jest.mock('@gitroom/react/helpers/video.or.image', () => ({
  VideoOrImage: () => null,
}));

jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@gitroom/helpers/utils/strip.html.validation', () => ({
  stripHtmlValidation: (_mode: string, content: string) => content,
}));

jest.mock('./use.pipeline.queue.order', () => ({
  useReorderPipelineQueue: () => jest.fn(),
}));

jest.mock('./pipeline.copy.to.modal', () => ({
  PipelineCopyToModal: () => null,
}));

const integration = {
  id: 'channel',
  name: 'Channel',
  display: 'Channel',
  identifier: 'x',
  picture: '',
} as any;

const queueItem = (
  id: string,
  status: PipelineQueueItem['status'],
  position: number,
  statusDate?: string
): PipelineQueueItem => ({
  id,
  group: id,
  status,
  position,
  posts: [
    {
      id: `${id}-post`,
      content: `${id} content`,
      delay: 0,
      integration,
    },
  ],
  ...(status === 'PUBLISHING' ? { claimedAt: statusDate } : {}),
  ...(status === 'FAILED' ? { failedAt: statusDate } : {}),
  ...(status === 'PUBLISHED' ? { publishedAt: statusDate } : {}),
});

const pipeline: PipelineDetail = {
  id: 'pipeline',
  name: 'Pipeline',
  timezone: 'UTC',
  color: '#eb3825',
  active: true,
  scheduleRevision: 1,
  channels: [integration],
  queueCount: 1,
  scheduleSlots: [],
  integrations: [],
  blockedContextDocuments: [],
  queueItems: [
    queueItem('queued', 'QUEUED', 1),
    queueItem('publishing-old', 'PUBLISHING', 2, '2026-10-09T12:00:00.000Z'),
    queueItem('publishing-new', 'PUBLISHING', 3, '2026-10-11T12:00:00.000Z'),
    queueItem('failed-old', 'FAILED', 4, '2026-10-08T12:00:00.000Z'),
    queueItem('failed-new', 'FAILED', 5, '2026-10-10T12:00:00.000Z'),
    queueItem('published', 'PUBLISHED', 6, '2026-10-07T12:00:00.000Z'),
  ],
  projections: [],
};

describe('PipelineQueue status panels', () => {
  it('separates queue, publishing, failed, and published items', () => {
    render(
      <PipelineQueue
        pipeline={pipeline}
        pipelines={[pipeline]}
        mutate={jest.fn()}
      />
    );

    const queue = screen.getByRole('region', { name: 'Queue' });
    const publishing = screen.getByRole('region', { name: 'Publishing' });
    const failed = screen.getByRole('region', { name: 'Failed' });
    const published = screen.getByRole('region', { name: 'Published' });

    expect(within(queue).getByText('queued content')).toBeTruthy();
    expect(within(queue).queryByText('publishing-new content')).toBeNull();
    expect(within(publishing).getByText('publishing-new content')).toBeTruthy();
    expect(within(failed).getByText('failed-new content')).toBeTruthy();
    expect(within(published).getByText('published content')).toBeTruthy();
  });

  it('lists publishing and failed items newest first', () => {
    render(
      <PipelineQueue
        pipeline={pipeline}
        pipelines={[pipeline]}
        mutate={jest.fn()}
      />
    );

    const publishingText = screen.getByRole('region', {
      name: 'Publishing',
    }).textContent!;
    const failedText = screen.getByRole('region', {
      name: 'Failed',
    }).textContent!;

    expect(publishingText.indexOf('publishing-new content')).toBeLessThan(
      publishingText.indexOf('publishing-old content')
    );
    expect(failedText.indexOf('failed-new content')).toBeLessThan(
      failedText.indexOf('failed-old content')
    );
  });
});

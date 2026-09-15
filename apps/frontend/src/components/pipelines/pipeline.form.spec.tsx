/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PipelineForm } from './pipeline.form';
import { PIPELINE_REFERENCE_IMAGE_LIMIT } from './pipeline-reference-image.picker';

const updatePipeline = jest.fn();
const createPipeline = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: jest.fn() }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/react/form/button', () => ({
  Button: ({ children, secondary: _secondary, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));
jest.mock('@gitroom/react/form/input', () => ({
  Input: ({
    label,
    disableForm: _disableForm,
    translationKey: _translationKey,
    ...props
  }: any) => (
    <label>
      {label}
      <input {...props} />
    </label>
  ),
}));
jest.mock('@gitroom/react/form/select', () => ({
  Select: ({
    label,
    children,
    disableForm: _disableForm,
    translationKey: _translationKey,
    ...props
  }: any) => (
    <label>
      {label}
      <select {...props}>{children}</select>
    </label>
  ),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({
      data: [{ id: 'channel', disabled: false }],
      isLoading: false,
    }),
  })
);
jest.mock(
  '@gitroom/frontend/components/launches/helpers/pick.platform.component',
  () => ({
    PickPlatforms: () => null,
  })
);
jest.mock('./use.pipeline.create', () => ({
  useCreatePipeline: () => createPipeline,
}));
jest.mock('./use.pipeline.update', () => ({
  useUpdatePipeline: () => updatePipeline,
}));
jest.mock(
  '@gitroom/frontend/components/context-documents/context-document.assignment-picker',
  () => ({
    ContextDocumentAssignmentPicker: ({
      selectedIds,
      onChange,
      knownDocuments,
    }: any) => (
      <div>
        <output data-testid="selected-ids">{selectedIds.join(',')}</output>
        <output data-testid="known-documents">
          {knownDocuments.map((document: any) => document.id).join(',')}
        </output>
        <button type="button" onClick={() => onChange(['brand-guide'])}>
          Remove legacy skill
        </button>
      </div>
    ),
  })
);

let mockMaxSelection: number | undefined;
const openModal = jest.fn();

jest.mock('./pipeline-reference-image.picker', () => {
  const actual = jest.requireActual('./pipeline-reference-image.picker');
  return {
    ...actual,
    PipelineReferenceImagePicker: ({
      selectedImages,
      onChange,
    }: {
      selectedImages: any[];
      onChange: (images: any[]) => void;
    }) => (
      <div>
        <output data-testid="reference-image-ids">
          {selectedImages.map((image) => image.id).join(',')}
        </output>
        <output data-testid="reference-image-count">
          {selectedImages.length}
        </output>
        <button
          type="button"
          onClick={() =>
            onChange([
              { id: 'img-a', name: 'a.png', path: '/a.png' },
              { id: 'img-b', name: 'b.png', path: '/b.png' },
              { id: 'img-c', name: 'c.png', path: '/c.png' },
            ])
          }
        >
          Select three references
        </button>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...selectedImages,
              { id: 'img-d', name: 'd.png', path: '/d.png' },
            ])
          }
        >
          Attempt fourth reference
        </button>
        <button
          type="button"
          onClick={() =>
            onChange(selectedImages.filter((image) => image.id !== 'img-a'))
          }
        >
          Remove first reference
        </button>
        <button
          type="button"
          onClick={() =>
            onChange([
              { id: 'img-b', name: 'b.png', path: '/b.png' },
              { id: 'img-x', name: 'x.png', path: '/x.png' },
            ])
          }
        >
          Replace references
        </button>
        <button
          type="button"
          onClick={() => {
            mockMaxSelection =
              actual.PIPELINE_REFERENCE_IMAGE_LIMIT - selectedImages.length;
            openModal();
          }}
        >
          Open image picker
        </button>
      </div>
    ),
  };
});

jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MediaBox: ({
    type,
    maxSelection,
  }: {
    type?: string;
    maxSelection?: number;
  }) => (
    <div
      data-testid="media-box"
      data-type={type}
      data-max={maxSelection ?? ''}
    />
  ),
}));

const pipeline: any = {
  id: 'pipeline',
  name: 'Weekly updates',
  timezone: 'UTC',
  color: '#612BD3',
  active: true,
  scheduleRevision: 1,
  channels: [{ id: 'channel', disabled: false }],
  queueCount: 0,
  contextDocuments: [
    {
      id: 'brand-guide',
      name: 'brand-guide.md',
      fileSize: 1024,
      updatedAt: '2026-08-10T00:00:00.000Z',
    },
  ],
  blockedContextDocuments: [
    {
      id: 'legacy-skill',
      name: 'campaign-review.skill.md',
      fileSize: 4096,
      updatedAt: '2026-08-11T00:00:00.000Z',
    },
  ],
  referenceImages: [
    {
      id: 'img-a',
      name: 'a.png',
      originalName: 'Brand A.png',
      path: '/a.png',
    },
    {
      id: 'img-b',
      name: 'b.png',
      originalName: 'Brand B.png',
      path: '/b.png',
    },
  ],
  scheduleSlots: [],
  integrations: [],
  queueItems: [],
  projections: [],
};

describe('PipelineForm', () => {
  beforeEach(() => {
    updatePipeline.mockReset().mockResolvedValue({});
    createPipeline.mockReset().mockResolvedValue({});
    openModal.mockReset();
    mockMaxSelection = undefined;
  });

  it('requires explicit removal of blocked assignments from the detail response', async () => {
    render(<PipelineForm pipeline={pipeline} onSaved={jest.fn()} />);

    expect(screen.getByTestId('selected-ids').textContent).toBe(
      'brand-guide,legacy-skill'
    );
    expect(screen.getByTestId('known-documents').textContent).toBe(
      'brand-guide,legacy-skill'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.getByText(
        'Deselect blocked agent skill assignments before saving this Pipeline.'
      )
    ).toBeTruthy();
    expect(updatePipeline).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove legacy skill' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updatePipeline).toHaveBeenCalledWith(
        'pipeline',
        expect.objectContaining({
          contextDocumentIds: ['brand-guide'],
          referenceImageIds: ['img-a', 'img-b'],
        })
      )
    );
  });

  it('initializes reference images from the pipeline detail response', () => {
    render(<PipelineForm pipeline={pipeline} onSaved={jest.fn()} />);

    expect(screen.getByTestId('reference-image-ids').textContent).toBe(
      'img-a,img-b'
    );
  });

  it('submits ordered referenceImageIds after selecting up to three images', async () => {
    render(<PipelineForm pipeline={pipeline} onSaved={jest.fn()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove legacy skill' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select three references' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updatePipeline).toHaveBeenCalledWith(
        'pipeline',
        expect.objectContaining({
          referenceImageIds: ['img-a', 'img-b', 'img-c'],
        })
      )
    );
  });

  it('blocks saving when more than three reference images are selected', async () => {
    render(<PipelineForm pipeline={pipeline} onSaved={jest.fn()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove legacy skill' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select three references' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Attempt fourth reference' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      screen.getByText('A Pipeline can have at most three reference images.')
    ).toBeTruthy();
    expect(updatePipeline).not.toHaveBeenCalled();
  });

  it('supports removal and replacement of reference images', async () => {
    render(<PipelineForm pipeline={pipeline} onSaved={jest.fn()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove legacy skill' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove first reference' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updatePipeline).toHaveBeenCalledWith(
        'pipeline',
        expect.objectContaining({ referenceImageIds: ['img-b'] })
      )
    );

    updatePipeline.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Replace references' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updatePipeline).toHaveBeenCalledWith(
        'pipeline',
        expect.objectContaining({ referenceImageIds: ['img-b', 'img-x'] })
      )
    );
  });

  it('submits an empty referenceImageIds array when none are selected', async () => {
    render(
      <PipelineForm
        pipeline={{
          ...pipeline,
          referenceImages: [],
          contextDocuments: [],
          blockedContextDocuments: [],
        }}
        onSaved={jest.fn()}
      />
    );

    expect(screen.getByTestId('reference-image-count').textContent).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updatePipeline).toHaveBeenCalledWith(
        'pipeline',
        expect.objectContaining({ referenceImageIds: [] })
      )
    );
  });

  it('opens the image-only media picker with remaining capacity', () => {
    render(<PipelineForm pipeline={pipeline} onSaved={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open image picker' }));

    expect(mockMaxSelection).toBe(
      PIPELINE_REFERENCE_IMAGE_LIMIT - pipeline.referenceImages.length
    );
  });
});

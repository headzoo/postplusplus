/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PipelineForm } from './pipeline.form';

const updatePipeline = jest.fn();

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
  useCreatePipeline: () => jest.fn(),
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
  scheduleSlots: [],
  integrations: [],
  queueItems: [],
  projections: [],
};

describe('PipelineForm', () => {
  beforeEach(() => {
    updatePipeline.mockReset().mockResolvedValue({});
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
        expect.objectContaining({ contextDocumentIds: ['brand-guide'] })
      )
    );
  });
});

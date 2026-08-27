/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContextDocumentAssignmentPicker } from './context-document.assignment-picker';

const onChange = jest.fn();

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
jest.mock('@gitroom/react/form/button', () => ({
  Button: ({ children, secondary: _secondary, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));
jest.mock('@gitroom/react/form/checkbox', () => ({
  Checkbox: ({ checked, onChange }: any) => (
    <input
      aria-label="Select document"
      type="checkbox"
      checked={checked}
      onChange={onChange}
    />
  ),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => null,
}));
jest.mock('./use.context-document.list', () => ({
  useContextDocumentList: () => ({
    data: [
      {
        id: 'brand-guide',
        name: 'brand-guide.md',
        fileSize: 1024,
        updatedAt: '2026-08-10T00:00:00.000Z',
      },
    ],
    isLoading: false,
  }),
}));

describe('ContextDocumentAssignmentPicker', () => {
  beforeEach(() => {
    onChange.mockReset();
  });

  it('renders a legacy skill from a pipeline detail response as selected and removable', () => {
    render(
      <ContextDocumentAssignmentPicker
        selectedIds={['legacy-skill']}
        onChange={onChange}
        knownDocuments={[
          {
            id: 'legacy-skill',
            name: 'campaign-review.skill.md',
            fileSize: 4096,
            updatedAt: '2026-08-11T12:00:00.000Z',
          },
        ]}
      />
    );

    expect(screen.getByText('campaign-review.skill.md')).toBeTruthy();
    expect(screen.getByText('Skill')).toBeTruthy();
    expect(
      screen.getByText(
        'Skills cannot be attached to Pipelines. Deselect this skill before saving.'
      )
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: /campaign-review\.skill\.md/i })
    );
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

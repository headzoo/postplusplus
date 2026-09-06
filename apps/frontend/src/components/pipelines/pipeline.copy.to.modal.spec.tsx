/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PipelineCopyToModal } from './pipeline.copy.to.modal';
import { PipelineSummary } from './pipeline.types';

const closeCurrent = jest.fn();
const onCopy = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeCurrent }),
}));

jest.mock('@gitroom/react/form/button', () => ({
  Button: ({
    children,
    secondary: _secondary,
    loading: _loading,
    ...props
  }: {
    children: React.ReactNode;
    secondary?: boolean;
    loading?: boolean;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@gitroom/react/form/select', () => ({
  Select: ({
    children,
    label,
    value,
    onChange,
    name,
  }: {
    children: React.ReactNode;
    label: string;
    value: string;
    onChange: (event: { target: { value: string } }) => void;
    name: string;
    disableForm?: boolean;
    hideErrors?: boolean;
  }) => (
    <label>
      {label}
      <select name={name} value={value} onChange={onChange}>
        {children}
      </select>
    </label>
  ),
}));

const destinations: PipelineSummary[] = [
  {
    id: 'pipeline-b',
    name: 'Pipeline B',
    timezone: 'UTC',
    color: '#000000',
    active: true,
    channels: [],
    queueCount: 1,
  },
  {
    id: 'pipeline-c',
    name: 'Pipeline C',
    timezone: 'UTC',
    color: '#111111',
    active: true,
    channels: [],
    queueCount: 0,
  },
];

describe('PipelineCopyToModal', () => {
  beforeEach(() => {
    closeCurrent.mockReset();
    onCopy.mockReset();
    onCopy.mockResolvedValue(undefined);
  });

  it('lists destination Pipelines and copies the selected one', async () => {
    render(<PipelineCopyToModal destinations={destinations} onCopy={onCopy} />);

    expect(screen.getByRole('option', { name: 'Pipeline B' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Pipeline C' })).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'pipeline-c' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(onCopy).toHaveBeenCalledWith('pipeline-c');
    expect(closeCurrent).toHaveBeenCalled();
  });

  it('shows an empty state when no destinations are available', () => {
    render(<PipelineCopyToModal destinations={[]} onCopy={onCopy} />);

    expect(
      screen.getByText(
        'No other Pipelines share the same channel set. Create another Pipeline with the same channels to copy here.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closeCurrent).toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();
  });
});

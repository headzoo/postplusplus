/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LeadDismissModal } from './lead.dismiss.modal';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string, params?: Record<string, unknown>) => {
    if (!params) {
      return fallback;
    }
    return Object.entries(params).reduce(
      (result, [name, value]) =>
        result.replace(new RegExp(`{{${name}}}`, 'g'), String(value)),
      fallback
    );
  },
}));

const closeCurrent = jest.fn();

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeCurrent }),
}));

jest.mock('@gitroom/react/form/checkbox', () => ({
  Checkbox: ({
    checked,
    label,
    onChange,
  }: {
    checked?: boolean;
    label?: string;
    onChange?: () => void;
  }) => (
    <label>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={() => onChange?.()}
      />
      {label}
    </label>
  ),
}));

jest.mock('@gitroom/react/form/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

jest.mock('@gitroom/react/form/select', () => ({
  Select: ({
    label,
    children,
    onChange,
  }: {
    label?: string;
    children?: React.ReactNode;
    onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  }) => (
    <label>
      {label}
      <select onChange={onChange}>{children}</select>
    </label>
  ),
}));

describe('LeadDismissModal', () => {
  beforeEach(() => {
    closeCurrent.mockReset();
  });

  it('keeps confirm disabled until a reason is selected', () => {
    const resolution = jest.fn();
    render(<LeadDismissModal resolution={resolution} />);

    expect(
      (screen.getByRole('button', { name: 'Remove Lead' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Words or claims in the bio' })
    );

    expect(
      (screen.getByRole('button', { name: 'Remove Lead' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Lead' }));

    expect(resolution).toHaveBeenCalledWith({
      action: 'remove',
      reasons: ['bio_wording'],
    });
    expect(closeCurrent).toHaveBeenCalled();
  });

  it('snoozes without requiring dismiss reasons', () => {
    const resolution = jest.fn();
    render(<LeadDismissModal resolution={resolution} />);

    fireEvent.click(screen.getByRole('button', { name: 'Snooze 7 days' }));

    expect(resolution).toHaveBeenCalledWith({ action: 'snooze' });
    expect(closeCurrent).toHaveBeenCalled();
  });

  it('resolves null when cancelled', () => {
    const resolution = jest.fn();
    render(<LeadDismissModal resolution={resolution} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(resolution).toHaveBeenCalledWith(null);
    expect(closeCurrent).toHaveBeenCalled();
  });

  it('shows Follow only when the channel supports it', () => {
    const resolution = jest.fn();
    const { rerender } = render(
      <LeadDismissModal resolution={resolution} canFollow={false} />
    );

    expect(screen.queryByRole('button', { name: 'Follow' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Add to followed' })).toBeNull();

    rerender(<LeadDismissModal resolution={resolution} canFollow={true} />);

    expect(screen.getByRole('heading', { name: 'Add to followed' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));

    expect(resolution).toHaveBeenCalledWith({ action: 'follow' });
    expect(closeCurrent).toHaveBeenCalled();
  });

  it('separates remove-from-leads heading from the reason prompt', () => {
    render(<LeadDismissModal resolution={jest.fn()} />);

    expect(screen.getByRole('heading', { name: 'Remove from Leads' })).toBeTruthy();
    expect(screen.getByText('Choose why they are not a lead')).toBeTruthy();
  });

  it('resolves moveToList when a custom list is selected', () => {
    const resolution = jest.fn();
    render(
      <LeadDismissModal
        resolution={resolution}
        lists={[{ id: 'list-1', name: 'VIP', createdAt: '', updatedAt: '' }]}
      />
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'list-1' },
    });

    expect(resolution).toHaveBeenCalledWith({
      action: 'moveToList',
      listId: 'list-1',
    });
    expect(closeCurrent).toHaveBeenCalled();
  });
});

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
});

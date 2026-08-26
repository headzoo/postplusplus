/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Webhooks } from './webhooks';

const fetchMock = jest.fn();
const openModal = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => fetchMock,
}));

jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: [
      {
        id: 'hook-1',
        name: 'CRM Hook',
        url: 'https://example.com/hook',
      },
    ],
    mutate: jest.fn(),
  }),
}));

jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({
    tier: {
      webhooks: 5,
    },
  }),
}));

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal,
    closeAll: jest.fn(),
  }),
}));

jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));

jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: jest.fn(),
}));

jest.mock('@gitroom/frontend/components/settings/logs.component', () => ({
  WebhookLogsPanel: () => <div>Webhook logs panel</div>,
}));

describe('Webhooks', () => {
  beforeEach(() => {
    openModal.mockClear();
  });

  it('shows the webhook list with + Add and Logs buttons', () => {
    render(<Webhooks />);

    expect(screen.getByText('CRM Hook')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Logs' })).toBeTruthy();
  });

  it('switches to logs view and hides + Add', () => {
    render(<Webhooks />);

    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));

    expect(screen.getByText('Webhook logs panel')).toBeTruthy();
    expect(screen.queryByText('CRM Hook')).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Add' })).toBeNull();
  });

  it('returns to the webhook list when Logs is clicked again', () => {
    render(<Webhooks />);

    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));

    expect(screen.getByText('CRM Hook')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add' })).toBeTruthy();
    expect(screen.queryByText('Webhook logs panel')).toBeNull();
  });

  it('opens the add webhook modal from + Add', () => {
    render(<Webhooks />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));

    expect(openModal).toHaveBeenCalledTimes(1);
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));

jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback || key,
}));

jest.mock('./use.passkey-status', () => ({
  usePasskeyStatus: () => ({
    data: { enrolled: false, verified: false, expiresAt: null },
    error: undefined,
    mutate: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock('@gitroom/frontend/components/admin/admin-passkey.utils', () => ({
  registrationOptionsToCredentialOptions: jest.fn(),
  assertionOptionsToCredentialOptions: jest.fn(),
  serializeRegistrationCredential: jest.fn(),
  serializeAssertionCredential: jest.fn(),
}));

import PasskeySettingsComponent from './passkey-settings.component';

describe('PasskeySettingsComponent', () => {
  it('renders enable passkey controls when not enrolled', () => {
    render(<PasskeySettingsComponent />);
    expect(screen.getByText('Passkey')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Enable passkey' })
    ).toBeInTheDocument();
  });
});

/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LogoutComponent } from './logout.component';

const mockFetch = jest.fn();
const mockSetCookie = jest.fn();

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ isGeneral: true, isSecured: false }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: jest.fn().mockResolvedValue(true),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/layout/layout.context', () => ({
  setCookie: (...args: unknown[]) => mockSetCookie(...args),
}));

describe('LogoutComponent', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    mockFetch.mockReset();
    mockSetCookie.mockReset();
    delete (window as { location?: Location }).location;
    window.location = { href: '' } as Location;
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('clears mirrored admin_auth alongside auth during local logout', async () => {
    render(<LogoutComponent />);

    fireEvent.click(screen.getByText('Logout'));

    await Promise.resolve();

    expect(mockSetCookie).toHaveBeenCalledWith('auth', '', -10);
    expect(mockSetCookie).toHaveBeenCalledWith('admin_auth', '', -10);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(window.location.href).toBe('/');
  });
});

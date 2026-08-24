/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useDismissedAlerts } from './use.dismissed.alerts';

const fetchMock = jest.fn();

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => fetchMock,
}));

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children
  );

describe('useDismissedAlerts', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('loads dismissed alert keys', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ keys: ['followers.triage.hot'] }),
    });

    const { result } = renderHook(() => useDismissedAlerts(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual({ keys: ['followers.triage.hot'] });
    });
    expect(fetchMock).toHaveBeenCalledWith('/user/dismissed-alerts');
  });

  it('optimistically dismisses an alert key', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: ['followers.triage.hot'] }),
      });

    const { result } = renderHook(() => useDismissedAlerts(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual({ keys: [] });
    });

    await act(async () => {
      await result.current.dismissAlert('followers.triage.hot');
    });

    expect(result.current.data).toEqual({
      keys: ['followers.triage.hot'],
    });
    expect(fetchMock).toHaveBeenCalledWith('/user/dismissed-alerts', {
      method: 'POST',
      body: JSON.stringify({ alertKey: 'followers.triage.hot' }),
    });
  });

  it('rolls back optimistic dismiss when the request fails', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
      });

    const { result } = renderHook(() => useDismissedAlerts(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual({ keys: [] });
    });

    await act(async () => {
      await expect(
        result.current.dismissAlert('followers.triage.hot')
      ).rejects.toThrow('Failed to dismiss alert');
    });

    expect(result.current.data).toEqual({ keys: [] });
  });
});

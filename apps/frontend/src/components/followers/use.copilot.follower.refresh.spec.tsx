/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import { renderHook } from '@testing-library/react';
import { useCopilotFollowerRefresh } from './use.copilot.follower.refresh';

const properties: Record<string, unknown> = {};
const copilotApiConfig = { properties };
const mutateCache = jest.fn().mockResolvedValue(undefined);
const revalidateFollowerChannelCaches = jest.fn(
  (mutate: typeof mutateCache, integrationId: string) =>
    mutate(
      (key: unknown) =>
        typeof key === 'string' && key.includes(integrationId),
      undefined,
      { revalidate: true }
    )
);
let registeredAction: {
  name: string;
  handler: (args: { channelId?: string }) => Promise<unknown>;
} | null = null;

jest.mock('@copilotkit/react-core', () => ({
  useCopilotContext: () => ({ copilotApiConfig }),
  useCopilotAction: (action: {
    name: string;
    handler: (args: { channelId?: string }) => Promise<unknown>;
  }) => {
    registeredAction = action;
  },
}));

jest.mock('swr', () => ({
  useSWRConfig: () => ({ mutate: mutateCache }),
}));

jest.mock('./use.followers', () => ({
  revalidateFollowerChannelCaches: (
    mutate: typeof mutateCache,
    integrationId: string
  ) => revalidateFollowerChannelCaches(mutate, integrationId),
}));

describe('useCopilotFollowerRefresh', () => {
  beforeEach(() => {
    Object.keys(properties).forEach((key) => {
      delete properties[key];
    });
    mutateCache.mockClear();
    revalidateFollowerChannelCaches.mockClear();
    registeredAction = null;
  });

  it('registers refreshFollowerPage and revalidates caches for channelId', async () => {
    renderHook(() => useCopilotFollowerRefresh());

    expect(registeredAction?.name).toBe('refreshFollowerPage');
    await expect(
      registeredAction!.handler({ channelId: 'channel-1' })
    ).resolves.toEqual({ ok: true, channelId: 'channel-1' });
    expect(revalidateFollowerChannelCaches).toHaveBeenCalledWith(
      mutateCache,
      'channel-1'
    );
  });

  it('falls back to followerPage channel id from Copilot properties', async () => {
    properties.followerPage = {
      kind: 'list',
      route: '/followers',
      channel: { id: 'channel-from-context' },
      pagination: { size: 24, number: 1 },
    };
    renderHook(() => useCopilotFollowerRefresh());

    await expect(registeredAction!.handler({})).resolves.toEqual({
      ok: true,
      channelId: 'channel-from-context',
    });
    expect(revalidateFollowerChannelCaches).toHaveBeenCalledWith(
      mutateCache,
      'channel-from-context'
    );
  });

  it('rejects when channelId cannot be resolved', async () => {
    renderHook(() => useCopilotFollowerRefresh());

    await expect(registeredAction!.handler({})).rejects.toThrow(
      'channelId is required to refresh the followers UI'
    );
    expect(revalidateFollowerChannelCaches).not.toHaveBeenCalled();
  });
});

/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import { renderHook } from '@testing-library/react';
import {
  useActiveFollowerPage,
  useCopilotFollowerPageProperties,
} from './use.copilot.follower.page';

const properties: Record<string, unknown> = {};
const copilotApiConfig = { properties };

jest.mock('@copilotkit/react-core', () => ({
  useCopilotContext: () => ({ copilotApiConfig }),
}));

describe('useCopilotFollowerPageProperties', () => {
  beforeEach(() => {
    Object.keys(properties).forEach((key) => {
      delete properties[key];
    });
  });

  it('writes followerPage into CopilotKit request properties for the selected channel', () => {
    const followerPage = {
      kind: 'list' as const,
      route: '/followers',
      channel: { id: 'channel-1', name: 'Acme', platform: 'x' },
      availableLists: [{ id: 'list-1', name: 'Great' }],
      pagination: { size: 24, number: 1 },
    };

    const { unmount } = renderHook(() =>
      useCopilotFollowerPageProperties(followerPage)
    );

    expect(properties.followerPage).toEqual(followerPage);
    unmount();
    expect(properties.followerPage).toBeUndefined();
  });

  it('clears followerPage when the channel id is missing', () => {
    properties.followerPage = { leftover: true };
    renderHook(() =>
      useCopilotFollowerPageProperties({
        kind: 'list',
        route: '/followers',
        channel: { id: '' },
        pagination: { size: 24, number: 1 },
      })
    );

    expect(properties.followerPage).toBeUndefined();
  });

  it('publishes the active page to sibling views and clears it on unmount', () => {
    const channelOne = {
      kind: 'list' as const,
      route: '/followers',
      channel: { id: 'channel-1' },
      strategy: { id: 'lead_capture', version: 1 },
      pagination: { size: 24, number: 1 },
    };
    const channelTwo = {
      ...channelOne,
      channel: { id: 'channel-2' },
      strategy: { id: 'customer_support', version: 1 },
    };

    const { result, rerender, unmount } = renderHook(
      ({ page }) => {
        useCopilotFollowerPageProperties(page);
        return useActiveFollowerPage();
      },
      { initialProps: { page: channelOne } }
    );

    expect(result.current).toEqual(channelOne);

    rerender({ page: channelTwo });
    expect(result.current).toEqual(channelTwo);

    unmount();
    expect(properties.followerPage).toBeUndefined();
    expect(
      renderHook(() => useActiveFollowerPage()).result.current
    ).toBeNull();
  });

  it('does not publish a page without a selected channel', () => {
    const { result } = renderHook(() => {
      useCopilotFollowerPageProperties({
        kind: 'list',
        route: '/followers',
        channel: { id: '' },
        pagination: { size: 24, number: 1 },
      });
      return useActiveFollowerPage();
    });

    expect(result.current).toBeNull();
  });
});

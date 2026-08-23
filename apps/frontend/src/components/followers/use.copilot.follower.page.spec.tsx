/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import { renderHook } from '@testing-library/react';
import { useCopilotFollowerPageProperties } from './use.copilot.follower.page';

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
});

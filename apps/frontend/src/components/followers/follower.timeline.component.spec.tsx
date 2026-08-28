/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import { openExternalPost } from '@gitroom/frontend/components/external-post/open.external.post';

describe('follower timeline external post navigation', () => {
  it('reuses the shared named tab for subsequent post links', () => {
    const focus = jest.fn();
    const postTab = {
      closed: false,
      focus,
      location: { href: '' },
    } as unknown as Window;
    const open = jest.spyOn(window, 'open').mockReturnValue(postTab);

    openExternalPost('https://x.com/jane/status/1');
    openExternalPost('https://x.com/jane/status/2');

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      'https://x.com/jane/status/1',
      'postplusplus-external-post'
    );
    expect(postTab.location.href).toBe('https://x.com/jane/status/2');
    expect(focus).toHaveBeenCalledTimes(2);

    open.mockRestore();
  });
});

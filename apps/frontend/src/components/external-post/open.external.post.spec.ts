/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import {
  isSafeHttpUrl,
  openExternalPost,
} from '@gitroom/frontend/components/external-post/open.external.post';

describe('openExternalPost', () => {
  it('rejects non-HTTP(S) destinations', () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);

    openExternalPost('javascript:alert(1)');
    openExternalPost('data:text/html,hello');

    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('reuses the shared named tab for safe HTTP(S) URLs', () => {
    const focus = jest.fn();
    const postTab = {
      closed: false,
      focus,
      location: { href: '' },
    } as unknown as Window;
    const open = jest.spyOn(window, 'open').mockReturnValue(postTab);

    expect(isSafeHttpUrl('https://x.com/jane/status/1')).toBe(true);
    openExternalPost('https://x.com/jane/status/1');
    openExternalPost('http://example.com/post');

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      'https://x.com/jane/status/1',
      'postplusplus-external-post'
    );
    expect(postTab.location.href).toBe('http://example.com/post');
    expect(focus).toHaveBeenCalledTimes(2);

    open.mockRestore();
  });
});

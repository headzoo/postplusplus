/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import {
  EXTERNAL_POST_TAB_NAME,
  isSafeHttpUrl,
  openExternalPost,
  openExternalPostFromAnchor,
} from '@gitroom/frontend/components/external-post/open.external.post';

describe('openExternalPost', () => {
  const focus = jest.fn();
  let tab: { closed: boolean; focus: jest.Mock; location: { href: string } };
  let open: jest.SpyInstance;

  beforeEach(() => {
    focus.mockReset();
    tab = {
      closed: false,
      focus,
      location: { href: '' },
    };
    open = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  });

  afterEach(() => {
    tab.closed = true;
    open.mockRestore();
  });

  it('rejects non-HTTP(S) destinations', () => {
    openExternalPost('javascript:alert(1)');
    openExternalPost('data:text/html,hello');

    expect(open).not.toHaveBeenCalled();
  });

  it('reuses the shared named tab for safe HTTP(S) URLs', () => {
    expect(isSafeHttpUrl('https://x.com/jane/status/1')).toBe(true);
    openExternalPost('https://x.com/jane/status/1');
    openExternalPost('http://example.com/post');

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      'https://x.com/jane/status/1',
      EXTERNAL_POST_TAB_NAME
    );
    expect(tab.location.href).toBe('http://example.com/post');
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('falls back to the named tab when the existing window blocks navigation', () => {
    Object.defineProperty(tab, 'location', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });

    openExternalPost('https://x.com/jane/status/1');
    openExternalPost('https://x.com/jane/status/2');

    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenNthCalledWith(
      1,
      'https://x.com/jane/status/1',
      EXTERNAL_POST_TAB_NAME
    );
    expect(open).toHaveBeenNthCalledWith(
      2,
      'https://x.com/jane/status/2',
      EXTERNAL_POST_TAB_NAME
    );
  });

  it('intercepts anchor clicks so the named tab is reused', () => {
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();

    openExternalPostFromAnchor(
      { preventDefault, stopPropagation },
      'https://x.com/alex'
    );
    openExternalPostFromAnchor(
      { preventDefault, stopPropagation },
      'https://x.com/sam'
    );

    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(stopPropagation).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe('https://x.com/sam');
  });
});

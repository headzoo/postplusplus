/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React, { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { HelpDrawer } from './help.drawer';
import { SiteHeader } from '@gitroom/frontend/components/new-layout/site-header';
import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';
import { clearHelpUrl, readHelpFromLocation, syncHelpUrl } from './help.url';
import { useHelpManifest } from './use.help.manifest';
import { HelpManifest } from './help.types';
import {
  getDefaultHelpDrawerWidth,
  HELP_DRAWER_WIDTH_KEY,
} from './help.drawer.width';

jest.mock('remark-gfm', () => jest.fn());
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('./use.help.manifest', () => ({
  useHelpManifest: jest.fn(),
}));

jest.mock('@gitroom/frontend/components/layout/title', () => ({
  Title: () => <div>Title</div>,
}));

jest.mock('@gitroom/frontend/components/layout/streak.component', () => ({
  StreakComponent: jest.fn(() => null),
}));

jest.mock('@gitroom/frontend/components/layout/organization.selector', () => ({
  OrganizationSelector: () => null,
}));

jest.mock('@gitroom/frontend/components/layout/chrome.extension.component', () => ({
  ChromeExtensionComponent: () => null,
}));

jest.mock('@gitroom/frontend/components/new-layout/sentry.feedback.component', () => ({
  AttachToFeedbackIcon: () => null,
}));

jest.mock('@gitroom/frontend/components/notifications/notification.component', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@gitroom/frontend/components/launches/new.post', () => ({
  NewPost: () => null,
}));

jest.mock('@gitroom/frontend/components/new-layout/header-more-menu', () => ({
  HeaderMoreMenu: () => null,
}));

const manifest: HelpManifest = {
  generated: true,
  pages: [
    {
      slug: 'calendar',
      title: 'Calendar',
      headings: [{ level: 2, title: 'Scheduling', anchor: 'scheduling' }],
      headingText: 'Scheduling',
      excerpt: 'Plan scheduled posts.',
      markdown: '# Calendar\n\n## Scheduling',
    },
  ],
};
const mockedManifest = jest.mocked(useHelpManifest);

describe('help.url', () => {
  const originalLocation = window.location;
  const replaceState = jest.fn();

  beforeEach(() => {
    replaceState.mockReset();
    Object.defineProperty(window, 'history', {
      configurable: true,
      value: { ...window.history, replaceState },
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://app.postiz.local/calendar?foo=bar#scheduling'),
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('reads help slug and hash from the current location', () => {
    expect(readHelpFromLocation(window.location)).toEqual({
      slug: null,
      hash: null,
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://app.postiz.local/calendar?foo=bar&help=calendar#scheduling'),
    });

    expect(readHelpFromLocation(window.location)).toEqual({
      slug: 'calendar',
      hash: 'scheduling',
    });
  });

  it('preserves pathname and unrelated query params when syncing help', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://app.postiz.local/calendar?foo=bar'),
    });

    syncHelpUrl({ slug: 'calendar', hash: 'scheduling' });

    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      '',
      'https://app.postiz.local/calendar?foo=bar&help=calendar#scheduling'
    );

    clearHelpUrl();

    expect(replaceState).toHaveBeenLastCalledWith(
      window.history.state,
      '',
      'https://app.postiz.local/calendar?foo=bar'
    );
  });

  it('restores the host hash when clearing help', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://app.postiz.local/calendar?foo=bar&help=calendar#scheduling'),
    });

    clearHelpUrl('host-section');

    expect(replaceState).toHaveBeenLastCalledWith(
      window.history.state,
      '',
      'https://app.postiz.local/calendar?foo=bar#host-section'
    );
  });
});

describe('HelpDrawer', () => {
  const triggerRef = createRef<HTMLButtonElement>();

  beforeEach(() => {
    mockedManifest.mockReturnValue({
      data: manifest,
      error: undefined,
      isLoading: false,
    } as ReturnType<typeof useHelpManifest>);
    document.body.style.overflow = '';
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://app.postiz.local/calendar?foo=bar'),
    });
  });

  it('renders an accessible dialog with responsive width classes', () => {
    render(
      <HelpDrawer open onClose={jest.fn()} triggerRef={triggerRef} />
    );

    const dialog = screen.getByRole('dialog', { name: 'Help' });
    expect((dialog as HTMLElement).style.width).toBe(
      `${getDefaultHelpDrawerWidth()}px`
    );
    expect(dialog.className).toContain('mobile:w-full');
    expect(dialog.className).toContain('bg-newColColor');
    expect(dialog.className).toContain('shadow-menu');
    expect(dialog.className).toContain('border-newSep');
    expect(dialog.className).toContain('translate-x-0');
    expect(
      screen.getByRole('separator', { name: 'Resize help panel' })
    ).toBeTruthy();
  });

  it('restores panel width from localStorage', () => {
    localStorage.setItem(HELP_DRAWER_WIDTH_KEY, '420');

    render(
      <HelpDrawer open onClose={jest.fn()} triggerRef={triggerRef} />
    );

    expect(
      (screen.getByRole('dialog', { name: 'Help' }) as HTMLElement).style.width
    ).toBe('420px');
  });

  it('resizes the panel on drag and persists the width', () => {
    localStorage.setItem(HELP_DRAWER_WIDTH_KEY, '400');

    render(
      <HelpDrawer open onClose={jest.fn()} triggerRef={triggerRef} />
    );

    const handle = screen.getByRole('separator', { name: 'Resize help panel' });
    fireEvent.mouseDown(handle, { button: 0, clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 450 });
    fireEvent.mouseUp(document, { clientX: 450 });

    expect(
      (screen.getByRole('dialog', { name: 'Help' }) as HTMLElement).style.width
    ).toBe('450px');
    expect(localStorage.getItem(HELP_DRAWER_WIDTH_KEY)).toBe('450');
  });

  it('closes on backdrop click and Escape while locking body scroll', () => {
    const onClose = jest.fn();
    render(
      <HelpDrawer open onClose={onClose} triggerRef={triggerRef} />
    );

    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();

    onClose.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close help' })[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('passes deep-link slug and hash from the current location', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://app.postiz.local/calendar?help=calendar#scheduling'),
    });

    render(
      <HelpDrawer open onClose={jest.fn()} triggerRef={triggerRef} />
    );

    expect(await screen.findByText('Calendar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('applies client navigation changes without browser history events', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://app.postiz.local/calendar?help=calendar#scheduling'),
    });

    const { rerender } = render(
      <HelpDrawer
        open
        onClose={jest.fn()}
        triggerRef={triggerRef}
        locationKey="/calendar?help=calendar"
      />
    );

    expect(await screen.findByText('Calendar')).toBeTruthy();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://app.postiz.local/calendar?help=pipelines'),
    });
    rerender(
      <HelpDrawer
        open
        onClose={jest.fn()}
        triggerRef={triggerRef}
        locationKey="/calendar?help=pipelines"
      />
    );

    expect(
      await screen.findByText('That help topic could not be found.')
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('restores focus to the help trigger when closed', () => {
    render(
      <>
        <button ref={triggerRef} type="button">
          Open help
        </button>
        <HelpDrawer open={false} onClose={jest.fn()} triggerRef={triggerRef} />
      </>
    );

    triggerRef.current?.focus();
    expect(document.activeElement).toBe(triggerRef.current);
  });

  it('traps Tab navigation inside the dialog', () => {
    render(<HelpDrawer open onClose={jest.fn()} triggerRef={triggerRef} />);

    const resizeHandle = screen.getByRole('separator', {
      name: 'Resize help panel',
    });
    const helpCenter = screen.getByRole('link', { name: /Help center/ });
    helpCenter.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(resizeHandle);

    resizeHandle.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(helpCenter);
  });
});

describe('SiteHeader help trigger', () => {
  it('shows help beside streak when streak is absent', () => {
    render(
      <SiteHeader
        showNewPost={false}
        onOpenSidebar={jest.fn()}
        onOpenHelp={jest.fn()}
      />
    );

    expect(screen.getAllByRole('button', { name: 'Help' })).toHaveLength(2);
    expect(StreakComponent).toHaveBeenCalled();
  });

  it('opens help from the desktop and mobile triggers', () => {
    const onOpenHelp = jest.fn();
    render(
      <SiteHeader
        showNewPost={false}
        onOpenSidebar={jest.fn()}
        onOpenHelp={onOpenHelp}
      />
    );

    const buttons = screen.getAllByRole('button', { name: 'Help' });
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(onOpenHelp).toHaveBeenCalledTimes(2);
  });
});

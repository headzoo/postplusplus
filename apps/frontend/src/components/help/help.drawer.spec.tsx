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
    expect(dialog.className).toContain('w-[35vw]');
    expect(dialog.className).toContain('mobile:w-full');
    expect(dialog.className).toContain('translate-x-0');
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

    const closeButton = screen.getAllByRole('button', { name: 'Close help' })[1];
    const topic = screen.getByRole('button', { name: /Calendar/ });
    topic.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    closeButton.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(topic);
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

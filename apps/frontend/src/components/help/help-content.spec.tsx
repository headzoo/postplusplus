/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { HelpContent } from './help-content';
import { HelpMarkdown } from './help.markdown';
import { HelpManifest } from './help.types';
import { useHelpManifest } from './use.help.manifest';

jest.mock('remark-gfm', () => jest.fn());
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ components }: any) => {
    const React = require('react');
    const H1 = components.h1;
    const H2 = components.h2;
    const Link = components.a;

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(H1, null, 'Calendar'),
      React.createElement(H2, null, 'Scheduling'),
      React.createElement(
        Link,
        { href: '/help/pipelines#queue' },
        'Pipeline help'
      ),
      React.createElement(Link, { href: '#scheduling' }, 'this section')
    );
  },
}));
jest.mock('./use.help.manifest', () => ({
  useHelpManifest: jest.fn(),
}));

jest.mock('./use.copilot.help.page', () => ({
  useCopilotHelpPageProperties: jest.fn(),
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
      markdown:
        '# Calendar\n\n## Scheduling\n\n[Pipeline help](/help/pipelines#queue) and [this section](#scheduling).',
    },
    {
      slug: 'pipelines',
      title: 'Pipelines',
      headings: [{ level: 2, title: 'Queue', anchor: 'queue' }],
      headingText: 'Queue',
      excerpt: 'Automate content queues.',
      markdown: '# Pipelines\n\n## Queue\n\nManage queued content.',
    },
  ],
};

const mockedManifest = jest.mocked(useHelpManifest);

describe('HelpContent', () => {
  beforeEach(() => {
    mockedManifest.mockReturnValue({
      data: manifest,
      error: undefined,
      isLoading: false,
    } as ReturnType<typeof useHelpManifest>);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('only requests the manifest while open', () => {
    const { rerender } = render(<HelpContent open={false} />);
    expect(mockedManifest).toHaveBeenLastCalledWith(false);

    rerender(<HelpContent open />);
    expect(mockedManifest).toHaveBeenLastCalledWith(true);
  });

  it('waits for drawer URL initialization before emitting the index entry', () => {
    const onEntryChange = jest.fn();
    const { rerender } = render(
      <HelpContent open initialized={false} onEntryChange={onEntryChange} />
    );

    expect(onEntryChange).not.toHaveBeenCalled();

    rerender(<HelpContent open initialized onEntryChange={onEntryChange} />);
    expect(onEntryChange).not.toHaveBeenCalled();
  });

  it('searches titles, headings, and excerpts', () => {
    render(<HelpContent open />);
    const input = screen.getByRole('searchbox', { name: 'Search help' });

    expect(screen.getByRole('button', { name: /Calendar/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Pipelines/ })).toBeTruthy();

    fireEvent.change(input, { target: { value: 'queue' } });
    expect(screen.queryByRole('button', { name: /Calendar Plan/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Pipelines/ })).toBeTruthy();

    fireEvent.change(input, { target: { value: 'scheduled' } });
    expect(screen.getByRole('button', { name: /Calendar/ })).toBeTruthy();
  });

  it('keeps the article view while typing in search until debounce settles', () => {
    jest.useFakeTimers();
    render(<HelpContent open />);

    fireEvent.click(screen.getByRole('button', { name: /Calendar Plan/ }));
    const articleSearch = screen.getByRole('searchbox', {
      name: 'Search help',
    }) as HTMLInputElement;

    fireEvent.change(articleSearch, { target: { value: 'queue' } });

    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(articleSearch.value).toBe('queue');
    expect(document.getElementById('help-search-article')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    const catalogSearch = screen.getByRole('searchbox', {
      name: 'Search help',
    }) as HTMLInputElement;
    expect(catalogSearch.id).toBe('help-search');
    expect(catalogSearch.value).toBe('queue');
    expect(screen.queryByRole('button', { name: /Calendar Plan/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Pipelines/ })).toBeTruthy();
    expect(document.activeElement).toBe(catalogSearch);

    jest.useRealTimers();
  });

  it('cancels article search navigation when the query is cleared', () => {
    jest.useFakeTimers();
    render(<HelpContent open />);

    fireEvent.click(screen.getByRole('button', { name: /Calendar Plan/ }));
    const articleSearch = screen.getByRole('searchbox', {
      name: 'Search help',
    });

    fireEvent.change(articleSearch, { target: { value: 'queue' } });
    fireEvent.change(articleSearch, { target: { value: '' } });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(document.getElementById('help-search-article')).toBeTruthy();

    jest.useRealTimers();
  });

  it('cancels article search navigation when Back is pressed', () => {
    jest.useFakeTimers();
    render(<HelpContent open />);

    fireEvent.click(screen.getByRole('button', { name: /Calendar Plan/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search help' }), {
      target: { value: 'queue' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    const catalogSearch = screen.getByRole('searchbox', {
      name: 'Search help',
    }) as HTMLInputElement;
    expect(catalogSearch.id).toBe('help-search');
    expect(catalogSearch.value).toBe('queue');
    expect(document.activeElement).not.toBe(catalogSearch);

    jest.useRealTimers();
  });

  it('opens FAQ rows into the mapped article and hash', () => {
    const onEntryChange = jest.fn();
    render(<HelpContent open onEntryChange={onEntryChange} />);

    fireEvent.click(
      screen.getByRole('button', { name: /How do I schedule a post\?/ })
    );

    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getAllByText('Calendar').length).toBeGreaterThan(0);
    expect(onEntryChange).toHaveBeenCalledWith({
      slug: 'calendar',
      hash: 'scheduling',
    });
  });

  it('shows a Help center footer that opens /help in a new tab', () => {
    render(<HelpContent open />);

    const helpCenter = screen.getByRole('link', { name: /Help center/ });
    expect(helpCenter.getAttribute('href')).toBe('/help');
    expect(helpCenter.getAttribute('target')).toBe('_blank');
    expect(helpCenter.getAttribute('rel')).toContain('noopener');
    expect(helpCenter.className).toContain('bg-newBgColor');
  });

  it('shows Topics and Frequently Asked Questions section headers', () => {
    render(<HelpContent open />);

    expect(
      screen.getByRole('heading', { name: 'Topics', level: 3 })
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', {
        name: 'Frequently Asked Questions',
        level: 3,
      })
    ).toBeTruthy();
  });

  it('renders topic one-liners without repeating the title prefix', () => {
    mockedManifest.mockReturnValue({
      data: {
        generated: true,
        pages: [
          {
            slug: 'calendar',
            title: 'Calendar',
            headings: [{ level: 2, title: 'Scheduling', anchor: 'scheduling' }],
            headingText: 'Scheduling',
            excerpt: 'Plan scheduled posts across channels.',
            markdown: '# Calendar\n\nPlan scheduled posts across channels.',
          },
        ],
      },
      error: undefined,
      isLoading: false,
    } as ReturnType<typeof useHelpManifest>);

    render(<HelpContent open />);
    expect(
      screen.getByText('Plan scheduled posts across channels.')
    ).toBeTruthy();
    expect(
      screen.queryByText(/Calendar Plan scheduled posts across channels/)
    ).toBeNull();
  });

  it('renders colorful topic thumbnail backgrounds', () => {
    render(<HelpContent open />);

    const calendarRow = screen.getByRole('button', { name: /Calendar/ });
    const thumbnail = calendarRow.querySelector('span');
    expect(thumbnail?.className).toContain('bg-[#1d9bf0]');
  });

  it('keeps article navigation in panel history', () => {
    render(<HelpContent open />);
    fireEvent.click(screen.getByRole('button', { name: /Calendar Plan/ }));
    fireEvent.click(screen.getByRole('link', { name: 'Pipeline help' }));

    // react-markdown is mocked with fixed copy; heading id comes from the active article.
    expect(
      screen.getByRole('heading', { name: 'Scheduling' }).getAttribute('id')
    ).toBe('queue');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Scheduling' }).getAttribute('id')
    ).toBe('scheduling');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('searchbox', { name: 'Search help' })).toBeTruthy();
  });

  it('shows a stale deep-link slug notice on the topic index', async () => {
    render(
      <HelpContent open initialSlug="missing-topic" onEntryChange={jest.fn()} />
    );

    expect(
      await screen.findByText('That help topic could not be found.')
    ).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search help' })).toBeTruthy();
  });

  it('warns when a deep-link fragment is missing from a valid article', async () => {
    render(
      <HelpContent
        open
        initialSlug="calendar"
        initialHash="missing-section"
        onEntryChange={jest.fn()}
      />
    );

    expect(
      await screen.findByText(
        'That section could not be found in this article.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });
});

describe('HelpMarkdown', () => {
  it('renders generated heading IDs and intercepts help links', () => {
    const onNavigate = jest.fn();
    const onHashChange = jest.fn();
    render(
      <HelpMarkdown
        article={manifest.pages[0]}
        onNavigate={onNavigate}
        onHashChange={onHashChange}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Scheduling' }).getAttribute('id')
    ).toBe('scheduling');
    fireEvent.click(screen.getByRole('link', { name: 'Pipeline help' }));
    expect(onNavigate).toHaveBeenCalledWith('pipelines', 'queue');

    fireEvent.click(screen.getByRole('link', { name: 'this section' }));
    expect(onHashChange).toHaveBeenCalledWith('scheduling');
  });
});

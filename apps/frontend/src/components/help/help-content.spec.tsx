/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.queryByRole('button', { name: /Calendar/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Pipelines/ })).toBeTruthy();

    fireEvent.change(input, { target: { value: 'scheduled' } });
    expect(screen.getByRole('button', { name: /Calendar/ })).toBeTruthy();
  });

  it('keeps article navigation in panel history', () => {
    render(<HelpContent open />);
    fireEvent.click(screen.getByRole('button', { name: /Calendar/ }));
    fireEvent.click(screen.getByRole('link', { name: 'Pipeline help' }));

    expect(screen.getByText('Pipelines')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
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
      await screen.findByText('That section could not be found in this article.')
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

    expect(screen.getByRole('heading', { name: 'Scheduling' }).getAttribute('id')).toBe(
      'scheduling'
    );
    fireEvent.click(screen.getByRole('link', { name: 'Pipeline help' }));
    expect(onNavigate).toHaveBeenCalledWith('pipelines', 'queue');

    fireEvent.click(screen.getByRole('link', { name: 'this section' }));
    expect(onHashChange).toHaveBeenCalledWith('scheduling');
  });
});

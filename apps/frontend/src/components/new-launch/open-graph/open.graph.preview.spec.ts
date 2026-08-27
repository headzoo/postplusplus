/**
 * @jest-environment ./jest.jsdom.environment.js
 */

jest.mock('canvas', () => ({}), { virtual: true });

import React from 'react';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import {
  extractFirstComposerUrl,
  normalizeComposerUrl,
} from './extract.first.composer.url';
import { useOpenGraphPreview } from './use.open.graph.preview';
import { ComposerOpenGraphPreview } from './open.graph.preview';
import { OpenGraphResponse } from './open.graph.types';

jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('use-debounce', () => ({
  useDebounce: jest.fn((value: string | null) => [value]),
}));

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: jest.fn(),
}));

const useSWR = jest.requireMock('swr').default as jest.Mock;
const { useDebounce } = jest.requireMock('use-debounce') as {
  useDebounce: jest.Mock;
};
const { useFetch } = jest.requireMock(
  '@gitroom/helpers/utils/custom.fetch'
) as { useFetch: jest.Mock };

const mockOpenGraphResponse = (
  overrides: Partial<OpenGraphResponse> = {}
): OpenGraphResponse => ({
  url: 'https://example.com/article',
  title: 'Example title',
  description: 'Example description',
  image: 'https://example.com/image.jpg',
  imageAlt: 'Example image',
  siteName: 'Example',
  ...overrides,
});

describe('normalizeComposerUrl', () => {
  it('accepts http and https URLs', () => {
    expect(normalizeComposerUrl('https://example.com')).toBe(
      'https://example.com/'
    );
    expect(normalizeComposerUrl('http://example.com/path')).toBe(
      'http://example.com/path'
    );
  });

  it('rejects non-http schemes', () => {
    expect(normalizeComposerUrl('ftp://example.com')).toBeNull();
    expect(normalizeComposerUrl('javascript:alert(1)')).toBeNull();
  });

  it('removes fragments and preserves query strings', () => {
    expect(normalizeComposerUrl('https://example.com/page?q=1#section')).toBe(
      'https://example.com/page?q=1'
    );
  });
});

describe('extractFirstComposerUrl', () => {
  it('prefers the first anchor href over later plain-text URLs', () => {
    expect(
      extractFirstComposerUrl(
        '<p>Visit https://first.com and <a href="https://second.com">link</a></p>'
      )
    ).toBe('https://second.com/');
  });

  it('returns the first valid anchor when multiple links exist', () => {
    expect(
      extractFirstComposerUrl(
        '<a href="https://first.com">First</a><a href="https://second.com">Second</a>'
      )
    ).toBe('https://first.com/');
  });

  it('extracts plain-text URLs for normal editor content without anchors', () => {
    expect(extractFirstComposerUrl('Check out https://example.com/news')).toBe(
      'https://example.com/news'
    );
  });

  it('trims trailing punctuation from detected URLs', () => {
    expect(extractFirstComposerUrl('Read https://example.com.')).toBe(
      'https://example.com/'
    );
    expect(extractFirstComposerUrl('Read https://example.com)!')).toBe(
      'https://example.com/'
    );
  });

  it('returns null for empty, invalid, or unsupported content', () => {
    expect(extractFirstComposerUrl('')).toBeNull();
    expect(extractFirstComposerUrl(null)).toBeNull();
    expect(extractFirstComposerUrl('ftp://example.com')).toBeNull();
    expect(extractFirstComposerUrl('no links here')).toBeNull();
  });
});

describe('useOpenGraphPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDebounce.mockImplementation((value: string | null) => [value]);
    useFetch.mockReturnValue(jest.fn());
    useSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
    });
  });

  it('disables SWR when no URL is present', () => {
    renderHook(() => useOpenGraphPreview('plain text'));

    expect(useSWR).toHaveBeenCalledWith(
      null,
      expect.any(Function),
      expect.objectContaining({
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      })
    );
  });

  it('keys SWR by normalized URL and debounces content changes', () => {
    useDebounce.mockImplementation(() => ['https://example.com/']);

    renderHook(() => useOpenGraphPreview('https://example.com'));

    expect(useSWR).toHaveBeenCalledWith(
      ['open-graph', 'https://example.com/'],
      expect.any(Function),
      expect.objectContaining({ dedupingInterval: 60000 })
    );
  });

  it('posts to the authenticated open-graph endpoint', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => mockOpenGraphResponse(),
    }));
    useFetch.mockReturnValue(fetchMock);

    let fetcher:
      | ((key: [string, string]) => Promise<OpenGraphResponse>)
      | null = null;
    useSWR.mockImplementation(
      (
        _key: unknown,
        load: (key: [string, string]) => Promise<OpenGraphResponse>
      ) => {
        fetcher = load;
        return { data: undefined, error: undefined, isLoading: true };
      }
    );

    renderHook(() => useOpenGraphPreview('https://example.com'));

    await fetcher?.(['open-graph', 'https://example.com/']);

    expect(fetchMock).toHaveBeenCalledWith('/media/open-graph', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/' }),
    });
  });

  it('surfaces non-OK responses as hook errors', async () => {
    useFetch.mockReturnValue(
      jest.fn(async () => ({
        ok: false,
        json: async () => ({ message: 'blocked' }),
      }))
    );

    let fetcher:
      | ((key: [string, string]) => Promise<OpenGraphResponse>)
      | null = null;
    useSWR.mockImplementation(
      (
        _key: unknown,
        load: (key: [string, string]) => Promise<OpenGraphResponse>
      ) => {
        fetcher = load;
        return { data: undefined, error: undefined, isLoading: true };
      }
    );

    renderHook(() => useOpenGraphPreview('https://example.com'));

    await expect(
      fetcher?.(['open-graph', 'https://example.com/'])
    ).rejects.toThrow('OpenGraph request failed');
  });
});

describe('ComposerOpenGraphPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDebounce.mockImplementation((value: string | null) => [value]);
    useFetch.mockReturnValue(jest.fn());
  });

  it('renders metadata with safe outbound link attributes', () => {
    useSWR.mockReturnValue({
      data: mockOpenGraphResponse(),
      error: undefined,
      isLoading: false,
    });

    render(
      React.createElement(ComposerOpenGraphPreview, {
        content: 'https://example.com/article',
      })
    );

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://example.com/article');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('Example title')).toBeTruthy();
    expect(screen.getByText('Example description')).toBeTruthy();
    expect(screen.getByText('Example')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('alt')).toBe('Example image');
  });

  it('renders nothing when metadata is empty', () => {
    useSWR.mockReturnValue({
      data: mockOpenGraphResponse({
        title: null,
        description: null,
        image: null,
        imageAlt: null,
        siteName: null,
      }),
      error: undefined,
      isLoading: false,
    });

    const { container } = render(
      React.createElement(ComposerOpenGraphPreview, {
        content: 'https://example.com/article',
      })
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing on hook errors', () => {
    useSWR.mockReturnValue({
      data: undefined,
      error: new Error('failed'),
      isLoading: false,
    });

    const { container } = render(
      React.createElement(ComposerOpenGraphPreview, {
        content: 'https://example.com/article',
      })
    );

    expect(container.firstChild).toBeNull();
  });

  it('hides stale metadata when the URL is removed before debounce settles', () => {
    useDebounce.mockImplementation(() => ['https://example.com/']);
    useSWR.mockReturnValue({
      data: mockOpenGraphResponse(),
      error: undefined,
      isLoading: false,
    });

    const { container } = render(
      React.createElement(ComposerOpenGraphPreview, { content: 'no url' })
    );

    expect(container.firstChild).toBeNull();
  });

  it('hides failed images while keeping text metadata', () => {
    useSWR.mockReturnValue({
      data: mockOpenGraphResponse(),
      error: undefined,
      isLoading: false,
    });

    render(
      React.createElement(ComposerOpenGraphPreview, {
        content: 'https://example.com/article',
      })
    );

    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Example title')).toBeTruthy();
  });
});

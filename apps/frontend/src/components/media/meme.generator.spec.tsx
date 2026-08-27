/**
 * @jest-environment ./jest.jsdom.environment.js
 */

jest.mock('canvas', () => ({}), { virtual: true });

import React from 'react';
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  captionsMatch,
  filterMemeTemplates,
  MemeComposerButton,
  MemeGenerator,
  useMemeTemplates,
  ImgflipTemplate,
} from './meme.generator';

jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: jest.fn(),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'spinner' }),
}));

const closeCurrent = jest.fn();
const openModal = jest.fn();

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal,
    closeCurrent,
    closeAll: jest.fn(),
    closeById: jest.fn(),
  }),
}));

const mockUseVariables = jest.fn(() => ({ imgflipEnabled: true }));

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => mockUseVariables(),
}));

const useSWR = jest.requireMock('swr').default as jest.Mock;
const { useFetch } = jest.requireMock(
  '@gitroom/helpers/utils/custom.fetch'
) as { useFetch: jest.Mock };

const mockTemplates: ImgflipTemplate[] = [
  {
    id: '1',
    name: 'Drake Hotline Bling',
    url: 'https://i.imgflip.com/30b1gx.jpg',
    width: 500,
    height: 500,
    boxCount: 2,
  },
  {
    id: '2',
    name: 'Distracted Boyfriend',
    url: 'https://i.imgflip.com/1ur9b0.jpg',
    width: 500,
    height: 500,
    boxCount: 3,
  },
];

describe('filterMemeTemplates', () => {
  it('filters templates case-insensitively by name', () => {
    expect(filterMemeTemplates(mockTemplates, 'drake')).toHaveLength(1);
    expect(filterMemeTemplates(mockTemplates, 'BOYFRIEND')).toHaveLength(1);
    expect(filterMemeTemplates(mockTemplates, 'missing')).toHaveLength(0);
  });
});

describe('captionsMatch', () => {
  it('compares caption arrays by value and length', () => {
    expect(captionsMatch(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(captionsMatch(['a', 'b'], ['a', 'c'])).toBe(false);
    expect(captionsMatch(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('useMemeTemplates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useFetch.mockReturnValue(jest.fn());
    useSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
    });
  });

  it('disables SWR when not enabled', () => {
    renderHook(() => useMemeTemplates(false));

    expect(useSWR).toHaveBeenCalledWith(
      null,
      expect.any(Function),
      expect.objectContaining({
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
      })
    );
  });

  it('fetches templates from the authenticated endpoint', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => mockTemplates,
    }));
    useFetch.mockReturnValue(fetchMock);

    let fetcher: (() => Promise<ImgflipTemplate[]>) | null = null;
    useSWR.mockImplementation(
      (_key: unknown, load: () => Promise<ImgflipTemplate[]>) => {
        fetcher = load;
        return { data: mockTemplates, error: undefined, isLoading: false };
      }
    );

    renderHook(() => useMemeTemplates(true));
    await fetcher?.();

    expect(fetchMock).toHaveBeenCalledWith('/media/memes/templates');
  });

  it('throws when the templates response is not an array', async () => {
    useFetch.mockReturnValue(
      jest.fn(async () => ({
        ok: true,
        json: async () => ({ invalid: true }),
      }))
    );

    let fetcher: (() => Promise<ImgflipTemplate[]>) | null = null;
    useSWR.mockImplementation(
      (_key: unknown, load: () => Promise<ImgflipTemplate[]>) => {
        fetcher = load;
        return { data: undefined, error: undefined, isLoading: true };
      }
    );

    renderHook(() => useMemeTemplates(true));

    await expect(fetcher?.()).rejects.toThrow(
      'Invalid meme templates response'
    );
  });
});

describe('MemeGenerator', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useFetch.mockReturnValue(fetchMock);
    useSWR.mockReturnValue({
      data: mockTemplates,
      error: undefined,
      isLoading: false,
    });
  });

  it('renders dynamic caption inputs for the selected template', () => {
    render(React.createElement(MemeGenerator, { onSave: jest.fn() }));

    expect(screen.getByLabelText('Text 1')).toBeTruthy();
    expect(screen.getByLabelText('Text 2')).toBeTruthy();
    expect(screen.queryByLabelText('Text 3')).toBeNull();
  });

  it('resets captions and preview when selecting another template', () => {
    render(React.createElement(MemeGenerator, { onSave: jest.fn() }));

    fireEvent.change(screen.getByLabelText('Text 1'), {
      target: { value: 'hello' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Distracted Boyfriend' })
    );

    expect(screen.getByLabelText('Text 1')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Text 3')).toBeTruthy();
  });

  it('posts the generation payload and shows the preview without saving', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'https://i.imgflip.com/generated.jpg',
      }),
    });

    render(React.createElement(MemeGenerator, { onSave: jest.fn() }));

    fireEvent.change(screen.getByLabelText('Text 1'), {
      target: { value: 'top text' },
    });
    fireEvent.change(screen.getByLabelText('Text 2'), {
      target: { value: 'bottom text' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate meme' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/media/memes/generate', {
        method: 'POST',
        body: JSON.stringify({
          templateId: '1',
          captions: [{ text: 'top text' }, { text: 'bottom text' }],
        }),
      });
      expect(
        screen.getByRole('img', { name: 'Preview of Drake Hotline Bling' })
      ).toBeTruthy();
    });

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/media/memes/save',
      expect.anything()
    );
  });

  it('invalidates stale previews after caption edits', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'https://i.imgflip.com/generated.jpg',
      }),
    });

    render(React.createElement(MemeGenerator, { onSave: jest.fn() }));

    fireEvent.click(screen.getByRole('button', { name: 'Generate meme' }));
    await waitFor(() => {
      expect(
        screen.getByRole('img', { name: 'Preview of Drake Hotline Bling' })
      ).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Text 1'), {
      target: { value: 'changed' },
    });

    expect(
      screen.queryByRole('img', { name: 'Preview of Drake Hotline Bling' })
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Save to media' })
    ).toHaveProperty('disabled', true);
  });

  it('discards in-flight generation when captions change before response', async () => {
    let resolveGenerate: (value: {
      ok: boolean;
      json: () => Promise<{ url: string }>;
    }) => void;
    const generatePromise = new Promise<{
      ok: boolean;
      json: () => Promise<{ url: string }>;
    }>((resolve) => {
      resolveGenerate = resolve;
    });
    fetchMock.mockReturnValueOnce(generatePromise);

    render(React.createElement(MemeGenerator, { onSave: jest.fn() }));

    fireEvent.click(screen.getByRole('button', { name: 'Generate meme' }));
    expect(screen.getByTestId('spinner')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Text 1'), {
      target: { value: 'changed while generating' },
    });

    resolveGenerate!({
      ok: true,
      json: async () => ({
        url: 'https://i.imgflip.com/stale-generated.jpg',
      }),
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('img', { name: 'Preview of Drake Hotline Bling' })
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Save to media' })
      ).toHaveProperty('disabled', true);
    });
  });

  it('discards in-flight generation when template changes before response', async () => {
    let resolveGenerate: (value: {
      ok: boolean;
      json: () => Promise<{ url: string }>;
    }) => void;
    const generatePromise = new Promise<{
      ok: boolean;
      json: () => Promise<{ url: string }>;
    }>((resolve) => {
      resolveGenerate = resolve;
    });
    fetchMock.mockReturnValueOnce(generatePromise);

    render(React.createElement(MemeGenerator, { onSave: jest.fn() }));

    fireEvent.click(screen.getByRole('button', { name: 'Generate meme' }));
    expect(screen.getByTestId('spinner')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Distracted Boyfriend' })
    );

    resolveGenerate!({
      ok: true,
      json: async () => ({
        url: 'https://i.imgflip.com/stale-generated.jpg',
      }),
    });

    await waitFor(() => {
      expect(screen.queryByRole('img', { name: /Preview of/ })).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Save to media' })
      ).toHaveProperty('disabled', true);
    });

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/media/memes/save',
      expect.anything()
    );
  });

  it('keeps captions after generate failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });

    render(React.createElement(MemeGenerator, { onSave: jest.fn() }));

    fireEvent.change(screen.getByLabelText('Text 1'), {
      target: { value: 'retry me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate meme' }));

    await waitFor(() => {
      expect(
        screen.getByText('Failed to generate meme. Please try again.')
      ).toBeTruthy();
    });

    expect(screen.getByLabelText('Text 1')).toHaveProperty('value', 'retry me');
  });

  it('saves the preview, calls onSave, and closes only the meme modal', async () => {
    const onSave = jest.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://i.imgflip.com/generated.jpg',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'media-1',
          path: '/uploads/meme.jpg',
        }),
      });

    render(React.createElement(MemeGenerator, { onSave }));

    fireEvent.click(screen.getByRole('button', { name: 'Generate meme' }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Save to media' })
      ).toHaveProperty('disabled', false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save to media' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/media/memes/save', {
        method: 'POST',
        body: JSON.stringify({
          templateId: '1',
          url: 'https://i.imgflip.com/generated.jpg',
        }),
      });
      expect(onSave).toHaveBeenCalledWith({
        id: 'media-1',
        path: '/uploads/meme.jpg',
      });
      expect(closeCurrent).toHaveBeenCalled();
    });
  });

  it('keeps preview state after save failure', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://i.imgflip.com/generated.jpg',
        }),
      })
      .mockResolvedValueOnce({ ok: false });

    render(React.createElement(MemeGenerator, { onSave: jest.fn() }));

    fireEvent.click(screen.getByRole('button', { name: 'Generate meme' }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Save to media' })
      ).toHaveProperty('disabled', false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save to media' }));

    await waitFor(() => {
      expect(
        screen.getByText('Failed to save meme. Please try again.')
      ).toBeTruthy();
    });

    expect(
      screen.getByRole('img', { name: 'Preview of Drake Hotline Bling' })
    ).toBeTruthy();
    expect(closeCurrent).not.toHaveBeenCalled();
  });

  it('shows watermark note and safe attribution links', () => {
    render(React.createElement(MemeGenerator, { onSave: jest.fn() }));

    expect(
      screen.getByText(
        'Free API output includes an Imgflip watermark on generated images.'
      )
    ).toBeTruthy();

    const poweredBy = screen.getByRole('link', { name: 'Powered by Imgflip' });
    expect(poweredBy.getAttribute('href')).toBe('https://imgflip.com/');
    expect(poweredBy.getAttribute('target')).toBe('_blank');
    expect(poweredBy.getAttribute('rel')).toBe('noopener noreferrer');

    const terms = screen.getByRole('link', { name: 'Imgflip API terms' });
    expect(terms.getAttribute('href')).toBe('https://imgflip.com/api');
    expect(terms.getAttribute('target')).toBe('_blank');
    expect(terms.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('MemeComposerButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseVariables.mockReturnValue({ imgflipEnabled: true });
  });

  it('renders the exact Meme label when enabled', () => {
    render(
      React.createElement(MemeComposerButton, {
        appendImages: jest.fn(),
        mediaNotAvailable: false,
      })
    );

    expect(
      screen.getByRole('button', { name: 'Create meme' }).textContent
    ).toBe('Meme');
  });

  it('is hidden when imgflip is disabled', () => {
    mockUseVariables.mockReturnValue({ imgflipEnabled: false });

    const { container } = render(
      React.createElement(MemeComposerButton, {
        appendImages: jest.fn(),
        mediaNotAvailable: false,
      })
    );

    expect(container.firstChild).toBeNull();
  });

  it('is hidden when media is unavailable', () => {
    const { container } = render(
      React.createElement(MemeComposerButton, {
        appendImages: jest.fn(),
        mediaNotAvailable: true,
      })
    );

    expect(container.firstChild).toBeNull();
  });

  it('opens the meme generator modal', () => {
    const appendImages = jest.fn();

    render(
      React.createElement(MemeComposerButton, {
        appendImages,
        mediaNotAvailable: false,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create meme' }));

    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Meme Generator',
        size: '900px',
        maxSize: '95vw',
      })
    );
  });
});

/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import { renderHook, act } from '@testing-library/react';
import { useMediaAltPrompt } from './use.media.alt.prompt';

const open = jest.fn();
const fetchMock = jest.fn();
const toasterShow = jest.fn();
const setLocked = jest.fn();
let user: { tier?: { ai?: boolean } } | undefined = { tier: { ai: true } };

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => fetchMock,
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toasterShow }),
}));

jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => user,
}));

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => ({ open }),
}));

jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (
    selector: (state: { setLocked: typeof setLocked }) => unknown
  ) => selector({ setLocked }),
}));

const image = {
  id: 'media-1',
  path: 'https://cdn.example.com/photo.jpg',
};

describe('useMediaAltPrompt', () => {
  beforeEach(() => {
    open.mockReset();
    fetchMock.mockReset();
    toasterShow.mockReset();
    setLocked.mockReset();
    user = { tier: { ai: true } };
  });

  it('skips the prompt when the user has no AI tier', async () => {
    user = { tier: { ai: false } };
    const { result } = renderHook(() => useMediaAltPrompt());

    await act(async () => {
      await expect(result.current.enrichMediaWithAlt([image])).resolves.toEqual(
        [image]
      );
    });

    expect(open).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips videos and images that already have alt text', async () => {
    const { result } = renderHook(() => useMediaAltPrompt());
    const withAlt = { ...image, alt: 'Existing alt' };
    const video = { id: 'video-1', path: 'https://cdn.example.com/clip.mp4' };

    await act(async () => {
      await expect(
        result.current.enrichMediaWithAlt([withAlt, video])
      ).resolves.toEqual([withAlt, video]);
    });

    expect(open).not.toHaveBeenCalled();
  });

  it('asks once per image and persists generated alt on yes', async () => {
    open.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ...image, alt: 'A generated description' }),
    });
    const second = { id: 'media-2', path: 'https://cdn.example.com/two.jpg' };
    const { result } = renderHook(() => useMediaAltPrompt());

    let enriched: (typeof image)[] = [];
    await act(async () => {
      enriched = await result.current.enrichMediaWithAlt([image, second]);
    });

    expect(open).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/media/generate-alt', {
      method: 'POST',
      body: JSON.stringify({ id: 'media-1' }),
    });
    expect(enriched[0].alt).toBe('A generated description');
    expect(enriched[1]).toEqual(second);
  });

  it('attaches the original media and toasts when generation fails', async () => {
    open.mockResolvedValue(true);
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'You have no AI credits left' }),
    });
    const { result } = renderHook(() => useMediaAltPrompt());

    await act(async () => {
      await expect(result.current.enrichMediaWithAlt([image])).resolves.toEqual(
        [image]
      );
    });

    expect(toasterShow).toHaveBeenCalledWith(
      'You have no AI credits left',
      'warning'
    );
  });
});

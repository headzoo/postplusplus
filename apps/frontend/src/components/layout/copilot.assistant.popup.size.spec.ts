/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import {
  clampCopilotPopupSize,
  COPILOT_POPUP_DEFAULT_HEIGHT,
  COPILOT_POPUP_DEFAULT_WIDTH,
  COPILOT_POPUP_MIN_HEIGHT,
  COPILOT_POPUP_MIN_WIDTH,
  COPILOT_POPUP_SIZE_KEY,
  getDefaultCopilotPopupSize,
  getStoredCopilotPopupSize,
  setStoredCopilotPopupSize,
} from './copilot.assistant.popup.size';

describe('copilot.assistant.popup.size', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    });
  });

  it('clamps width and height to min and max', () => {
    expect(clampCopilotPopupSize({ width: 100, height: 50 })).toEqual({
      width: COPILOT_POPUP_MIN_WIDTH,
      height: COPILOT_POPUP_MIN_HEIGHT,
    });

    expect(clampCopilotPopupSize({ width: 5000, height: 5000 })).toEqual({
      width: 1264,
      height: 704,
    });
  });

  it('returns CopilotKit-matching defaults', () => {
    expect(getDefaultCopilotPopupSize()).toEqual({
      width: COPILOT_POPUP_DEFAULT_WIDTH,
      height: COPILOT_POPUP_DEFAULT_HEIGHT,
    });
  });

  it('restores size from localStorage and persists clamped values', () => {
    localStorage.setItem(
      COPILOT_POPUP_SIZE_KEY,
      JSON.stringify({ width: 500, height: 450 })
    );

    expect(getStoredCopilotPopupSize()).toEqual({
      width: 500,
      height: 450,
    });

    setStoredCopilotPopupSize({ width: 90, height: 40 });
    expect(localStorage.getItem(COPILOT_POPUP_SIZE_KEY)).toBe(
      JSON.stringify({
        width: COPILOT_POPUP_MIN_WIDTH,
        height: COPILOT_POPUP_MIN_HEIGHT,
      })
    );
  });

  it('falls back to defaults for invalid stored values', () => {
    localStorage.setItem(COPILOT_POPUP_SIZE_KEY, 'not-json');
    expect(getStoredCopilotPopupSize()).toEqual(getDefaultCopilotPopupSize());

    localStorage.setItem(
      COPILOT_POPUP_SIZE_KEY,
      JSON.stringify({ width: 'x', height: 400 })
    );
    expect(getStoredCopilotPopupSize()).toEqual(getDefaultCopilotPopupSize());
  });
});

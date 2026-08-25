/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  FollowerTriageTip,
  followerTriageTipAlertKey,
  resolveFollowerTriageTipSlug,
} from './follower.triage.tip';

const dismissAlert = jest.fn();
let dismissedKeys: string[] = [];
let isLoading = false;
let hasData = true;

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

jest.mock('@gitroom/frontend/components/layout/use.dismissed.alerts', () => ({
  useDismissedAlerts: () => ({
    data: hasData ? { keys: dismissedKeys } : undefined,
    isLoading,
    dismissAlert,
  }),
}));

describe('follower triage tip helpers', () => {
  it('maps slugs to alert keys', () => {
    expect(followerTriageTipAlertKey('hot')).toBe('followers.triage.hot');
    expect(resolveFollowerTriageTipSlug(undefined)).toBe('all');
    expect(resolveFollowerTriageTipSlug('lead')).toBe('leads');
    expect(resolveFollowerTriageTipSlug('leads')).toBe('leads');
    expect(resolveFollowerTriageTipSlug('engaged')).toBe('hot');
  });
});

describe('FollowerTriageTip', () => {
  beforeEach(() => {
    dismissAlert.mockReset();
    dismissedKeys = [];
    isLoading = false;
    hasData = true;
  });

  it('renders the tip for the active triage', () => {
    render(<FollowerTriageTip slug="hot" />);

    const tip = screen.getByTestId('followers-triage-tip');
    expect(tip.getAttribute('data-triage-tip')).toBe('hot');
    expect(tip.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Hot')).toBeTruthy();
    expect(
      screen.getByText(
        'Their effort exceeds the channel’s — including people who engaged and have not been reciprocated yet.'
      )
    ).toBeTruthy();
  });

  it('hides when a custom list is selected', () => {
    render(<FollowerTriageTip slug="hot" hidden />);
    expect(screen.queryByTestId('followers-triage-tip')).toBeNull();
  });

  it('hides while dismissed keys are loading', () => {
    isLoading = true;
    hasData = false;
    render(<FollowerTriageTip slug="all" />);
    expect(screen.queryByTestId('followers-triage-tip')).toBeNull();
  });

  it('hides when the tip was already dismissed', () => {
    dismissedKeys = ['followers.triage.hot'];
    render(<FollowerTriageTip slug="hot" />);
    expect(screen.queryByTestId('followers-triage-tip')).toBeNull();
  });

  it('dismisses with the triage alert key', () => {
    render(<FollowerTriageTip slug="hot" />);
    fireEvent.click(screen.getByTestId('followers-triage-tip-dismiss'));
    expect(dismissAlert).toHaveBeenCalledWith('followers.triage.hot');
  });
});

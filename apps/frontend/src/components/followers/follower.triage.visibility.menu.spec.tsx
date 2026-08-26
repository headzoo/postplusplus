/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FollowerTriageVisibilityMenu } from './follower.triage.visibility.menu';

jest.mock('@mantine/hooks', () => ({
  useClickOutside: () => ({ current: null }),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

describe('FollowerTriageVisibilityMenu', () => {
  it('opens the menu and toggles a triage visibility checkbox', () => {
    const onToggle = jest.fn();
    render(
      <FollowerTriageVisibilityMenu hiddenSlugs={new Set()} onToggle={onToggle} />
    );

    fireEvent.click(screen.getByTestId('followers-triage-visibility-button'));
    expect(screen.getByTestId('followers-triage-visibility-menu')).toBeTruthy();

    fireEvent.click(
      screen
        .getByTestId('followers-triage-visibility-leads')
        .querySelector('.cursor-pointer')!
    );
    expect(onToggle).toHaveBeenCalledWith('leads');
  });

  it('shows the hidden count on the button', () => {
    render(
      <FollowerTriageVisibilityMenu
        hiddenSlugs={new Set(['bots', 'ignored'])}
        onToggle={jest.fn()}
      />
    );

    expect(screen.getByTestId('followers-triage-visibility-button').textContent).toContain(
      '(2)'
    );
  });
});

/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FollowerListColorPicker } from './follower.list.color.picker';

jest.mock('@mantine/hooks', () => ({
  useClickOutside: () => ({ current: null }),
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

describe('FollowerListColorPicker', () => {
  it('opens the palette and reports the selected color', async () => {
    const onChange = jest.fn().mockResolvedValue(undefined);

    render(<FollowerListColorPicker color="orange" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('followers-list-color-button'));
    fireEvent.click(screen.getByTestId('followers-list-color-purple'));

    expect(onChange).toHaveBeenCalledWith('purple');
  });
});

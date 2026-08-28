/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { FollowerSegmentHelpModal } from './follower.segment.help.modal';
import {
  FOLLOWER_SEGMENT_HELP_COPY,
  getFollowerSegmentHelpCopy,
} from './follower.segment.help';
import {
  RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD,
  RELATIONSHIP_WINDOW_DAYS,
} from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/channel-interaction.scoring';
import { FOLLOWER_CATEGORY_DESCRIPTIONS } from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback: string, params?: Record<string, unknown>) => {
      if (!params) {
        return fallback;
      }
      return Object.entries(params).reduce(
        (result, [name, value]) =>
          result.replace(new RegExp(`{{${name}}}`, 'g'), String(value)),
        fallback
      );
    },
}));

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: jest.fn(),
    closeCurrent: jest.fn(),
  }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/followers',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('getFollowerSegmentHelpCopy', () => {
  it('returns copy for board segments and null for all', () => {
    expect(getFollowerSegmentHelpCopy('leads')?.defaultSummary).toBe(
      FOLLOWER_CATEGORY_DESCRIPTIONS.lead
    );
    expect(getFollowerSegmentHelpCopy('all')).toBeNull();
    expect(FOLLOWER_SEGMENT_HELP_COPY.mutual?.calculationParams).toEqual({
      windowDays: RELATIONSHIP_WINDOW_DAYS,
      meaningfulThreshold: RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD,
    });
  });
});

describe('FollowerSegmentHelpModal', () => {
  it('renders summary and calculation for mutual with interpolated constants', () => {
    render(<FollowerSegmentHelpModal slug="mutual" label="Mutual" />);

    const modal = screen.getByTestId('followers-segment-help-modal');
    expect(modal.getAttribute('data-segment-help')).toBe('mutual');
    expect(
      screen.getByText(FOLLOWER_CATEGORY_DESCRIPTIONS.mutual)
    ).toBeTruthy();
    expect(screen.getByText('How Mutual is calculated')).toBeTruthy();
    expect(
      screen.getByText(new RegExp(`last ${RELATIONSHIP_WINDOW_DAYS} days`, 'i'))
    ).toBeTruthy();
    expect(
      screen.getByText(
        new RegExp(
          `at least ${RELATIONSHIP_MEANINGFUL_ACTIVITY_THRESHOLD} points`,
          'i'
        )
      )
    ).toBeTruthy();
    expect(
      screen
        .getByTestId('followers-segment-help-learn-more')
        .getAttribute('href')
    ).toBe('/followers?help=followers');
  });

  it('renders hot calculation as materialized picks', () => {
    render(<FollowerSegmentHelpModal slug="hot" label="Hot" />);

    expect(screen.getByText(FOLLOWER_CATEGORY_DESCRIPTIONS.hot)).toBeTruthy();
    expect(screen.getByText(/hourly materialized list/i)).toBeTruthy();
  });
});

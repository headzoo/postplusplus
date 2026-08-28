/**
 * @jest-environment ./jest.jsdom.environment.js
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

let mockPathname = '/conversation';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({
    orgId: 'org-1',
    tier: 'PRO',
    role: 'USER',
    admin: false,
  }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({
    isGeneral: true,
    billingEnabled: true,
  }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: jest.fn() }),
}));
jest.mock('@gitroom/frontend/components/layout/agent.media.modal', () => ({
  AgentMediaModal: () => <div />,
}));

const { TopMenu, useMenuItem } =
  require('./top.menu') as typeof import('./top.menu');

describe('TopMenu conversations navigation', () => {
  it('includes the Conversations item at the product inbox path', () => {
    const MenuItems = () => {
      const { firstMenu } = useMenuItem();
      const item = firstMenu.find(({ path }) => path === '/conversation');
      return <span>{item?.name}</span>;
    };

    render(<MenuItems />);

    expect(screen.getByText('Conversations')).toBeTruthy();
  });

  it('marks the Conversations link active for the inbox route', () => {
    render(<TopMenu />);

    const link = screen.getByRole('link', { name: 'Conversations' });
    expect(link.getAttribute('href')).toBe('/conversation');
    expect(link.className).toContain('bg-btnPrimary');

    mockPathname = '/calendar';
    render(<TopMenu />);
    expect(
      screen
        .getAllByRole('link', { name: 'Conversations' })[1]
        .className.split(' ')
    ).not.toContain('bg-btnPrimary');
    mockPathname = '/conversation';
  });
});

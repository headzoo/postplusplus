/**
 * @jest-environment ./jest.jsdom.environment.js
 */

jest.mock('@gitroom/frontend/components/launches/add.provider.component', () => ({
  AddProviderButton: () => null,
}));

jest.mock('@gitroom/frontend/components/launches/generator/generator', () => ({
  GeneratorComponent: () => null,
}));

jest.mock('@gitroom/frontend/components/launches/new.post', () => ({
  NewPost: () => null,
}));

jest.mock('@gitroom/frontend/components/launches/helpers/dnd.provider', () => ({
  DNDProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ billingEnabled: false }),
}));

jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: jest.fn(() => ['0', jest.fn()]),
}));

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ChannelMenu,
  groupChannelsByCustomer,
} from './channels.sidebar';
import { IntegrationListItem } from '@gitroom/frontend/components/launches/helpers/use.integration.list';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback || key,
}));

jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ totalChannels: 10 }),
}));

jest.mock('react-dnd', () => ({
  useDrag: () => [{}, (node: unknown) => node, (node: unknown) => node],
  useDrop: () => [{ isOver: false }, (node: unknown) => node],
}));

jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

jest.mock('@gitroom/frontend/components/launches/menu/menu', () => ({
  Menu: () => <div data-testid="channel-kebab" />,
}));

jest.mock('@mantine/hooks', () => ({
  useClickOutside: () => ({ current: null }),
}));

jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
  useSWRConfig: jest.fn(() => ({ mutate: jest.fn() })),
}));

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));

const openModal = jest.fn();
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal, closeAll: jest.fn() }),
}));

const makeIntegration = (
  id: string,
  name: string,
  overrides: Partial<IntegrationListItem> = {}
): IntegrationListItem =>
  ({
    id,
    name,
    identifier: `platform-${id}`,
    type: 'social',
    picture: `/picture/${id}.png`,
    disabled: false,
    inBetweenSteps: false,
    changeProfilePicture: false,
    changeNickName: false,
    ...overrides,
  }) as IntegrationListItem;

const acmeOne = makeIntegration('acme-1', 'Acme One', {
  customer: { id: 'acme', name: 'Acme' },
});
const acmeTwo = makeIntegration('acme-2', 'Acme Two', {
  customer: { id: 'acme', name: 'Acme' },
});
const betaOne = makeIntegration('beta-1', 'Beta One', {
  customer: { id: 'beta', name: 'Beta' },
});
const ungrouped = makeIntegration('solo-1', 'Solo Channel');

beforeEach(() => {
  localStorage.clear();
  openModal.mockClear();
});

describe('groupChannelsByCustomer', () => {
  it('groups channels by customer and sorts named groups first by name', () => {
    const groups = groupChannelsByCustomer([betaOne, ungrouped, acmeTwo, acmeOne]);

    expect(groups.map((group) => group.name)).toEqual(['', 'Acme', 'Beta']);
    expect(groups[1].values.map((integration) => integration.id)).toEqual([
      'acme-1',
      'acme-2',
    ]);
  });

  it('sorts named groups by customer position before name', () => {
    const zeta = makeIntegration('zeta-1', 'Zeta One', {
      customer: { id: 'zeta', name: 'Zeta', position: 0 },
    });
    const alpha = makeIntegration('alpha-1', 'Alpha One', {
      customer: { id: 'alpha', name: 'Alpha', position: 2 },
    });

    const groups = groupChannelsByCustomer([alpha, zeta, ungrouped]);

    expect(groups.map((group) => group.name)).toEqual(['', 'Zeta', 'Alpha']);
  });
});

describe('ChannelMenu', () => {
  it('renders customer group headers and channels', () => {
    render(
      <ChannelMenu
        collapsed={false}
        integrations={[acmeOne, acmeTwo, betaOne, ungrouped]}
      />
    );

    expect(screen.getByRole('button', { name: 'Acme' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Beta' })).toBeTruthy();
    expect(screen.getByText('Acme One')).toBeTruthy();
    expect(screen.getByText('Acme Two')).toBeTruthy();
    expect(screen.getByText('Beta One')).toBeTruthy();
    expect(screen.getByText('Solo Channel')).toBeTruthy();
    expect(screen.queryByTestId('channel-kebab')).toBeNull();
  });

  it('collapses a named group when its header is clicked', () => {
    render(
      <ChannelMenu
        collapsed={false}
        integrations={[acmeOne, betaOne]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Acme' }));

    expect(
      screen.getByText('Acme One').closest('div.flex.flex-col')?.className
    ).toContain('hidden');
    expect(
      screen.getByText('Beta One').closest('div.flex.flex-col')?.className
    ).not.toContain('hidden');
  });

  it('dims unselected channels and reports clicks', () => {
    const onSelect = jest.fn();
    render(
      <ChannelMenu
        collapsed={false}
        integrations={[acmeOne, betaOne]}
        selectedIds={[acmeOne.id]}
        onSelect={onSelect}
      />
    );

    const selectedRow = screen.getByText('Acme One').closest('div.flex');
    const unselectedRow = screen.getByText('Beta One').closest('div.flex');

    expect(selectedRow?.className).not.toContain('opacity-20');
    expect(unselectedRow?.className).toContain('opacity-20');
    expect(selectedRow?.className).toContain('py-2');
    expect(selectedRow?.className).not.toMatch(/(?:^|\s)p-2(?:\s|$)/);

    fireEvent.click(screen.getByText('Beta One'));
    expect(onSelect).toHaveBeenCalledWith(betaOne);
  });

  it('uses halved gaps between groups and between header and items', () => {
    const { container } = render(
      <ChannelMenu
        collapsed={false}
        integrations={[acmeOne, betaOne]}
      />
    );

    const groupsWrapper = container.firstElementChild as HTMLElement | null;
    expect(groupsWrapper?.className).toContain('gap-[16px]');

    const groupRoot = screen
      .getByRole('button', { name: 'Acme' })
      .closest('div.flex.flex-col');
    expect(groupRoot?.className).toContain('gap-[8px]');
  });

  it('renders a group menu on named headers and disables impossible moves', () => {
    render(
      <ChannelMenu
        collapsed={false}
        integrations={[acmeOne, acmeTwo, betaOne, ungrouped]}
      />
    );

    const menus = screen.getAllByLabelText('Group actions');
    expect(menus).toHaveLength(2);
    expect(screen.getByText('Solo Channel').closest('div.flex.flex-col')).toBeTruthy();

    fireEvent.click(menus[0]);
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
    expect(
      (screen.getByRole('menuitem', { name: 'Move up' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('menuitem', { name: 'Move down' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);

    fireEvent.click(menus[0]);
    fireEvent.click(menus[1]);
    expect(
      (screen.getByRole('menuitem', { name: 'Move down' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('menuitem', { name: 'Move up' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it('does not collapse a group when its actions menu is opened', () => {
    render(
      <ChannelMenu
        collapsed={false}
        integrations={[acmeOne, betaOne]}
      />
    );

    fireEvent.click(screen.getAllByLabelText('Group actions')[0]);

    expect(
      screen.getByText('Acme One').closest('div.flex.flex-col')?.className
    ).not.toContain('hidden');
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeTruthy();
  });

  it('opens a rename modal from the group menu', () => {
    render(
      <ChannelMenu
        collapsed={false}
        integrations={[acmeOne, betaOne]}
      />
    );

    fireEvent.click(screen.getAllByLabelText('Group actions')[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));

    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Rename group',
      })
    );
  });
});

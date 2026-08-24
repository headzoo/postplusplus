'use client';

import { AddProviderButton } from '@gitroom/frontend/components/launches/add.provider.component';
import { GeneratorComponent } from '@gitroom/frontend/components/launches/generator/generator';
import { NewPost } from '@gitroom/frontend/components/launches/new.post';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';
import { capitalize, groupBy, orderBy } from 'lodash';
import {
  FC,
  MouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '@mantine/hooks';
import useCookie from 'react-use-cookie';
import { useDrag, useDrop } from 'react-dnd';
import { useSWRConfig } from 'swr';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Menu } from '@gitroom/frontend/components/launches/menu/menu';
import { CustomerRenameModal } from '@gitroom/frontend/components/launches/customer.modal';
import { IntegrationListItem } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';

export type ChannelGroup = {
  id: string;
  name: string;
  position: number;
  values: IntegrationListItem[];
};

export const groupChannelsByCustomer = (
  integrations: IntegrationListItem[]
): ChannelGroup[] =>
  orderBy(
    Object.values(
      groupBy(integrations, (integration) => integration.customer?.id || '')
    ).map((values) => ({
      id: values[0].customer?.id || '',
      name: values[0].customer?.name || '',
      position: values[0].customer?.id
        ? values[0].customer?.position ?? 0
        : -1,
      values: orderBy(
        values,
        ['type', 'disabled', 'identifier'],
        ['desc', 'asc', 'asc']
      ),
    })),
    ['position', 'name'],
    ['asc', 'asc']
  );

const swapCustomerPositions = (
  integrations: IntegrationListItem[],
  customerId: string,
  direction: 'up' | 'down'
): IntegrationListItem[] => {
  const groups = groupChannelsByCustomer(integrations).filter(
    (group) => group.id
  );
  const index = groups.findIndex((group) => group.id === customerId);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= groups.length) {
    return integrations;
  }

  const current = groups[index];
  const neighbor = groups[targetIndex];
  let currentPosition = neighbor.position;
  let neighborPosition = current.position;
  if (currentPosition === neighborPosition) {
    currentPosition =
      direction === 'up' ? neighbor.position - 1 : neighbor.position + 1;
    neighborPosition = neighbor.position;
  }

  return integrations.map((integration) => {
    if (integration.customer?.id === current.id) {
      return {
        ...integration,
        customer: { ...integration.customer, position: currentPosition },
      };
    }
    if (integration.customer?.id === neighbor.id) {
      return {
        ...integration,
        customer: { ...integration.customer, position: neighborPosition },
      };
    }
    return integration;
  });
};

export const ChannelsSidebar = ({
  integrationCount,
  onUpdate,
  children,
  showCalendarActions = false,
  showAddProvider = true,
}: {
  integrationCount: number;
  onUpdate?: (shouldReload: boolean) => void;
  children: (collapsed: boolean) => ReactNode;
  showCalendarActions?: boolean;
  showAddProvider?: boolean;
}) => {
  const user = useUser();
  const { billingEnabled } = useVariables();
  const t = useT();
  const [collapseMenu, setCollapseMenu] = useCookie('collapseMenu', '0');
  const [hideSidebar, setHideSidebar] = useCookie(
    'channelsSidebarHidden',
    '1'
  );
  const [mode] = useCookie('mode', 'dark');
  const [mounted, setMounted] = useState(false);
  const collapsed = collapseMenu === '1';
  const mobileHidden = hideSidebar === '1';

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <DNDProvider>
      <>
        <div
          className={clsx(
            'relative shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
            collapsed ? 'group sidebar w-[100px]' : 'w-[260px]',
            // On mobile the rail overlays content instead of consuming width.
            'mobile:!w-0 mobile:overflow-visible'
          )}
        >
          <div
            className={clsx(
              'absolute start-0 top-0 h-full transition-[transform,width] duration-200 ease-out',
              'mobile:fixed mobile:z-[520] mobile:bottom-0',
              collapsed ? 'w-[100px]' : 'w-[260px]',
              mobileHidden &&
              'mobile:-translate-x-full mobile:rtl:translate-x-full mobile:pointer-events-none'
            )}
          >
            <div className="bg-newBgColorInner p-[20px] flex flex-col gap-[15px] h-full overflow-x-hidden overflow-y-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor mobile:shadow-lg">
              <div className="flex items-center">
                <h2 className="group-[.sidebar]:hidden flex-1 text-[20px] font-[500]">
                  {t('channels', 'Channels')}
                </h2>
                <div
                  onClick={() => setCollapseMenu(collapsed ? '0' : '1')}
                  className="group-[.sidebar]:rotate-[180deg] group-[.sidebar]:mx-auto text-btnText bg-btnSimple rounded-[6px] w-[24px] h-[24px] flex items-center justify-center cursor-pointer select-none"
                >
                  <svg width="7" height="13" viewBox="0 0 7 13" fill="none">
                    <path
                      d="M6 11.5L1 6.5L6 1.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
              {(showAddProvider || showCalendarActions) && (
                <div className="flex flex-col gap-[8px] group-[.sidebar]:mx-auto group-[.sidebar]:w-[44px]">
                  {showAddProvider && (
                    <AddProviderButton update={() => onUpdate?.(true)} />
                  )}
                  {showCalendarActions && (
                    <div className="flex gap-[8px] group-[.sidebar]:flex-col">
                      {integrationCount > 0 && <NewPost />}
                      {integrationCount > 0 &&
                        user?.tier?.ai &&
                        billingEnabled && <GeneratorComponent />}
                    </div>
                  )}
                </div>
              )}
              <div className="gap-[32px] flex flex-col select-none flex-1">
                {integrationCount === 0 && !collapsed && (
                  <div className="flex-1 max-h-[500px] justify-center items-center flex">
                    <div className="flex flex-col gap-[12px] text-center">
                      <img
                        src={
                          mode === 'dark'
                            ? '/no-channels.svg'
                            : '/no-channels-colors.svg'
                        }
                        alt="No channels"
                        className="mx-auto min-w-[100%]"
                      />
                      <div className="font-[600] text-[20px]">
                        {t('no_channels', 'No channels yet')}
                      </div>
                      <div className="text-[14px]">
                        {t('connect_your_accounts')}
                      </div>
                    </div>
                  </div>
                )}
                {children(collapsed)}
              </div>
              <div className="mt-[5px] text-center flex flex-col">
                {billingEnabled && user?.isLifetime && (
                  <div>{capitalize(user?.tier?.current || '')} tier</div>
                )}
                <div>{process.env.NEXT_PUBLIC_VERSION || ''}</div>
              </div>
            </div>
          </div>
        </div>
        {mounted &&
          createPortal(
            <>
              {!mobileHidden && (
                <button
                  type="button"
                  aria-label={t('hide_channels_sidebar', 'Hide channels')}
                  onClick={() => setHideSidebar('1')}
                  className="hidden mobile:block fixed inset-0 z-[515] bg-primary/50"
                />
              )}
              <button
                type="button"
                aria-label={
                  mobileHidden
                    ? t('show_channels_sidebar', 'Show channels')
                    : t('hide_channels_sidebar', 'Hide channels')
                }
                onClick={() => setHideSidebar(mobileHidden ? '0' : '1')}
                className="hidden mobile:flex fixed bottom-[46px] start-[12px] z-[540] text-btnText bg-btnSimple border border-newBorder rounded-[6px] w-[32px] h-[32px] items-center justify-center cursor-pointer select-none shadow-lg"
              >
                <svg
                  width="7"
                  height="13"
                  viewBox="0 0 7 13"
                  fill="none"
                  className={clsx(
                    'transition-transform duration-200',
                    mobileHidden ? 'rotate-180 rtl:rotate-0' : 'rtl:rotate-180'
                  )}
                >
                  <path
                    d="M6 11.5L1 6.5L6 1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>,
            document.body
          )}
      </>
    </DNDProvider>
  );
};

const OpenClose: FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <svg
    width="11"
    height="6"
    viewBox="0 0 22 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={clsx(
      'rotate-180 transition-all',
      isOpen ? 'rotate-180' : 'rotate-90'
    )}
  >
    <path
      d="M21.9245 11.3823C21.8489 11.5651 21.7207 11.7213 21.5563 11.8312C21.3919 11.9411 21.1986 11.9998 21.0008 11.9998H1.00079C0.802892 12 0.609399 11.9414 0.444805 11.8315C0.280212 11.7217 0.151917 11.5654 0.076165 11.3826C0.000412494 11.1998 -0.0193921 10.9986 0.0192583 10.8045C0.0579087 10.6104 0.153276 10.4322 0.293288 10.2923L10.2933 0.29231C10.3862 0.199333 10.4964 0.125575 10.6178 0.0752506C10.7392 0.0249263 10.8694 -0.000976562 11.0008 -0.000976562C11.1322 -0.000976562 11.2623 0.0249263 11.3837 0.0752506C11.5051 0.125575 11.6154 0.199333 11.7083 0.29231L21.7083 10.2923C21.8481 10.4322 21.9433 10.6105 21.9818 10.8045C22.0202 10.9985 22.0003 11.1996 21.9245 11.3823Z"
      fill="currentColor"
    />
  </svg>
);

export type ChannelMenuProps = {
  integrations: IntegrationListItem[];
  selectedIds?: string[];
  onSelect?: (integration: IntegrationListItem) => void;
  mutate?: () => void;
  onUpdate?: (shouldReload: boolean) => void;
  onGroupChange?: (id: string, group: string) => void;
  onRefreshChannel?: (integration: IntegrationListItem) => () => void;
  onContinueIntegration?: (integration: IntegrationListItem) => () => void;
  noticeStatuses?: Record<string, { unreadCount: number }>;
  onClearNotices?: (integrationId: string) => void;
};

const ChannelMenuRow: FC<
  Omit<ChannelMenuProps, 'onGroupChange'> & {
    collapsed: boolean;
    enableDrag: boolean;
    integration: IntegrationListItem;
  }
> = ({
  integrations,
  mutate,
  onUpdate,
  onRefreshChannel,
  onContinueIntegration,
  collapsed,
  enableDrag,
  integration,
  noticeStatuses,
  onClearNotices,
  selectedIds,
  onSelect,
}) => {
    const user = useUser();
    const canDrag = enableDrag;
    const [{ }, drag, dragPreview] = useDrag(
      () => ({
        type: 'menu',
        item: { id: integration.id },
        canDrag,
      }),
      [canDrag, integration.id]
    );
    const totalNonDisabledChannels = useMemo(
      () => integrations.filter((item) => !item.disabled).length,
      [integrations]
    );
    const unreadCount = noticeStatuses?.[integration.id]?.unreadCount || 0;
    const isUnselected =
      !!selectedIds && !selectedIds.includes(integration.id);
    const showMenu = !!mutate && !!onUpdate && !!onRefreshChannel;

    const handleRowClick = () => {
      if (onSelect) {
        onSelect(integration);
        return;
      }
      if (integration.refreshNeeded && onRefreshChannel) {
        onRefreshChannel(integration)();
      }
    };

    const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (integration.refreshNeeded) {
        onRefreshChannel?.(integration)();
        return;
      }
      onContinueIntegration?.(integration)();
    };

    return (
      <div
        ref={(node) => {
          if (canDrag) {
            dragPreview(node);
          }
        }}
        onClick={onSelect || integration.refreshNeeded ? handleRowClick : undefined}
        {...(integration.refreshNeeded &&
          !onSelect && {
          'data-tooltip-id': 'tooltip',
          'data-tooltip-content': 'Channel disconnected, click to reconnect.',
        })}
        {...(collapsed && {
          'data-tooltip-id': 'tooltip',
          'data-tooltip-content': integration.name,
        })}
        className={clsx(
          'flex gap-[12px] items-center py-2 bg-newBgColorInner hover:bg-boxHover group/profile transition-all rounded-[8px]',
          (onSelect || integration.refreshNeeded) && 'cursor-pointer',
          isUnselected && 'opacity-20 hover:opacity-100',
          !showMenu && 'group-[.sidebar]:justify-center'
        )}
      >
        <div
          className={clsx(
            'relative gap-[6px] flex justify-center items-center',
            integration.disabled && 'opacity-50'
          )}
        >
          {(integration.inBetweenSteps || integration.refreshNeeded) &&
            (onRefreshChannel || onContinueIntegration) && (
              <div
                className="absolute start-0 top-0 w-[39px] h-[46px] cursor-pointer"
                onClick={handleOverlayClick}
              >
                <div className="bg-red-500 w-[15px] h-[15px] rounded-full start-[5px] top-[5px] absolute z-[200] text-[10px] flex justify-center items-center">
                  !
                </div>
                <div className="bg-primary/60 w-[39px] h-[46px] start-0 top-0 absolute rounded-full z-[199]" />
              </div>
            )}
          {unreadCount > 0 &&
            !integration.inBetweenSteps &&
            !integration.refreshNeeded && (
              <div
                className="absolute z-[200] start-[26px] top-[-2px] min-w-[16px] h-[16px] px-[4px] rounded-full bg-[#FF3EA2] text-[10px] text-white flex items-center justify-center border border-fifth"
                data-tooltip-id="tooltip"
                data-tooltip-content={`${unreadCount} unread notice${unreadCount === 1 ? '' : 's'
                  }`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          <ImageWithFallback
            fallbackSrc="/no-picture.jpg"
            src={integration.picture || '/no-picture.jpg'}
            className="rounded-[8px] min-w-[36px] min-h-[36px]"
            alt={integration.identifier}
            width={36}
            height={36}
          />
          <SafeImage
            src={`/icons/platforms/${integration.identifier}.png`}
            className="rounded-[8px] absolute z-[3] bottom-[5px] -end-[5px] border border-fifth"
            alt={integration.identifier}
            width={18}
            height={18}
          />
        </div>
        <div
          ref={(node) => {
            if (canDrag) {
              drag(node);
            }
          }}
          {...(integration.disabled &&
            totalNonDisabledChannels === user?.totalChannels
            ? {
              'data-tooltip-id': 'tooltip',
              'data-tooltip-content':
                'This channel is disabled, please upgrade your plan to enable it.',
            }
            : {})}
          role={canDrag ? 'handle' : undefined}
          className={clsx(
            'group-[.sidebar]:hidden flex-1 min-w-0 whitespace-nowrap text-ellipsis overflow-hidden',
            canDrag && 'cursor-move',
            integration.disabled && 'opacity-50'
          )}
        >
          {integration.name}
        </div>
        {showMenu && (
          <Menu
            canChangeProfilePicture={integration.changeProfilePicture}
            canChangeNickName={integration.changeNickName}
            integration={integration}
            integrations={integrations}
            refreshChannel={onRefreshChannel}
            mutate={mutate}
            onChange={onUpdate}
            onPostSuccess={mutate}
            canEnable={
              user?.totalChannels! > totalNonDisabledChannels &&
              integration.disabled
            }
            canDisable={!integration.disabled}
            hasUnreadNotices={unreadCount > 0}
            onClearNotices={onClearNotices}
          />
        )}
      </div>
    );
  };

const CustomerGroupMenu: FC<{
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onRename: () => void;
}> = ({ canMoveUp, canMoveDown, onMove, onRename }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={t('customer_group_actions', 'Group actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen((current) => !current);
        }}
        className="flex items-center justify-center w-[24px] h-[24px] rounded-[6px] text-menuDots hover:text-menuDotsHover hover:bg-newBgColor"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M13.125 12C13.125 12.2225 13.059 12.44 12.9354 12.625C12.8118 12.81 12.6361 12.9542 12.4305 13.0394C12.225 13.1245 11.9988 13.1468 11.7805 13.1034C11.5623 13.06 11.3618 12.9528 11.2045 12.7955C11.0472 12.6382 10.94 12.4377 10.8966 12.2195C10.8532 12.0012 10.8755 11.775 10.9606 11.5695C11.0458 11.3639 11.19 11.1882 11.375 11.0646C11.56 10.941 11.7775 10.875 12 10.875C12.2984 10.875 12.5845 10.9935 12.7955 11.2045C13.0065 11.4155 13.125 11.7016 13.125 12ZM12 6.75C12.2225 6.75 12.44 6.68402 12.625 6.5604C12.81 6.43679 12.9542 6.26109 13.0394 6.05552C13.1245 5.84995 13.1468 5.62375 13.1034 5.40552C13.06 5.1873 12.9528 4.98684 12.7955 4.82951C12.6382 4.67217 12.4377 4.56503 12.2195 4.52162C12.0012 4.47821 11.775 4.50049 11.5695 4.58564C11.3639 4.67078 11.1882 4.81498 11.0646 4.99998C10.941 5.18499 10.875 5.4025 10.875 5.625C10.875 5.92337 10.9935 6.20952 11.2045 6.4205C11.4155 6.63147 11.7016 6.75 12 6.75ZM12 17.25C11.7775 17.25 11.56 17.316 11.375 17.4396C11.19 17.5632 11.0458 17.7389 10.9606 17.9445C10.8755 18.15 10.8532 18.3762 10.8966 18.5945C10.94 18.8127 11.0472 19.0132 11.2045 19.1705C11.3618 19.3278 11.5623 19.435 11.7805 19.4784C11.9988 19.5218 12.225 19.4995 12.4305 19.4144C12.6361 19.3292 12.8118 19.185 12.9354 19C13.059 18.815 13.125 18.5975 13.125 18.375C13.125 18.0766 13.0065 17.7905 12.7955 17.5795C12.5845 17.3685 12.2984 17.25 12 17.25Z"
            fill="currentColor"
          />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="z-[300] absolute end-0 top-full mt-[6px] min-w-[140px] bg-newBgColorInner p-[8px] menu-shadow flex flex-col rounded-[8px] border border-newBorder"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor"
          >
            {t('rename', 'Rename')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canMoveUp}
            onClick={() => {
              setOpen(false);
              onMove('up');
            }}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            {t('move_up', 'Move up')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canMoveDown}
            onClick={() => {
              setOpen(false);
              onMove('down');
            }}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            {t('move_down', 'Move down')}
          </button>
        </div>
      )}
    </div>
  );
};

const ChannelMenuGroup: FC<
  ChannelMenuProps & {
    collapsed: boolean;
    group: ChannelGroup;
    groupIndex: number;
    namedGroupCount: number;
    onReorderGroup: (customerId: string, direction: 'up' | 'down') => void;
    onRenameGroup: (customerId: string, name: string) => Promise<void>;
  }
> = ({
  group,
  collapsed,
  onGroupChange,
  groupIndex,
  namedGroupCount,
  onReorderGroup,
  onRenameGroup,
  ...props
}) => {
    const t = useT();
    const modal = useModals();
    const [isOpen, setIsOpen] = useState(
      () =>
        typeof window === 'undefined' ||
        !!+(localStorage.getItem(`${group.name}_isOpen`) || '1')
    );
    const [{ isOver }, drop] = useDrop(
      () => ({
        accept: 'menu',
        canDrop: () => !!onGroupChange,
        drop: (item: { id: string }) => onGroupChange?.(item.id, group.id),
        collect: (monitor) => ({
          isOver: !!monitor.isOver() && !!monitor.canDrop(),
        }),
      }),
      [onGroupChange, group.id]
    );
    const changeOpenClose = useCallback(() => {
      setIsOpen((open) => {
        localStorage.setItem(`${group.name}_isOpen`, open ? '0' : '1');
        return !open;
      });
    }, [group.name]);

    const openRename = useCallback(() => {
      modal.openModal({
        title: t('rename_group', 'Rename group'),
        classNames: {
          modal: 'md',
        },
        children: (
          <CustomerRenameModal
            name={group.name}
            onSave={(name) => onRenameGroup(group.id, name)}
          />
        ),
      });
    }, [group.id, group.name, modal, onRenameGroup, t]);

    return (
      <div
        className="gap-[8px] flex flex-col relative"
        ref={(node) => {
          drop(node);
        }}
      >
        {isOver && (
          <div className="absolute start-0 top-0 w-full h-full pointer-events-none">
            <div className="bg-white/30 w-full h-full p-[8px] box-content rounded-md" />
          </div>
        )}
        {!!group.name && (
          <div className="flex items-center justify-between gap-[4px]">
            <button
              className="flex flex-1 min-w-0 items-center gap-[5px] cursor-pointer text-start"
              onClick={changeOpenClose}
              type="button"
            >
              <span className="shrink-0">
                <OpenClose isOpen={isOpen} />
              </span>
              <span
                className="min-w-0 flex-1 truncate"
                {...(collapsed && {
                  'data-tooltip-id': 'tooltip',
                  'data-tooltip-content': group.name,
                })}
              >
                {group.name}
              </span>
            </button>
            {!collapsed && (
              <CustomerGroupMenu
                canMoveUp={groupIndex > 0}
                canMoveDown={groupIndex < namedGroupCount - 1}
                onMove={(direction) => onReorderGroup(group.id, direction)}
                onRename={openRename}
              />
            )}
          </div>
        )}
        <div
          className={clsx('gap-[12px] flex flex-col relative', !isOpen && 'hidden')}
        >
          {group.values.map((integration) => (
            <ChannelMenuRow
              {...props}
              collapsed={collapsed}
              enableDrag={!!onGroupChange}
              key={integration.id}
              integration={integration}
            />
          ))}
        </div>
      </div>
    );
  };

export const ChannelMenu: FC<ChannelMenuProps & { collapsed: boolean }> = ({
  integrations,
  collapsed,
  ...props
}) => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();
  const groups = useMemo(
    () => groupChannelsByCustomer(integrations),
    [integrations]
  );
  const namedGroupCount = groups.filter((group) => group.id).length;

  const onReorderGroup = useCallback(
    async (customerId: string, direction: 'up' | 'down') => {
      await mutate(
        '/integrations/list',
        (current?: IntegrationListItem[]) =>
          swapCustomerPositions(current || integrations, customerId, direction),
        { revalidate: false }
      );
      try {
        const response = await fetch(
          `/integrations/customers/${customerId}/reorder`,
          {
            method: 'POST',
            body: JSON.stringify({ direction }),
          }
        );
        if (!response.ok) {
          throw new Error('Unable to reorder customer group');
        }
      } catch {
        await mutate('/integrations/list');
        return;
      }
      await mutate('/integrations/list');
    },
    [fetch, integrations, mutate]
  );

  const onRenameGroup = useCallback(
    async (customerId: string, name: string) => {
      const response = await fetch(`/integrations/customers/${customerId}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw new Error('Unable to rename customer group');
      }
      await mutate(
        '/integrations/list',
        (current?: IntegrationListItem[]) =>
          (current || integrations).map((integration) =>
            integration.customer?.id === customerId
              ? {
                ...integration,
                customer: { ...integration.customer, name },
              }
              : integration
          ),
        { revalidate: true }
      );
    },
    [fetch, integrations, mutate]
  );

  let namedIndex = -1;

  return (
    <div className="flex flex-col gap-[16px]">
      {groups.map((group) => {
        if (group.id) {
          namedIndex += 1;
        }
        return (
          <ChannelMenuGroup
            {...props}
            collapsed={collapsed}
            group={group}
            groupIndex={namedIndex}
            integrations={integrations}
            key={group.id || 'ungrouped'}
            namedGroupCount={namedGroupCount}
            onReorderGroup={onReorderGroup}
            onRenameGroup={onRenameGroup}
          />
        );
      })}
    </div>
  );
};

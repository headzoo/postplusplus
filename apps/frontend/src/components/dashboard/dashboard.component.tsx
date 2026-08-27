'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useDrag, useDrop } from 'react-dnd';
import { useClickOutside } from '@mantine/hooks';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import {
  ChannelMenu,
  ChannelsSidebar,
  groupChannelsByCustomer,
} from '@gitroom/frontend/components/launches/channels.sidebar';
import {
  resolveChannelId,
  setLastChannelId,
} from '@gitroom/frontend/components/launches/helpers/last-channel';
import {
  IntegrationListItem,
  useIntegrationList,
} from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useIntegrationNoticeStatus } from '@gitroom/frontend/components/launches/helpers/use.integration.notice.status';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useRouter } from 'next/navigation';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import {
  AnalyticsCard,
  analyticsTotal,
  buildMetricDayPath,
  CollectAnalyticsButton,
  MetricDayBarClick,
} from '@gitroom/frontend/components/platform-analytics/render.analytics';
import {
  DashboardAnalyticsMetric,
  DashboardChannelAnalytics,
  useDashboardAnalytics,
} from './use.dashboard.analytics';
import {
  applyDashboardAnalyticsPreferences,
  buildDashboardAnalyticsPreferences,
  dashboardMetricIdentity,
  reorderVisibleKeys,
} from './dashboard.analytics.layout';
import { useDashboardAnalyticsPreferences } from './use.dashboard.analytics.preferences';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import { PlusIcon } from '@gitroom/frontend/components/ui/icons';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const dateOptions: Array<7 | 30 | 90> = [7, 30, 90];
const dashboardStatDragType = 'dashboard-analytics-stat';

const ChannelState = ({
  channel,
  empty,
  collecting,
  onCollect,
  canCollect,
}: {
  channel: DashboardChannelAnalytics;
  empty?: boolean;
  collecting?: boolean;
  onCollect?: () => void;
  canCollect?: boolean;
}) => {
  const message = empty
    ? collecting
      ? 'Analytics collection started. This may take a few minutes.'
      : 'No analytics data for this period'
    : channel.state === 'unsupported'
    ? 'Analytics not supported'
    : channel.state === 'unavailable'
    ? 'Reconnect or refresh this channel to view analytics'
    : channel.state === 'disabled'
    ? 'Channel disabled'
    : null;

  if (!message) {
    return null;
  }

  return (
    <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader px-[20px] py-[24px] text-[14px] text-newTableText text-center">
      {message}
      {empty && canCollect && (
        <CollectAnalyticsButton
          integrationId={channel.id}
          providerIdentifier={channel.identifier}
          disabled={collecting}
          onQueued={onCollect}
        />
      )}
    </div>
  );
};

const SortableAnalyticsCard: FC<{
  metric: DashboardAnalyticsMetric;
  index: number;
  integrationId: string;
  onBarClick: (params: MetricDayBarClick) => void;
  onRemove: () => void;
  onReorderLocal: (from: number, to: number) => void;
  onDragEnd: () => void;
}> = ({
  metric,
  index,
  integrationId,
  onBarClick,
  onRemove,
  onReorderLocal,
  onDragEnd,
}) => {
  const metricKey = dashboardMetricIdentity(metric);
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: dashboardStatDragType,
      item: { id: metricKey, index },
      end: () => {
        onDragEnd();
      },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [index, metricKey, onDragEnd]
  );
  const [, drop] = useDrop(
    () => ({
      accept: dashboardStatDragType,
      hover: (dragged: {
        id: string;
        index: number;
        lastTargetId?: string;
      }) => {
        if (dragged.id === metricKey || dragged.lastTargetId === metricKey) {
          return;
        }
        if (dragged.index !== index) {
          onReorderLocal(dragged.index, index);
          dragged.index = index;
        }
        dragged.lastTargetId = metricKey;
      },
      drop: () => {
        onDragEnd();
      },
    }),
    [index, metricKey, onDragEnd, onReorderLocal]
  );

  return (
    <div
      // @ts-ignore react-dnd connector type
      ref={(node) => {
        drop(node);
      }}
    >
      <AnalyticsCard
        item={metric}
        total={analyticsTotal(metric)}
        index={index}
        integrationId={integrationId}
        onBarClick={onBarClick}
        onRemove={onRemove}
        isDragging={isDragging}
        dragHandleRef={(node) => {
          drag(node);
        }}
      />
    </div>
  );
};

const AddHiddenStatsButton: FC<{
  hiddenMetrics: DashboardAnalyticsMetric[];
  onAdd: (metricKey: string) => void;
}> = ({ hiddenMetrics, onAdd }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-[8px] bg-btnSimple text-newTableText hover:text-newTextColor"
        aria-label={t('add_stat', 'Add stat')}
      >
        <PlusIcon size={16} />
      </button>
      {open && (
        <div className="absolute end-0 top-[calc(100%+8px)] z-20 min-w-[220px] rounded-[10px] border border-newTableBorder bg-newBgColorInner p-[8px] shadow-lg">
          <div className="px-[8px] py-[6px] text-[12px] text-newTableText">
            {t('add_hidden_stats', 'Add hidden stats')}
          </div>
          {hiddenMetrics.length ? (
            <div className="flex max-h-[240px] flex-col gap-[4px] overflow-y-auto">
              {hiddenMetrics.map((metric) => {
                const key = dashboardMetricIdentity(metric);
                return (
                  <button
                    key={key}
                    type="button"
                    className="rounded-[6px] px-[10px] py-[8px] text-start text-[13px] hover:bg-btnSimple"
                    onClick={() => {
                      onAdd(key);
                      setOpen(false);
                    }}
                  >
                    {metric.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-[10px] py-[8px] text-[13px] text-newTableText">
              {t('no_hidden_stats', 'No hidden stats')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const Dashboard = () => {
  const fetch = useFetch();
  const router = useRouter();
  const [date, setDate] = useState<7 | 30 | 90>(7);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>();
  const [polling, setPolling] = useState(false);
  const [localVisibleKeys, setLocalVisibleKeys] = useState<string[] | null>(
    null
  );
  const [localHiddenKeys, setLocalHiddenKeys] = useState<string[] | null>(null);
  const draggingRef = useRef(false);
  const layoutKeysRef = useRef<{ visible: string[]; hidden: string[] }>({
    visible: [],
    hidden: [],
  });
  const {
    data: integrations,
    isLoading: integrationsLoading,
    mutate: mutateIntegrations,
  } = useIntegrationList();
  const { data: noticeStatus, mutate: mutateNoticeStatus } =
    useIntegrationNoticeStatus();
  const groupedIntegrations = useMemo(
    () => groupChannelsByCustomer(integrations),
    [integrations]
  );

  useEffect(() => {
    const nextId = resolveChannelId({
      eligibleIds: integrations.map((integration) => integration.id),
      currentId: selectedIntegrationId,
      fallbackId: groupedIntegrations[0]?.values[0]?.id,
    });
    if (nextId === selectedIntegrationId) {
      return;
    }
    setSelectedIntegrationId(nextId);
  }, [groupedIntegrations, integrations, selectedIntegrationId]);

  const { data: channels, isLoading: analyticsLoading } = useDashboardAnalytics(
    date,
    selectedIntegrationId,
    polling ? 15_000 : 0
  );
  const {
    data: preferences = [],
    isLoading: preferencesLoading,
    savePreferences,
  } = useDashboardAnalyticsPreferences(selectedIntegrationId);
  const selectedChannel = channels?.[0];
  const selectedIntegration = integrations.find(
    (integration) => integration.id === selectedIntegrationId
  );

  useEffect(() => {
    setPolling(false);
  }, [selectedIntegrationId]);

  useEffect(() => {
    if (selectedChannel?.analytics.length) {
      setPolling(false);
    }
  }, [selectedChannel?.analytics.length]);

  useEffect(() => {
    if (!polling) {
      return;
    }
    const timeout = setTimeout(() => setPolling(false), 5 * 60 * 1000);
    timeout.unref?.();
    return () => clearTimeout(timeout);
  }, [polling]);

  useEffect(() => {
    setLocalVisibleKeys(null);
    setLocalHiddenKeys(null);
    draggingRef.current = false;
  }, [selectedIntegrationId]);

  const layout = useMemo(() => {
    if (!selectedChannel || !selectedIntegrationId) {
      return {
        visible: [] as DashboardAnalyticsMetric[],
        hidden: [] as DashboardAnalyticsMetric[],
      };
    }
    const applied = applyDashboardAnalyticsPreferences(
      selectedChannel.analytics,
      preferences,
      selectedIntegrationId
    );
    if (!localVisibleKeys && !localHiddenKeys) {
      return applied;
    }
    const byKey = new Map(
      selectedChannel.analytics.map((metric) => [
        dashboardMetricIdentity(metric),
        metric,
      ])
    );
    const visibleKeys =
      localVisibleKeys ||
      applied.visible.map((metric) => dashboardMetricIdentity(metric));
    const hiddenKeys =
      localHiddenKeys ||
      applied.hidden.map((metric) => dashboardMetricIdentity(metric));
    return {
      visible: visibleKeys
        .map((key) => byKey.get(key))
        .filter(Boolean) as DashboardAnalyticsMetric[],
      hidden: hiddenKeys
        .map((key) => byKey.get(key))
        .filter(Boolean) as DashboardAnalyticsMetric[],
    };
  }, [
    localHiddenKeys,
    localVisibleKeys,
    preferences,
    selectedChannel,
    selectedIntegrationId,
  ]);

  useEffect(() => {
    layoutKeysRef.current = {
      visible: layout.visible.map((metric) => dashboardMetricIdentity(metric)),
      hidden: layout.hidden.map((metric) => dashboardMetricIdentity(metric)),
    };
  }, [layout.hidden, layout.visible]);

  const persistLayout = useCallback(
    async (visibleKeys: string[], hiddenKeys: string[]) => {
      if (!selectedIntegrationId) {
        return;
      }
      const next = buildDashboardAnalyticsPreferences(
        selectedIntegrationId,
        visibleKeys,
        hiddenKeys
      );
      await savePreferences(next);
      setLocalVisibleKeys(null);
      setLocalHiddenKeys(null);
    },
    [savePreferences, selectedIntegrationId]
  );

  const changeItemGroup = useCallback(
    async (id: string, group: string) => {
      await mutateIntegrations(
        integrations.map((integration) =>
          integration.id === id
            ? { ...integration, customer: { id: group } }
            : integration
        ),
        false
      );
      await fetch(`/integrations/${id}/group`, {
        method: 'PUT',
        body: JSON.stringify({ group }),
      });
      await mutateIntegrations();
    },
    [fetch, integrations, mutateIntegrations]
  );
  const refreshChannel = useCallback(
    (integration: IntegrationListItem) => async () => {
      const { url } = await (
        await fetch(
          `/integrations/social/${integration.identifier}?refresh=${integration.internalId}`,
          { method: 'GET' }
        )
      ).json();
      window.location.href = url;
    },
    [fetch]
  );
  const continueIntegration = useCallback(
    (integration: IntegrationListItem) => () => {
      router.push(
        `/calendar?added=${integration.identifier}&continue=${integration.id}`
      );
    },
    [router]
  );
  const clearNotices = useCallback(
    (integrationId: string) => {
      void mutateNoticeStatus(
        (current) => {
          const statuses = { ...(current?.statuses || {}) };
          const existing = statuses[integrationId];
          if (existing) {
            statuses[integrationId] = {
              ...existing,
              unreadCount: 0,
              categories: undefined,
            };
          }
          return { statuses };
        },
        { revalidate: false }
      );
      void fetch(`/integrations/${integrationId}/notices/read`, {
        method: 'POST',
      });
    },
    [fetch, mutateNoticeStatus]
  );
  const handleBarClick = useCallback(
    ({ integrationId, drilldownSlug, date: day }: MetricDayBarClick) => {
      router.push(buildMetricDayPath(integrationId, drilldownSlug, day));
    },
    [router]
  );

  const onReorderLocal = useCallback(
    (from: number, to: number) => {
      draggingRef.current = true;
      setLocalVisibleKeys((current) => {
        const keys =
          current ||
          layout.visible.map((metric) => dashboardMetricIdentity(metric));
        return reorderVisibleKeys(keys, from, to);
      });
      setLocalHiddenKeys(
        (current) =>
          current ||
          layout.hidden.map((metric) => dashboardMetricIdentity(metric))
      );
    },
    [layout.hidden, layout.visible]
  );

  const onDragEnd = useCallback(() => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    void persistLayout(
      layoutKeysRef.current.visible,
      layoutKeysRef.current.hidden
    );
  }, [persistLayout]);

  const onRemoveMetric = useCallback(
    (metricKey: string) => {
      const visibleKeys = layout.visible
        .map((metric) => dashboardMetricIdentity(metric))
        .filter((key) => key !== metricKey);
      const hiddenKeys = [
        ...layout.hidden.map((metric) => dashboardMetricIdentity(metric)),
        metricKey,
      ];
      setLocalVisibleKeys(visibleKeys);
      setLocalHiddenKeys(hiddenKeys);
      void persistLayout(visibleKeys, hiddenKeys);
    },
    [layout.hidden, layout.visible, persistLayout]
  );

  const onAddMetric = useCallback(
    (metricKey: string) => {
      const visibleKeys = [
        ...layout.visible.map((metric) => dashboardMetricIdentity(metric)),
        metricKey,
      ];
      const hiddenKeys = layout.hidden
        .map((metric) => dashboardMetricIdentity(metric))
        .filter((key) => key !== metricKey);
      setLocalVisibleKeys(visibleKeys);
      setLocalHiddenKeys(hiddenKeys);
      void persistLayout(visibleKeys, hiddenKeys);
    },
    [layout.hidden, layout.visible, persistLayout]
  );

  if (integrationsLoading) {
    return (
      <div className="bg-newBgColorInner flex flex-1 items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <>
      <ChannelsSidebar
        integrationCount={integrations.length}
        onUpdate={() => void mutateIntegrations()}
      >
        {(collapsed) => (
          <div className="flex flex-col gap-[32px]">
            <ChannelMenu
              collapsed={collapsed}
              integrations={integrations}
              selectedIds={selectedIntegrationId ? [selectedIntegrationId] : []}
              onSelect={(integration) => {
                setLastChannelId(integration.id);
                setSelectedIntegrationId(integration.id);
              }}
              mutate={() => void mutateIntegrations()}
              onUpdate={() => void mutateIntegrations()}
              onGroupChange={(id, group) => void changeItemGroup(id, group)}
              onRefreshChannel={refreshChannel}
              onContinueIntegration={continueIntegration}
              noticeStatuses={noticeStatus?.statuses}
              onClearNotices={clearNotices}
            />
          </div>
        )}
      </ChannelsSidebar>
      <main className="bg-newBgColorInner flex-1 overflow-y-auto p-[20px]">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-[24px]">
          <div className="flex flex-wrap items-center justify-between gap-[12px]">
            <div className="min-w-0">
              <div className="flex items-center gap-[10px]">
                {selectedIntegration && (
                  <ImageWithFallback
                    fallbackSrc="/no-picture.jpg"
                    src={selectedIntegration.picture || '/no-picture.jpg'}
                    className="rounded-[8px]"
                    alt={selectedIntegration.identifier}
                    width={36}
                    height={36}
                  />
                )}
                <div className="min-w-0">
                  <h2 className="text-[20px] font-[600] truncate">
                    {selectedIntegration?.name || 'Channel analytics'}
                  </h2>
                  {selectedIntegration && (
                    <p className="text-[13px] text-newTableText truncate">
                      {selectedIntegration.display ||
                        selectedIntegration.identifier}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {!!selectedIntegration && (
              <div className="flex items-center gap-[8px]">
                <AddHiddenStatsButton
                  hiddenMetrics={layout.hidden}
                  onAdd={onAddMetric}
                />
                <div className="flex rounded-[8px] bg-btnSimple p-[4px]">
                  {dateOptions.map((option) => (
                    <button
                      key={option}
                      className={clsx(
                        'rounded-[6px] px-[12px] py-[6px] text-[13px]',
                        date === option && 'bg-newBgColorInner shadow-sm'
                      )}
                      onClick={() => setDate(option)}
                    >
                      {option} days
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {integrations.length === 0 && (
            <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader px-[24px] py-[48px] text-center">
              <h3 className="text-[18px] font-[600]">No channels yet</h3>
              <p className="mt-[8px] text-[14px] text-newTableText">
                Add a provider from the Channels sidebar to see analytics here.
              </p>
            </div>
          )}

          {!!selectedIntegration &&
            (analyticsLoading || preferencesLoading) && (
              <div className="flex flex-1 items-center justify-center py-[48px]">
                <LoadingComponent />
              </div>
            )}

          {!!selectedChannel && !analyticsLoading && !preferencesLoading && (
            <section className="flex flex-col gap-[14px]">
              {selectedChannel.state === 'ok' ? (
                selectedChannel.analytics.length ? (
                  layout.visible.length ? (
                    <DNDProvider>
                      <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 xl:grid-cols-3">
                        {layout.visible.map((metric, index) => (
                          <SortableAnalyticsCard
                            key={`${
                              selectedChannel.id
                            }-${dashboardMetricIdentity(metric)}`}
                            metric={metric}
                            index={index}
                            integrationId={selectedChannel.id}
                            onBarClick={handleBarClick}
                            onRemove={() =>
                              onRemoveMetric(dashboardMetricIdentity(metric))
                            }
                            onReorderLocal={onReorderLocal}
                            onDragEnd={onDragEnd}
                          />
                        ))}
                      </div>
                    </DNDProvider>
                  ) : (
                    <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader px-[20px] py-[24px] text-[14px] text-newTableText text-center">
                      All stats are hidden. Use the + button to add them back.
                    </div>
                  )
                ) : (
                  <ChannelState
                    channel={selectedChannel}
                    empty
                    collecting={polling}
                    canCollect={!selectedIntegration?.refreshNeeded}
                    onCollect={() => setPolling(true)}
                  />
                )
              ) : (
                <ChannelState channel={selectedChannel} />
              )}
            </section>
          )}
        </div>
      </main>
    </>
  );
};

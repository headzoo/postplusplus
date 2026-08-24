'use client';

import React, { FC, KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useSWRConfig } from 'swr';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import { ChannelMenu } from '@gitroom/frontend/components/launches/channels.sidebar';
import {
  IntegrationListItem,
  useIntegrationList,
} from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import {
  ChannelDetails,
  ChannelStrategyPublicSummary,
  channelStrategyOptions,
  ChannelSubscriptionDetail,
  useChannelDetails,
} from '@gitroom/frontend/components/settings/use.channel.details';
import { ChannelTrackingAlert } from '@gitroom/frontend/components/settings/channel-tracking-alert.component';
import { ChannelAdditionalSettingsForm } from '@gitroom/frontend/components/launches/settings.modal';
import {
  ChannelInteractionKindCoverage,
  ChannelInteractionTrackingFailureCategory,
  FollowerPageTracking,
} from '@gitroom/frontend/components/followers/use.followers';
import { FALLBACK_CHANNEL_STRATEGY_ID } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.registry';
import type { ChannelStrategyId } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.types';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const TRACKING_STATE_LABELS: Record<string, { key: string; defaultLabel: string }> = {
  active: { key: 'channel_tracking_active', defaultLabel: 'Active' },
  partial: { key: 'channel_tracking_partial', defaultLabel: 'Partial' },
  error: { key: 'channel_tracking_error', defaultLabel: 'Error' },
  provisioning: {
    key: 'channel_tracking_provisioning',
    defaultLabel: 'Provisioning',
  },
  unconfigured: {
    key: 'channel_tracking_unconfigured',
    defaultLabel: 'Unconfigured',
  },
  unsupported: {
    key: 'channel_tracking_unsupported',
    defaultLabel: 'Unsupported',
  },
};

const FAILURE_MESSAGES: Record<
  ChannelInteractionTrackingFailureCategory,
  { key: string; defaultLabel: string }
> = {
  configuration: {
    key: 'followers_tracking_configuration',
    defaultLabel:
      'Interaction tracking needs channel configuration before it can start.',
  },
  authentication: {
    key: 'followers_tracking_authentication',
    defaultLabel:
      'Interaction tracking needs authentication. Reconnecting the channel may help.',
  },
  authorization: {
    key: 'followers_tracking_authorization',
    defaultLabel:
      'Interaction tracking does not have the required channel permissions.',
  },
  entitlement: {
    key: 'followers_tracking_entitlement',
    defaultLabel:
      'Your provider plan does not include this interaction tracking feature.',
  },
  quota: {
    key: 'followers_tracking_quota',
    defaultLabel:
      'The provider tracking quota has been reached. Tracking will resume when capacity is available.',
  },
  transient: {
    key: 'followers_tracking_transient',
    defaultLabel: 'The provider is temporarily unavailable. We will retry tracking setup.',
  },
  unknown: {
    key: 'followers_tracking_unknown',
    defaultLabel: 'Interaction tracking could not be set up right now.',
  },
};

const formatTimestamp = (value?: string) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const DetailRow: FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="grid grid-cols-[140px_1fr] gap-[12px] text-[14px] items-start">
    <div className="text-newTextColor uppercase text-[12px] tracking-wide pt-[2px]">
      {label}
    </div>
    <div className="min-w-0 break-words">{children}</div>
  </div>
);

const trackingFailureMessage = (
  tracking: FollowerPageTracking,
  t: ReturnType<typeof useT>
) => {
  if (tracking.failedSubscriptions?.length) {
    if (tracking.failedSubscriptions.length > 1) {
      return t(
        'channel_tracking_multiple_failures',
        '{{count}} tracking subscriptions failed. See the subscriptions list below for details.',
        { count: tracking.failedSubscriptions.length }
      );
    }
    if (tracking.failedSubscriptions[0]?.reason) {
      return tracking.failedSubscriptions[0].reason;
    }
  }
  if (tracking.reason) {
    return tracking.reason;
  }
  if (!tracking.failureCategory) {
    return undefined;
  }
  const message = FAILURE_MESSAGES[tracking.failureCategory];
  return t(message.key, message.defaultLabel);
};

const subscriptionSortRank = (state: string) => {
  if (state === 'error') return 0;
  if (state === 'provisioning') return 1;
  if (state === 'active') return 2;
  return 3;
};

const localizedStrategyCopy = (
  copy: ChannelStrategyPublicSummary['label'],
  t: ReturnType<typeof useT>
) => t(copy.key, copy.defaultValue);

const ChannelStrategySection: FC<{
  integrationId: string;
  strategyApplicable?: boolean;
  strategy?: ChannelStrategyPublicSummary;
  recomputing?: boolean;
  loading: boolean;
  onStrategyUpdated: () => Promise<unknown>;
}> = ({
  integrationId,
  strategyApplicable,
  strategy,
  recomputing,
  loading,
  onStrategyUpdated,
}) => {
    const t = useT();
    const toast = useToaster();
    const fetch = useFetch();
    const { mutate } = useSWRConfig();
    const persistedStrategyId = strategy?.id ?? FALLBACK_CHANNEL_STRATEGY_ID;
    const [selectedId, setSelectedId] =
      useState<ChannelStrategyId>(persistedStrategyId);
    const [saving, setSaving] = useState(false);
    const [recomputeNotice, setRecomputeNotice] = useState(false);

    useEffect(() => {
      setSelectedId(persistedStrategyId);
    }, [persistedStrategyId]);

    useEffect(() => {
      if (recomputing) {
        setRecomputeNotice(true);
      }
    }, [recomputing]);

    const hasChanges = selectedId !== persistedStrategyId;
    const showRecomputeNotice = recomputeNotice || !!recomputing;

    const handleOptionKeyDown = useCallback(
      (strategyId: ChannelStrategyId) =>
        (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!saving) {
              setSelectedId(strategyId);
            }
          }
        },
      [saving]
    );

    const saveStrategy = useCallback(async () => {
      if (!strategyApplicable || saving || !hasChanges) {
        return;
      }
      setSaving(true);
      try {
        const response = await fetch(`/integrations/${integrationId}/strategy`, {
          method: 'PUT',
          body: JSON.stringify({ strategyId: selectedId }),
        });
        if (!response.ok) {
          throw new Error('strategy save failed');
        }
        const body = (await response.json()) as {
          strategy?: ChannelStrategyPublicSummary;
          recomputeRequested?: boolean;
        };
        setRecomputeNotice(!!body.recomputeRequested || !!recomputing);
        await Promise.all([
          onStrategyUpdated(),
          mutate('/integrations/list'),
          mutate('/followers/channels'),
        ]);
        toast.show(
          t('channel_strategy_saved', 'Channel strategy updated.'),
          'success'
        );
      } catch {
        setSelectedId(persistedStrategyId);
        toast.show(
          t(
            'channel_strategy_save_failed',
            'Could not update the channel strategy.'
          )
        );
      } finally {
        setSaving(false);
      }
    }, [
      fetch,
      hasChanges,
      integrationId,
      mutate,
      onStrategyUpdated,
      persistedStrategyId,
      recomputing,
      saving,
      selectedId,
      strategyApplicable,
      t,
      toast,
    ]);

    if (loading && strategyApplicable === undefined) {
      return (
        <div className="flex flex-col gap-[10px] border border-newBorder rounded-[8px] p-[16px]">
          <div className="text-[16px] font-[500]">
            {t('channel_strategy', 'Channel strategy')}
          </div>
          <div className="text-[14px] text-newTextColor">
            {t('loading', 'Loading...')}
          </div>
        </div>
      );
    }

    if (strategyApplicable === false) {
      return (
        <div className="flex flex-col gap-[10px] border border-newBorder rounded-[8px] p-[16px]">
          <div className="text-[16px] font-[500]">
            {t('channel_strategy', 'Channel strategy')}
          </div>
          <div className="text-[14px] text-newTextColor">
            {t(
              'channel_strategy_not_applicable',
              'Not available for this channel because it does not expose follower identities.'
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-[12px] border border-newBorder rounded-[8px] p-[16px]">
        <div>
          <div className="text-[16px] font-[500]">
            {t('channel_strategy', 'Channel strategy')}
          </div>
          <div className="text-[13px] text-newTextColor mt-[4px]">
            {t(
              'channel_strategy_description',
              'Choose how relationship grades and Followers defaults prioritize people on this channel.'
            )}
          </div>
        </div>

        {showRecomputeNotice && (
          <div className="rounded-[10px] border border-sky-500/30 bg-sky-500/10 px-[14px] py-[12px] text-[13px] text-sky-100">
            {t(
              'channel_strategy_recomputing',
              'Relationship rankings are updating. Existing grades stay visible while the new strategy is applied.'
            )}
          </div>
        )}

        <div
          className="flex flex-col gap-[10px]"
          role="radiogroup"
          aria-label={t('channel_strategy', 'Channel strategy')}
        >
          {channelStrategyOptions.map((option) => {
            const label = localizedStrategyCopy(option.label, t);
            const description = localizedStrategyCopy(option.description, t);
            const isSelected = selectedId === option.id;
            const isDefault = option.id === FALLBACK_CHANNEL_STRATEGY_ID;
            const optionLabel = isDefault
              ? `${label} (${t('channel_strategy_default', 'Default')})`
              : label;

            return (
              <div
                key={option.id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={saving ? -1 : 0}
                onClick={() => {
                  if (!saving) {
                    setSelectedId(option.id);
                  }
                }}
                onKeyDown={handleOptionKeyDown(option.id)}
                className={clsx(
                  'border rounded-[8px] p-[12px] flex flex-col gap-[6px] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary',
                  isSelected
                    ? 'border-btnPrimary bg-btnPrimary/10'
                    : 'border-newBorder hover:bg-boxHover',
                  saving && 'opacity-60 cursor-not-allowed'
                )}
              >
                <div className="flex items-center justify-between gap-[8px] text-[14px] font-[500]">
                  <span>{optionLabel}</span>
                  {isSelected && (
                    <span className="text-[12px] uppercase tracking-wide text-emerald-300">
                      {t('selected', 'Selected')}
                    </span>
                  )}
                </div>
                <div className="text-[13px] text-newTextColor">{description}</div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            loading={saving}
            disabled={saving || !hasChanges}
            onClick={saveStrategy}
          >
            {t('save', 'Save')}
          </Button>
        </div>
      </div>
    );
  };

const ChannelDetailPanel: FC<{
  integration: IntegrationListItem;
  details?: ChannelDetails;
  loading: boolean;
  onRefreshOauth: () => void;
  refreshing: boolean;
  onAuthorizeTracking: () => void;
  authorizing: boolean;
  onStrategyUpdated: () => Promise<unknown>;
}> = ({
  integration,
  details,
  loading,
  onRefreshOauth,
  refreshing,
  onAuthorizeTracking,
  authorizing,
  onStrategyUpdated,
}) => {
    const t = useT();
    const tracking = details?.tracking;
    const stateLabel = tracking
      ? TRACKING_STATE_LABELS[tracking.state] || TRACKING_STATE_LABELS.unsupported
      : undefined;
    const failure = tracking ? trackingFailureMessage(tracking, t) : undefined;
    const showTrackingAlert =
      tracking?.state === 'error' || tracking?.state === 'partial';

    return (
      <div className="flex flex-col gap-[20px] min-w-0">
        <div className="flex items-start justify-between gap-[12px]">
          <div className="min-w-0">
            <div className="text-[20px] font-[500] truncate">{integration.name}</div>
            <div className="text-[14px] text-newTextColor truncate">
              {integration.display || integration.identifier}
            </div>
          </div>
          <div className="flex gap-[8px] shrink-0">
            {details?.trackingAuthorization && (
              <Button
                type="button"
                secondary
                loading={authorizing}
                disabled={authorizing}
                onClick={onAuthorizeTracking}
              >
                {details.trackingAuthorization.connected
                  ? t('reauthorize_tracking', 'Reauthorize tracking')
                  : t('authorize_tracking', 'Authorize tracking')}
              </Button>
            )}
            <Button
              type="button"
              secondary
              loading={refreshing}
              disabled={refreshing}
              onClick={onRefreshOauth}
            >
              {t('refresh_oauth', 'Refresh OAuth')}
            </Button>
          </div>
        </div>

        {details?.trackingAuthorization &&
          !details.trackingAuthorization.connected && (
            <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-[14px] py-[12px] text-[13px] text-amber-100">
              {t(
                'tracking_authorization_needed',
                'Some interaction events need an extra permission grant before they can be tracked. Use Authorize tracking to give it.'
              )}
            </div>
          )}

        <div className="flex flex-col gap-[10px] border border-newBorder rounded-[8px] p-[16px]">
          <DetailRow label={t('provider', 'Provider')}>
            {integration.identifier}
          </DetailRow>
          <DetailRow label={t('account_id', 'Account ID')}>
            {details?.internalId || integration.internalId || '—'}
          </DetailRow>
          <DetailRow label={t('status', 'Status')}>
            {details?.deleted
              ? t('deleted', 'Deleted')
              : integration.disabled
                ? t('disabled', 'Disabled')
                : integration.refreshNeeded
                  ? t('reconnect_needed', 'Reconnect needed')
                  : integration.inBetweenSteps
                    ? t('setup_incomplete', 'Setup incomplete')
                    : t('connected', 'Connected')}
          </DetailRow>
          {details?.profileUrl && (
            <DetailRow label={t('profile', 'Profile')}>
              <a
                href={details.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {details.profileUrl}
              </a>
            </DetailRow>
          )}
        </div>

        {loading && !details ? (
          <div className="flex justify-center py-[40px]">
            <LoadingComponent />
          </div>
        ) : (
          <>
            {showTrackingAlert && (
              <ChannelTrackingAlert
                channelName={integration.display || integration.name}
                tracking={tracking}
                subscriptions={details?.subscriptions}
              />
            )}

            <div className="flex flex-col gap-[10px] border border-newBorder rounded-[8px] p-[16px]">
              <div className="text-[16px] font-[500]">
                {t('interaction_tracking', 'Interaction tracking')}
              </div>
              <DetailRow label={t('state', 'State')}>
                {stateLabel
                  ? t(stateLabel.key, stateLabel.defaultLabel)
                  : '—'}
              </DetailRow>
              {tracking?.availability && (
                <DetailRow label={t('availability', 'Availability')}>
                  {tracking.availability}
                </DetailRow>
              )}
              {failure && (
                <DetailRow label={t('reason', 'Reason')}>{failure}</DetailRow>
              )}
              <DetailRow label={t('tracking_started', 'Tracking started')}>
                {formatTimestamp(tracking?.trackingStartedAt)}
              </DetailRow>
              <DetailRow label={t('follower_sync', 'Follower sync')}>
                {formatTimestamp(tracking?.followerSnapshotAt)}
              </DetailRow>
            </div>

            <ChannelStrategySection
              integrationId={integration.id}
              strategyApplicable={details?.strategyApplicable}
              strategy={details?.strategy}
              recomputing={details?.recomputing}
              loading={loading}
              onStrategyUpdated={onStrategyUpdated}
            />

            <ChannelAdditionalSettingsForm
              key={integration.id}
              integration={integration}
            />

            <CoverageTable coverage={tracking?.coverage} />
            <SubscriptionsTable subscriptions={details?.subscriptions || []} />
          </>
        )}
      </div>
    );
  };

const CoverageTable: FC<{ coverage?: ChannelInteractionKindCoverage[] }> = ({
  coverage,
}) => {
  const t = useT();
  if (!coverage?.length) {
    return null;
  }
  return (
    <div className="flex flex-col gap-[10px] border border-newBorder rounded-[8px] p-[16px]">
      <div className="text-[16px] font-[500]">{t('coverage', 'Coverage')}</div>
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-[8px] text-[12px] uppercase text-newTextColor">
        <div>{t('kind', 'Kind')}</div>
        <div>{t('inbound', 'Inbound')}</div>
        <div>{t('outbound', 'Outbound')}</div>
      </div>
      {coverage.map((item) => (
        <div
          key={item.kind}
          className="grid grid-cols-[1fr_1fr_1fr] gap-[8px] text-[14px]"
        >
          <div>{item.kind}</div>
          <div>{item.inbound}</div>
          <div>{item.outbound}</div>
        </div>
      ))}
    </div>
  );
};

const SubscriptionsTable: FC<{ subscriptions: ChannelSubscriptionDetail[] }> = ({
  subscriptions,
}) => {
  const t = useT();
  const sortedSubscriptions = [...subscriptions].sort(
    (left, right) =>
      subscriptionSortRank(left.state) - subscriptionSortRank(right.state) ||
      `${left.eventKey}:${left.direction}`.localeCompare(
        `${right.eventKey}:${right.direction}`
      )
  );
  const errorCount = subscriptions.filter(
    (subscription) => subscription.state === 'error'
  ).length;

  return (
    <div className="flex flex-col gap-[10px] border border-newBorder rounded-[8px] p-[16px]">
      <div className="flex items-center justify-between gap-[8px]">
        <div className="text-[16px] font-[500]">
          {t('subscriptions', 'Subscriptions')}
        </div>
        {errorCount > 0 && (
          <div className="text-[12px] uppercase tracking-wide text-amber-300">
            {t('subscription_error_count', '{{count}} errors', {
              count: errorCount,
            })}
          </div>
        )}
      </div>
      {!subscriptions.length ? (
        <div className="text-[14px] text-newTextColor">
          {t('no_subscriptions', 'No tracking subscriptions yet.')}
        </div>
      ) : (
        <div className="flex flex-col gap-[12px]">
          {sortedSubscriptions.map((subscription) => (
            <div
              key={`${subscription.eventKey}:${subscription.direction}`}
              className={clsx(
                'border rounded-[8px] p-[12px] flex flex-col gap-[6px]',
                subscription.state === 'error'
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-newBorder'
              )}
            >
              <div className="flex justify-between gap-[8px] text-[14px]">
                <span>
                  {subscription.eventKey} · {subscription.direction}
                </span>
                <span
                  className={clsx(
                    'uppercase text-[12px]',
                    subscription.state === 'error' && 'text-amber-300',
                    subscription.state === 'active' && 'text-emerald-300'
                  )}
                >
                  {subscription.state}
                </span>
              </div>
              {subscription.remoteIdentifier && (
                <div className="text-[12px] text-newTextColor break-all">
                  {subscription.remoteIdentifier}
                </div>
              )}
              {subscription.reason && (
                <div className="text-[13px] text-amber-100">
                  {subscription.reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ChannelsSettings: FC = () => {
  const t = useT();
  const toast = useToaster();
  const fetch = useFetch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: integrations, isLoading } = useIntegrationList();
  const selectedFromUrl = searchParams.get('selected') || undefined;
  const [refreshing, setRefreshing] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);

  const selectedId = useMemo(() => {
    if (!integrations?.length) {
      return undefined;
    }
    if (
      selectedFromUrl &&
      integrations.some((item) => item.id === selectedFromUrl)
    ) {
      return selectedFromUrl;
    }
    return integrations[0].id;
  }, [integrations, selectedFromUrl]);

  const selected = useMemo(
    () => integrations?.find((item) => item.id === selectedId),
    [integrations, selectedId]
  );
  const details = useChannelDetails(selected?.id);

  const syncSelectedToUrl = useCallback(
    (id: string) => {
      if (id === selectedFromUrl) {
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set('selected', id);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams, selectedFromUrl]
  );

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    if (selectedId !== selectedFromUrl) {
      syncSelectedToUrl(selectedId);
    }
  }, [selectedId, selectedFromUrl, syncSelectedToUrl]);

  const refreshOauth = useCallback(async () => {
    if (!selected) {
      return;
    }
    setRefreshing(true);
    try {
      const response = await fetch(
        `/integrations/social/${selected.identifier}?refresh=${selected.internalId}`
      );
      const body = await response.json();
      if (!response.ok || !body?.url) {
        throw new Error('missing url');
      }
      window.location.href = body.url;
    } catch {
      setRefreshing(false);
      toast.show(t('oauth_refresh_failed', 'Could not start OAuth refresh.'));
    }
  }, [fetch, selected, t, toast]);

  const authorizeTracking = useCallback(async () => {
    if (!selected) {
      return;
    }
    setAuthorizing(true);
    try {
      const response = await fetch(
        `/integrations/${selected.id}/tracking-authorization`
      );
      const body = await response.json();
      if (!response.ok || !body?.url) {
        throw new Error('missing url');
      }
      window.location.href = body.url;
    } catch {
      setAuthorizing(false);
      toast.show(
        t(
          'tracking_authorization_failed',
          'Could not start the tracking authorization.'
        )
      );
    }
  }, [fetch, selected, t, toast]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-[40px]">
        <LoadingComponent />
      </div>
    );
  }

  if (!integrations?.length) {
    return (
      <div className="text-[14px]">
        {t('no_channels', 'No channels yet')}
      </div>
    );
  }

  return (
    <DNDProvider>
      <div className="flex gap-[20px] min-h-[480px]">
        <div className="w-[240px] shrink-0 overflow-y-auto">
          <ChannelMenu
            collapsed={false}
            integrations={integrations}
            selectedIds={selectedId ? [selectedId] : []}
            onSelect={(integration) => syncSelectedToUrl(integration.id)}
          />
        </div>
        <div
          className={clsx(
            'flex-1 min-w-0 overflow-y-auto',
            !selected && 'flex items-center justify-center text-newTextColor'
          )}
        >
          {selected ? (
            <ChannelDetailPanel
              integration={selected}
              details={details.data}
              loading={!!details.isLoading}
              onRefreshOauth={refreshOauth}
              refreshing={refreshing}
              onAuthorizeTracking={authorizeTracking}
              authorizing={authorizing}
              onStrategyUpdated={details.mutate}
            />
          ) : (
            t('select_a_channel', 'Select a channel')
          )}
        </div>
      </div>
    </DNDProvider>
  );
};

'use client';

import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
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
  ChannelSubscriptionDetail,
  useChannelDetails,
} from '@gitroom/frontend/components/settings/use.channel.details';
import { ChannelTrackingAlert } from '@gitroom/frontend/components/settings/channel-tracking-alert.component';
import { ChannelStrategySection } from '@gitroom/frontend/components/settings/channel-strategy-section';
import {
  ChannelAdditionalSettingsForm,
  isConnectionAdditionalSetting,
} from '@gitroom/frontend/components/launches/settings.modal';
import { Slider } from '@gitroom/react/form/slider';
import { GlobalIcon, TagIcon } from '@gitroom/frontend/components/ui/icons';
import {
  ChannelInteractionKindCoverage,
  ChannelInteractionTrackingFailureCategory,
  FollowerPageTracking,
} from '@gitroom/frontend/components/followers/use.followers';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isValidUtmParamsString } from '@gitroom/helpers/utils/utm.params';
import {
  resolveChannelId,
  setLastChannelId,
} from '@gitroom/frontend/components/launches/helpers/last-channel';

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

const CONNECTION_ACCENT = {
  text: 'text-sky-600 dark:text-sky-400',
  well: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
};

const LINK_TRACKING_ACCENT = {
  well: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
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

const ConnectionDetailField: FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex flex-col gap-[4px] min-w-0">
    <div className="text-[11px] uppercase tracking-wide font-[500] text-newTextColor">
      {label}
    </div>
    <div className="text-[14px] min-w-0 break-words">{children}</div>
  </div>
);

const resolveChannelStatus = (
  integration: IntegrationListItem,
  details: ChannelDetails | undefined,
  t: ReturnType<typeof useT>
) => {
  if (details?.deleted) {
    return {
      label: t('deleted', 'Deleted'),
      badgeClassName: 'border-red-500/30 bg-red-500/10 text-red-300',
      dotClassName: 'bg-red-400',
    };
  }
  if (integration.disabled) {
    return {
      label: t('disabled', 'Disabled'),
      badgeClassName: 'border-newSep bg-boxHover text-newTextColor',
      dotClassName: 'bg-newTextColor',
    };
  }
  if (integration.refreshNeeded) {
    return {
      label: t('reconnect_needed', 'Reconnect needed'),
      badgeClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      dotClassName: 'bg-amber-400',
    };
  }
  if (integration.inBetweenSteps) {
    return {
      label: t('setup_incomplete', 'Setup incomplete'),
      badgeClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      dotClassName: 'bg-amber-400',
    };
  }
  return {
    label: t('channel_status_connected', 'Connected'),
    badgeClassName: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    dotClassName: 'bg-emerald-400',
  };
};

const ChannelConnectionSection: FC<{
  integration: IntegrationListItem;
  details?: ChannelDetails;
  onSettingsUpdated: () => Promise<unknown>;
}> = ({ integration, details, onSettingsUpdated }) => {
  const t = useT();
  const toast = useToaster();
  const fetch = useFetch();
  const { mutate } = useSWRConfig();
  const persistedSettings = useMemo(
    () => JSON.parse(integration.additionalSettings || '[]') as Array<{
      title: string;
      description?: string;
      value: boolean;
    }>,
    [integration.additionalSettings]
  );
  const connectionSetting = persistedSettings.find(isConnectionAdditionalSetting);
  const [connectionEnabled, setConnectionEnabled] = useState(
    !!connectionSetting?.value
  );
  const [saving, setSaving] = useState(false);
  const status = resolveChannelStatus(integration, details, t);

  useEffect(() => {
    setConnectionEnabled(!!connectionSetting?.value);
  }, [connectionSetting?.value, integration.id]);

  const saveConnectionSetting = useCallback(
    async (nextValue: boolean) => {
      if (!connectionSetting || saving) {
        return;
      }
      const previousValue = connectionEnabled;
      setConnectionEnabled(nextValue);
      setSaving(true);
      try {
        const otherSettings = persistedSettings.filter(
          (setting) => !isConnectionAdditionalSetting(setting)
        );
        const nextSettings = [
          ...otherSettings,
          { ...connectionSetting, value: nextValue },
        ];
        const response = await fetch(`/integrations/${integration.id}/settings`, {
          method: 'POST',
          body: JSON.stringify({
            additionalSettings: JSON.stringify(nextSettings),
          }),
        });
        if (!response.ok) {
          throw new Error('connection setting save failed');
        }
        await Promise.all([
          onSettingsUpdated(),
          mutate('/integrations/list'),
        ]);
        toast.show(t('settings_updated', 'Settings Updated'), 'success');
      } catch {
        setConnectionEnabled(previousValue);
        toast.show(
          t('channel_settings_save_error', 'Failed to save channel settings'),
          'warning'
        );
      } finally {
        setSaving(false);
      }
    },
    [
      connectionSetting,
      connectionEnabled,
      fetch,
      integration.id,
      mutate,
      onSettingsUpdated,
      persistedSettings,
      saving,
      t,
      toast,
    ]
  );

  return (
    <div className="flex flex-col gap-[16px] border border-newBorder rounded-[8px] p-[16px]">
      <div className="flex flex-col gap-[8px]">
        <div className="flex items-start justify-between gap-[12px]">
          <div className="flex items-center gap-[10px] min-w-0">
            <div
              className={clsx(
                'size-9 shrink-0 rounded-full flex items-center justify-center',
                CONNECTION_ACCENT.well
              )}
            >
              <GlobalIcon size={18} />
            </div>
            <div className="text-[16px] font-[500]">
              {t('channel_connection', 'Channel connection')}
            </div>
          </div>
          <div
            className={clsx(
              'shrink-0 inline-flex items-center gap-[6px] rounded-full border px-[10px] py-[4px] text-[12px]',
              status.badgeClassName
            )}
          >
            <span className={clsx('size-[6px] rounded-full', status.dotClassName)} />
            {status.label}
          </div>
        </div>
        <div className="text-[13px] text-newTextColor">
          {t(
            'channel_connection_description',
            'Provider account details and connection health for this channel.'
          )}
        </div>
      </div>

      <div className="rounded-[8px] border border-newBorder p-[16px] flex flex-col gap-[16px] min-w-0">
        <div
          className={clsx(
            'text-[11px] uppercase tracking-wide font-[500]',
            CONNECTION_ACCENT.text
          )}
        >
          {t('channel_connection_account_details', 'Account details')}
        </div>

        <div className="grid grid-cols-2 mobile:grid-cols-1 gap-[16px]">
          <ConnectionDetailField label={t('provider', 'Provider')}>
            {integration.identifier}
          </ConnectionDetailField>
          <ConnectionDetailField label={t('account_id', 'Account ID')}>
            {details?.internalId || integration.internalId || '—'}
          </ConnectionDetailField>
          <ConnectionDetailField label={t('status', 'Status')}>
            {status.label}
          </ConnectionDetailField>
          {details?.profileUrl ? (
            <ConnectionDetailField label={t('profile', 'Profile')}>
              <a
                href={details.profileUrl}
                target="_blank"
                rel="noreferrer"
                className={clsx('underline', CONNECTION_ACCENT.text)}
              >
                {details.profileUrl}
              </a>
            </ConnectionDetailField>
          ) : null}
        </div>

        {connectionSetting && (
          <div className="flex flex-col gap-[10px] border-t border-newBorder pt-[16px]">
            <div className="flex items-start justify-between gap-[12px]">
              <div className="min-w-0 flex flex-col gap-[4px]">
                <div className="text-[14px] font-[500]">{connectionSetting.title}</div>
                {connectionSetting.description && (
                  <div className="text-[13px] text-newTextColor">
                    {connectionSetting.description}
                  </div>
                )}
              </div>
              <Slider
                value={connectionEnabled ? 'on' : 'off'}
                disabled={saving}
                onChange={() => {
                  void saveConnectionSetting(!connectionEnabled);
                }}
                fill={true}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const InteractionTrackingSection: FC<{
  tracking?: FollowerPageTracking;
  stateLabel?: { key: string; defaultLabel: string };
  failure?: string;
  t: ReturnType<typeof useT>;
}> = ({ tracking, stateLabel, failure, t }) => (
  <div className="flex flex-col gap-[10px] border border-newBorder rounded-[8px] p-[16px]">
    <div className="text-[16px] font-[500]">
      {t('interaction_tracking', 'Interaction tracking')}
    </div>
    <DetailRow label={t('state', 'State')}>
      {stateLabel ? t(stateLabel.key, stateLabel.defaultLabel) : '—'}
    </DetailRow>
    {tracking?.availability && (
      <DetailRow label={t('availability', 'Availability')}>
        {tracking.availability}
      </DetailRow>
    )}
    {failure && <DetailRow label={t('reason', 'Reason')}>{failure}</DetailRow>}
    <DetailRow label={t('tracking_started', 'Tracking started')}>
      {formatTimestamp(tracking?.trackingStartedAt)}
    </DetailRow>
    <DetailRow label={t('follower_sync', 'Follower sync')}>
      {formatTimestamp(tracking?.followerSnapshotAt)}
    </DetailRow>
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

const ChannelLinkTrackingSection: FC<{
  integrationId: string;
  utmParams?: string | null;
  loading: boolean;
  onUtmUpdated: () => Promise<unknown>;
}> = ({ integrationId, utmParams, loading, onUtmUpdated }) => {
  const t = useT();
  const toast = useToaster();
  const fetch = useFetch();
  const { mutate } = useSWRConfig();
  const persistedValue = utmParams || '';
  const [value, setValue] = useState(persistedValue);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setValue(persistedValue);
    setValidationError(null);
  }, [integrationId, persistedValue]);

  const hasChanges = value !== persistedValue;
  const isValid = isValidUtmParamsString(value);

  const saveUtmParams = useCallback(async () => {
    if (saving || !hasChanges || !isValid) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/integrations/${integrationId}/utm-params`, {
        method: 'PUT',
        body: JSON.stringify({ utmParams: value.trim() }),
      });
      if (!response.ok) {
        throw new Error('utm save failed');
      }
      await Promise.all([
        onUtmUpdated(),
        mutate('/integrations/list'),
      ]);
      toast.show(
        t('channel_utm_saved', 'Link tracking params updated.'),
        'success'
      );
    } catch {
      setValue(persistedValue);
      toast.show(
        t(
          'channel_utm_save_failed',
          'Could not update link tracking params.'
        )
      );
    } finally {
      setSaving(false);
    }
  }, [
    fetch,
    hasChanges,
    integrationId,
    isValid,
    mutate,
    onUtmUpdated,
    persistedValue,
    saving,
    t,
    toast,
    value,
  ]);

  if (loading && utmParams === undefined) {
    return (
      <div className="flex flex-col gap-[16px] border border-newBorder rounded-[8px] p-[16px]">
        <div className="flex items-center gap-[10px]">
          <div
            className={clsx(
              'size-9 shrink-0 rounded-full flex items-center justify-center',
              LINK_TRACKING_ACCENT.well
            )}
          >
            <TagIcon size={18} />
          </div>
          <div className="text-[16px] font-[500]">
            {t('channel_link_tracking', 'Link tracking')}
          </div>
        </div>
        <div className="text-[14px] text-newTextColor">
          {t('loading', 'Loading...')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px] border border-newBorder rounded-[8px] p-[16px]">
      <div className="flex flex-col gap-[8px]">
        <div className="flex items-center gap-[10px]">
          <div
            className={clsx(
              'size-9 shrink-0 rounded-full flex items-center justify-center',
              LINK_TRACKING_ACCENT.well
            )}
          >
            <TagIcon size={18} />
          </div>
          <div className="text-[16px] font-[500]">
            {t('channel_link_tracking', 'Link tracking')}
          </div>
        </div>
        <div className="text-[13px] text-newTextColor">
          {t(
            'channel_link_tracking_description',
            'Query params appended to http(s) links in post text when you save a post. Applied before shortlinks when shortlinking is enabled.'
          )}
        </div>
      </div>
      <div className="flex flex-col gap-[6px]">
        <label
          htmlFor={`channel-utm-${integrationId}`}
          className="text-[14px]"
        >
          {t('channel_utm_params', 'UTM / tracking params')}
        </label>
        <input
          id={`channel-utm-${integrationId}`}
          type="text"
          value={value}
          disabled={saving}
          placeholder="utm_campaign=spring&utm_medium=social"
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            setValidationError(
              isValidUtmParamsString(next)
                ? null
                : t(
                  'channel_utm_invalid',
                  'Enter a valid query string such as utm_campaign=spring&utm_medium=social'
                )
            );
          }}
          className="bg-input w-full p-[12px] outline-none border border-fifth rounded-[4px] text-inputText placeholder-inputText text-[14px]"
        />
        {validationError && (
          <div className="text-[12px] text-red-400">{validationError}</div>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          loading={saving}
          disabled={saving || !hasChanges || !isValid}
          onClick={saveUtmParams}
          aria-label={t('save_link_tracking_params', 'Save link tracking params')}
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

        <ChannelConnectionSection
          integration={integration}
          details={details}
          onSettingsUpdated={onStrategyUpdated}
        />

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

            <ChannelLinkTrackingSection
              integrationId={integration.id}
              utmParams={details?.utmParams ?? integration.utmParams ?? null}
              loading={loading}
              onUtmUpdated={onStrategyUpdated}
            />

            <InteractionTrackingSection
              tracking={tracking}
              stateLabel={stateLabel}
              failure={failure}
              t={t}
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
    const eligibleIds = integrations.map((item) => item.id);
    const urlId =
      selectedFromUrl && eligibleIds.includes(selectedFromUrl)
        ? selectedFromUrl
        : undefined;
    return resolveChannelId({
      eligibleIds,
      currentId: urlId,
      fallbackId: integrations[0].id,
    });
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
    if (pathname !== '/settings/channels' || !selectedId) {
      return;
    }
    if (selectedId !== selectedFromUrl) {
      syncSelectedToUrl(selectedId);
    }
  }, [pathname, selectedId, selectedFromUrl, syncSelectedToUrl]);

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
            onSelect={(integration) => {
              setLastChannelId(integration.id);
              syncSelectedToUrl(integration.id);
            }}
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

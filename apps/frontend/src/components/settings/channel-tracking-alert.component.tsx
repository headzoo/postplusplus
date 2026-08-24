'use client';

import React, { FC } from 'react';
import Link from 'next/link';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  FollowerPageTracking,
  ChannelInteractionTrackingFailureCategory,
} from '@gitroom/frontend/components/followers/use.followers';
import { ChannelSubscriptionDetail } from '@gitroom/frontend/components/settings/use.channel.details';

const FAILURE_FALLBACK: Record<
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
    defaultLabel:
      'The provider is temporarily unavailable. We will retry tracking setup.',
  },
  unknown: {
    key: 'followers_tracking_unknown',
    defaultLabel: 'Interaction tracking could not be set up right now.',
  },
};

const trackingSummary = (
  tracking: FollowerPageTracking,
  t: ReturnType<typeof useT>
) => {
  if (tracking.reason) {
    return tracking.reason;
  }
  if (tracking.failureCategory) {
    const message = FAILURE_FALLBACK[tracking.failureCategory];
    return t(message.key, message.defaultLabel);
  }
  if (tracking.state === 'partial') {
    return t(
      'channel_tracking_partial_summary',
      'Some interaction types are not being tracked. Webhook logs may be missing events until this is fixed.'
    );
  }
  return t(
    'channel_tracking_error_summary',
    'Interaction tracking is not fully set up for this channel.'
  );
};

export const ChannelTrackingAlert: FC<{
  channelName?: string;
  tracking?: FollowerPageTracking;
  subscriptions?: ChannelSubscriptionDetail[];
  settingsHref?: string;
}> = ({ channelName, tracking, subscriptions, settingsHref = '/settings/channels' }) => {
  const t = useT();

  if (!tracking || (tracking.state !== 'error' && tracking.state !== 'partial')) {
    return null;
  }

  const failedSubscriptions =
    tracking.failedSubscriptions?.length
      ? tracking.failedSubscriptions
      : subscriptions
        ?.filter((subscription) => subscription.state === 'error')
        .map((subscription) => ({
          eventKey: subscription.eventKey,
          direction: subscription.direction,
          ...(subscription.reason ? { reason: subscription.reason } : {}),
        })) || [];

  // Coverage-only partial states (e.g. a provider that cannot track outbound
  // replies) are inherent limitations, not failures, so they are not
  // actionable and should not raise an alert.
  if (!failedSubscriptions.length) {
    return null;
  }

  const title =
    tracking.state === 'partial'
      ? t('channel_tracking_partial_title', 'Interaction tracking is partial')
      : t('channel_tracking_error_title', 'Interaction tracking needs attention');

  return (
    <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-[14px] py-[12px] text-[13px] text-amber-100 flex flex-col gap-[8px]">
      <div className="font-[500] text-amber-300">
        {channelName ? `${channelName}: ${title}` : title}
      </div>
      <p>{trackingSummary(tracking, t)}</p>
      {failedSubscriptions.length > 0 && (
        <ul className="list-disc ps-[18px] text-amber-100/90">
          {failedSubscriptions.map((subscription) => (
            <li key={`${subscription.eventKey}:${subscription.direction}`}>
              <span className="font-[500]">
                {subscription.eventKey} · {subscription.direction}
              </span>
              {subscription.reason ? `: ${subscription.reason}` : ''}
            </li>
          ))}
        </ul>
      )}
      <div>
        <Link href={settingsHref} className="underline text-amber-200">
          {t('open_channel_settings', 'Open channel settings')}
        </Link>
      </div>
    </div>
  );
};

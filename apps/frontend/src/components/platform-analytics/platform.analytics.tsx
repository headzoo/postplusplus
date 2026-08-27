'use client';

import { useEffect, useMemo, useState } from 'react';
import { capitalize } from 'lodash';
import { RenderAnalytics } from '@gitroom/frontend/components/platform-analytics/render.analytics';
import { Select } from '@gitroom/react/form/select';
import { Button } from '@gitroom/react/form/button';
import { useRouter } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
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

const allowedIntegrations = [
  'facebook',
  'instagram',
  'instagram-standalone',
  'linkedin-page',
  'tiktok',
  'youtube',
  'gmb',
  'pinterest',
  'threads',
  'x',
];
export const PlatformAnalytics = () => {
  const t = useT();
  const router = useRouter();
  const { disableXAnalytics } = useVariables();

  const [selectedId, setSelectedId] = useState<string>();
  const [key, setKey] = useState(7);
  const [refresh, setRefresh] = useState(false);
  const toaster = useToaster();
  const { data: integrations = [], isLoading } = useIntegrationList();
  const analyticsIntegrations = useMemo(
    () =>
      integrations.filter((integration) => {
        if (integration.identifier === 'x' && disableXAnalytics) {
          return false;
        }
        return allowedIntegrations.includes(integration.identifier);
      }),
    [disableXAnalytics, integrations]
  );
  const groupedIntegrations = useMemo(
    () => groupChannelsByCustomer(analyticsIntegrations),
    [analyticsIntegrations]
  );

  useEffect(() => {
    const nextId = resolveChannelId({
      eligibleIds: analyticsIntegrations.map((integration) => integration.id),
      currentId: selectedId,
      fallbackId: groupedIntegrations[0]?.values[0]?.id,
    });
    if (nextId === selectedId) {
      return;
    }
    setSelectedId(nextId);
  }, [analyticsIntegrations, groupedIntegrations, selectedId]);

  const currentIntegration = useMemo(
    () =>
      analyticsIntegrations.find(
        (integration) => integration.id === selectedId
      ),
    [analyticsIntegrations, selectedId]
  );
  const options = useMemo(() => {
    if (!currentIntegration) {
      return [];
    }
    const arr = [];
    if (
      [
        'facebook',
        'instagram',
        'instagram-standalone',
        'linkedin-page',
        'pinterest',
        'youtube',
        'threads',
        'gmb',
        'x',
        'tiktok',
      ].indexOf(currentIntegration.identifier) !== -1
    ) {
      arr.push({
        key: 7,
        value: t('7_days', '7 Days'),
      });
    }
    if (
      [
        'facebook',
        'instagram',
        'instagram-standalone',
        'linkedin-page',
        'pinterest',
        'youtube',
        'threads',
        'gmb',
        'x',
        'tiktok',
      ].indexOf(currentIntegration.identifier) !== -1
    ) {
      arr.push({
        key: 30,
        value: t('30_days', '30 Days'),
      });
    }
    if (
      ['facebook', 'linkedin-page', 'pinterest', 'youtube', 'x', 'gmb'].indexOf(
        currentIntegration.identifier
      ) !== -1
    ) {
      arr.push({
        key: 90,
        value: t('90_days', '90 Days'),
      });
    }
    return arr;
  }, [currentIntegration]);
  const keys = useMemo(() => {
    if (!currentIntegration) {
      return 7;
    }
    if (options.find((p) => p.key === key)) {
      return key;
    }
    return options[0]?.key;
  }, [key, currentIntegration]);

  const handleSelect = (integration: IntegrationListItem) => {
    if (integration.refreshNeeded) {
      toaster.show(
        'Please refresh the integration from the calendar',
        'warning'
      );
      return;
    }
    setRefresh(true);
    setTimeout(() => {
      setRefresh(false);
    }, 10);
    setLastChannelId(integration.id);
    setSelectedId(integration.id);
  };

  if (isLoading) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  if (!analyticsIntegrations.length && !isLoading) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-col gap-[15px] transition-all flex-1 justify-center items-center text-center">
        <div>
          <img src="/peoplemarketplace.svg" />
        </div>
        <div className="text-[48px]">
          {t('can_t_show_analytics_yet', "Can't show analytics yet")}
          <br />
          {t(
            'you_have_to_add_social_media_channels',
            'You have to add Social Media channels'
          )}
        </div>
        <div className="text-[20px]">
          {t('supported', 'Supported:')}
          {allowedIntegrations.map((p) => capitalize(p)).join(', ')}
        </div>
        <Button onClick={() => router.push('/calendar')}>
          {t(
            'go_to_the_calendar_to_add_channels',
            'Go to the calendar to add channels'
          )}
        </Button>
      </div>
    );
  }
  return (
    <>
      <ChannelsSidebar
        integrationCount={analyticsIntegrations.length}
        showAddProvider={false}
      >
        {(collapsed) => (
          <ChannelMenu
            collapsed={collapsed}
            integrations={analyticsIntegrations}
            selectedIds={selectedId ? [selectedId] : []}
            onSelect={handleSelect}
          />
        )}
      </ChannelsSidebar>
      <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]">
        {!!options.length && (
          <div className="flex-1 flex flex-col gap-[14px]">
            <div className="max-w-[200px]">
              <Select
                label=""
                name="date"
                disableForm={true}
                hideErrors={true}
                onChange={(e) => setKey(+e.target.value)}
              >
                {options.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.value}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              {!!keys && !!currentIntegration && !refresh && (
                <RenderAnalytics integration={currentIntegration} date={keys} />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

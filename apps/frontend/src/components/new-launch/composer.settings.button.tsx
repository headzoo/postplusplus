'use client';

import { FC, useMemo } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  SettingsIcon,
  ChevronDownIcon,
} from '@gitroom/frontend/components/ui/icons';

export const ComposerSettingsButton: FC = () => {
  const t = useT();
  const { current, integrations, showSettings, setShowSettings } =
    useLaunchStore(
      useShallow((state) => ({
        current: state.current,
        integrations: state.integrations,
        showSettings: state.showSettings,
        setShowSettings: state.setShowSettings,
      }))
    );

  const label = useMemo(() => {
    if (current === 'global') {
      return (
        <div className="flex items-center gap-[8px]">
          <SettingsIcon size={15} className="text-textColor" />
          <span>{t('settings', 'Settings')}</span>
        </div>
      );
    }

    const currentIntegration = integrations.find((p) => p.id === current);

    if (!currentIntegration) {
      return (
        <div className="flex items-center gap-[8px]">
          <SettingsIcon size={15} className="text-textColor" />
          <span>{t('settings', 'Settings')}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-[8px]">
        <div className="relative">
          <img
            src={`/icons/platforms/${currentIntegration.identifier}.png`}
            className="w-[16px] h-[16px] rounded-[4px]"
            alt={currentIntegration.identifier}
          />
          <SettingsIcon
            size={12}
            className="text-textColor absolute -end-[4px] -bottom-[4px]"
          />
        </div>
        <span>
          {currentIntegration.name} {t('channel_settings', 'Settings')}
        </span>
      </div>
    );
  }, [current, integrations, t]);

  return (
    <div
      onClick={() => setShowSettings(!showSettings)}
      className={clsx(
        'select-none cursor-pointer h-[44px] rounded-[8px] flex bg-btnSimple hover:bg-boxHover dark:hover:bg-newSep transition-colors gap-[8px] justify-center items-center pl-[16px] pr-[12px] text-[13px] font-[600] mt-[12px] text-textColor whitespace-nowrap'
      )}
    >
      {label}
      <ChevronDownIcon
        rotated={showSettings}
        className="text-textColor shrink-0"
      />
    </div>
  );
};

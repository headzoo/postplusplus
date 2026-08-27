'use client';

import React, { useCallback, useEffect } from 'react';
import useCookie from 'react-use-cookie';
import { Slider } from '@gitroom/react/form/slider';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { modeEmitter } from '@gitroom/frontend/components/layout/mode.component';
import { ChangeLanguageComponent } from '@gitroom/frontend/components/layout/language.component';

const AppearanceSettingsComponent = () => {
  const t = useT();
  const [mode, setMode] = useCookie('mode', 'dark');

  useEffect(() => {
    document.body.classList.remove('dark', 'light');
    document.body.classList.add(mode);
  }, [mode]);

  const handleModeChange = useCallback(
    (value: 'on' | 'off') => {
      const newMode = value === 'on' ? 'dark' : 'light';
      modeEmitter.emit('mode', newMode);
      setMode(newMode);
    },
    [setMode]
  );

  return (
    <>
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
        <div className="mt-[4px]">{t('appearance', 'Appearance')}</div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="text-[14px]">{t('dark_mode', 'Dark Mode')}</div>
            <div className="text-[12px] text-customColor18">
              {t(
                'dark_mode_description',
                'Switch between dark and light theme'
              )}
            </div>
          </div>
          <Slider
            value={mode === 'dark' ? 'on' : 'off'}
            onChange={handleModeChange}
            fill={true}
          />
        </div>
      </div>
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
        <div className="mt-[4px]">{t('language', 'Language')}</div>
        <ChangeLanguageComponent closeOnChange={false} />
      </div>
    </>
  );
};

export default AppearanceSettingsComponent;

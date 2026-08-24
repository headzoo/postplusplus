'use client';

import { FC, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

export const ContinueTrackingAuthorization: FC<{
  searchParams: { state?: string; code?: string; error?: string };
}> = (props) => {
  const { searchParams } = props;
  const { push } = useRouter();
  const t = useT();
  const fetch = useFetch();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!searchParams.state || !searchParams.code) {
        setError(
          t(
            'tracking_authorization_denied',
            'The authorization was not completed, no permissions were granted.'
          )
        );
        return;
      }

      const response = await fetch('/integrations/tracking-authorization', {
        method: 'POST',
        body: JSON.stringify({
          state: searchParams.state,
          code: searchParams.code,
        }),
      });

      if (!response.ok) {
        setError(
          t(
            'tracking_authorization_failed',
            'Could not save the tracking authorization, please try again.'
          )
        );
        return;
      }

      push('/settings/channels');
    })();
  }, []);

  if (error) {
    return (
      <div className="flex flex-col gap-[12px] items-center justify-center py-[60px] text-[14px]">
        <div className="text-amber-300">{error}</div>
        <a href="/settings/channels" className="underline">
          {t('open_channel_settings', 'Open channel settings')}
        </a>
      </div>
    );
  }

  return (
    <div className="flex justify-center py-[60px]">
      <LoadingComponent />
    </div>
  );
};

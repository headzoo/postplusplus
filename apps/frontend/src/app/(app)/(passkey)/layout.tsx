'use client';

import React, { ReactNode, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { ContextWrapper } from '@gitroom/frontend/components/layout/user.context';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

export default function PasskeyLayout({ children }: { children: ReactNode }) {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/user/self')).json();
  }, [fetch]);
  const { data: user } = useSWR('/user/self', load, {
    revalidateOnFocus: false,
  });

  if (!user) {
    return (
      <div className="bg-newBgColorInner min-h-screen flex flex-1 items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <ContextWrapper user={user}>
      <div className="bg-newBgColorInner min-h-screen flex flex-1">
        {children}
      </div>
    </ContextWrapper>
  );
}

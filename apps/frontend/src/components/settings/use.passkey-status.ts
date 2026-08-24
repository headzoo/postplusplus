'use client';

import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export interface PasskeyStatus {
  enrolled: boolean;
  verified: boolean;
  expiresAt: string | null;
}

export const usePasskeyStatus = () => {
  const fetch = useFetch();

  return useSWR<PasskeyStatus>(
    '/user/passkey/status',
    async (path: string) => {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error('Unable to load passkey status');
      }

      return response.json();
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );
};

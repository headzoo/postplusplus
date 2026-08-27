'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { AdminPasskeyCard } from './admin-passkey-setup.component';
import { useAdminAuthStatus } from './use.admin-auth';
import {
  assertionOptionsToCredentialOptions,
  getSafeAdminReturnTo,
  serializeAssertionCredential,
} from './admin-passkey.utils';

const ceremonyError = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'Passkey verification was cancelled or timed out. Please try again.'
    : 'Unable to verify your admin passkey. Please try again.';

export const AdminPasskeyVerifyComponent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: status, error, mutate } = useAdminAuthStatus();
  const [loading, setLoading] = useState(false);
  const returnTo = useMemo(
    () => getSafeAdminReturnTo(searchParams.get('returnTo')),
    [searchParams]
  );

  useEffect(() => {
    if (user && !user.admin) {
      router.replace('/calendar');
      return;
    }
    if (status && !status.enrolled) {
      router.replace(
        `/admin/passkey/setup?returnTo=${encodeURIComponent(returnTo)}`
      );
      return;
    }
    if (status?.verified && status.fresh) {
      router.replace(returnTo);
    }
  }, [router, returnTo, status, user]);

  const verify = useCallback(async () => {
    if (!window.PublicKeyCredential || !navigator.credentials?.get) {
      toaster.show(
        'This browser does not support passkeys. Use a supported browser to continue.',
        'warning'
      );
      return;
    }

    setLoading(true);
    try {
      const challengeResponse = await fetch('/admin-auth/challenge', {
        method: 'POST',
      });
      if (!challengeResponse.ok) {
        throw new Error('Unable to create passkey challenge');
      }
      const credential = await navigator.credentials.get(
        assertionOptionsToCredentialOptions(await challengeResponse.json())
      );

      if (!credential || !(credential instanceof PublicKeyCredential)) {
        throw new Error('No passkey assertion was returned');
      }

      const verifyResponse = await fetch('/admin-auth/verify', {
        method: 'POST',
        body: JSON.stringify(serializeAssertionCredential(credential)),
      });
      if (!verifyResponse.ok) {
        throw new Error('Unable to verify passkey assertion');
      }

      await mutate();
      router.replace(returnTo);
    } catch (error) {
      toaster.show(ceremonyError(error), 'warning');
    } finally {
      setLoading(false);
    }
  }, [fetch, mutate, returnTo, router, toaster]);

  if (!user || (!status && !error)) {
    return <LoadingComponent />;
  }

  if (
    !user.admin ||
    (status && (!status.enrolled || (status.verified && status.fresh)))
  ) {
    return null;
  }

  return (
    <AdminPasskeyCard
      action="Verify passkey"
      description="Verify your account passkey before accessing the admin area."
      error={error}
      loading={loading}
      onSubmit={verify}
      title="Verify admin access"
    />
  );
};

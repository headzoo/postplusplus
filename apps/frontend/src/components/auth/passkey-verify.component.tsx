'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { AdminPasskeyCard } from '@gitroom/frontend/components/admin/admin-passkey-setup.component';
import { usePasskeyStatus } from '@gitroom/frontend/components/settings/use.passkey-status';
import {
  assertionOptionsToCredentialOptions,
  serializeAssertionCredential,
} from '@gitroom/frontend/components/admin/admin-passkey.utils';

const ceremonyError = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'Passkey verification was cancelled or timed out. Please try again.'
    : 'Unable to verify your passkey. Please try again.';

const getSafeReturnTo = (returnTo?: string | null) => {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return '/';
  }
  if (returnTo.startsWith('/passkey')) {
    return '/';
  }
  return returnTo;
};

export const PasskeyVerifyComponent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: status, error, mutate } = usePasskeyStatus();
  const [loading, setLoading] = useState(false);
  const returnTo = useMemo(
    () => getSafeReturnTo(searchParams.get('returnTo')),
    [searchParams]
  );

  useEffect(() => {
    if (!user) {
      return;
    }
    if (status && !status.enrolled) {
      router.replace(returnTo);
      return;
    }
    if (status?.verified) {
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
      const challengeResponse = await fetch('/user/passkey/challenge', {
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

      const verifyResponse = await fetch('/user/passkey/verify', {
        method: 'POST',
        body: JSON.stringify(serializeAssertionCredential(credential)),
      });
      if (!verifyResponse.ok) {
        throw new Error('Unable to verify passkey assertion');
      }

      await mutate();
      router.replace(returnTo);
    } catch (err) {
      toaster.show(ceremonyError(err), 'warning');
    } finally {
      setLoading(false);
    }
  }, [fetch, mutate, returnTo, router, toaster]);

  if (!user || (!status && !error)) {
    return <LoadingComponent />;
  }

  if (status && (!status.enrolled || status.verified)) {
    return null;
  }

  return (
    <AdminPasskeyCard
      action="Verify passkey"
      description="Verify your passkey to finish signing in."
      error={error}
      loading={loading}
      onSubmit={verify}
      title="Verify your passkey"
    />
  );
};

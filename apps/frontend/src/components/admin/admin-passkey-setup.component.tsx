'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useAdminAuthStatus } from './use.admin-auth';
import {
  getSafeAdminReturnTo,
  registrationOptionsToCredentialOptions,
  serializeRegistrationCredential,
} from './admin-passkey.utils';

const ceremonyError = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'Passkey enrollment was cancelled or timed out. Please try again.'
    : 'Unable to enroll your admin passkey. Please try again.';

export const AdminPasskeySetupComponent = () => {
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
    if (status?.enrolled) {
      router.replace(
        status.verified
          ? returnTo
          : `/admin/passkey/verify?returnTo=${encodeURIComponent(returnTo)}`
      );
    }
  }, [router, returnTo, status, user]);

  const enroll = useCallback(async () => {
    if (!window.PublicKeyCredential || !navigator.credentials?.create) {
      toaster.show(
        'This browser does not support passkeys. Use a supported browser to continue.',
        'warning'
      );
      return;
    }

    setLoading(true);
    try {
      const optionsResponse = await fetch('/admin-auth/register-options', {
        method: 'POST',
      });
      if (!optionsResponse.ok) {
        throw new Error('Unable to create passkey enrollment options');
      }
      const credential = await navigator.credentials.create(
        registrationOptionsToCredentialOptions(await optionsResponse.json())
      );

      if (!credential || !(credential instanceof PublicKeyCredential)) {
        throw new Error('No passkey was created');
      }

      const verifyResponse = await fetch('/admin-auth/register-verify', {
        method: 'POST',
        body: JSON.stringify(serializeRegistrationCredential(credential)),
      });
      if (!verifyResponse.ok) {
        throw new Error('Unable to verify passkey enrollment');
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

  if (!user.admin || status?.enrolled) {
    return null;
  }

  return (
    <AdminPasskeyCard
      action="Set up passkey"
      description="Admin access uses your account passkey. Create one to continue."
      error={error}
      loading={loading}
      onSubmit={enroll}
      title="Set up account passkey"
    />
  );
};

export const AdminPasskeyCard = ({
  action,
  description,
  error,
  loading,
  onSubmit,
  title,
}: {
  action: string;
  description: string;
  error?: unknown;
  loading: boolean;
  onSubmit: () => void;
  title: string;
}) => (
  <div className="flex flex-1 items-center justify-center bg-newBgColorInner p-[20px]">
    <div className="w-full max-w-[440px] rounded-[12px] border border-newTextColor/10 bg-newBgColorInner p-[32px] text-newTextColor shadow-sm">
      <h1 className="text-[24px] font-[600]">{title}</h1>
      <p className="mt-[12px] text-textItemBlur">{description}</p>
      {error && (
        <p className="mt-[16px] text-[14px] text-red-500">
          We could not load your passkey status. Refresh and try again.
        </p>
      )}
      <Button
        className="mt-[24px] w-full"
        disabled={!!error || loading}
        loading={loading}
        onClick={onSubmit}
      >
        {action}
      </Button>
    </div>
  </div>
);

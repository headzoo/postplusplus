'use client';

import React, { useCallback, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  assertionOptionsToCredentialOptions,
  registrationOptionsToCredentialOptions,
  serializeAssertionCredential,
  serializeRegistrationCredential,
} from '@gitroom/frontend/components/admin/admin-passkey.utils';
import { usePasskeyStatus } from './use.passkey-status';

const ceremonyError = (error: unknown, fallback: string) =>
  error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'Passkey ceremony was cancelled or timed out. Please try again.'
    : fallback;

const PasskeySettingsComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: status, error, mutate, isLoading } = usePasskeyStatus();
  const [loading, setLoading] = useState(false);

  const enablePasskey = useCallback(async () => {
    if (!window.PublicKeyCredential || !navigator.credentials?.create) {
      toaster.show(
        'This browser does not support passkeys. Use a supported browser to continue.',
        'warning'
      );
      return;
    }

    setLoading(true);
    try {
      const optionsResponse = await fetch('/user/passkey/register-options', {
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

      const verifyResponse = await fetch('/user/passkey/register-verify', {
        method: 'POST',
        body: JSON.stringify(serializeRegistrationCredential(credential)),
      });
      if (!verifyResponse.ok) {
        throw new Error('Unable to verify passkey enrollment');
      }

      await mutate();
      toaster.show(
        t('passkey_enabled', 'Passkey enabled for your account'),
        'success'
      );
    } catch (err) {
      toaster.show(
        ceremonyError(
          err,
          'Unable to enable a passkey on your account. Please try again.'
        ),
        'warning'
      );
    } finally {
      setLoading(false);
    }
  }, [fetch, mutate, t, toaster]);

  const disablePasskey = useCallback(async () => {
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

      const disableResponse = await fetch('/user/passkey/disable', {
        method: 'POST',
        body: JSON.stringify(serializeAssertionCredential(credential)),
      });
      if (!disableResponse.ok) {
        throw new Error('Unable to disable passkey');
      }

      await mutate();
      toaster.show(
        t('passkey_disabled', 'Passkey disabled for your account'),
        'success'
      );
    } catch (err) {
      toaster.show(
        ceremonyError(err, 'Unable to disable your passkey. Please try again.'),
        'warning'
      );
    } finally {
      setLoading(false);
    }
  }, [fetch, mutate, t, toaster]);

  const enrolled = !!status?.enrolled;

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div className="mt-[4px]">{t('passkey', 'Passkey')}</div>
      <div className="flex items-start justify-between gap-[16px]">
        <div className="flex flex-col">
          <div className="text-[14px]">
            {enrolled
              ? t('passkey_enabled_title', 'Passkey enabled')
              : t('passkey_disabled_title', 'Passkey disabled')}
          </div>
          <div className="text-[12px] text-customColor18">
            {t(
              'passkey_description',
              'Add a passkey to require verification after every sign-in. Super admins use this same passkey for /admin access.'
            )}
          </div>
          {error && (
            <div className="text-[12px] text-red-500 mt-[8px]">
              {t(
                'passkey_status_error',
                'We could not load your passkey status. Refresh and try again.'
              )}
            </div>
          )}
        </div>
        <Button
          disabled={!!error || isLoading || loading}
          loading={loading}
          onClick={enrolled ? disablePasskey : enablePasskey}
        >
          {enrolled
            ? t('disable_passkey', 'Disable passkey')
            : t('enable_passkey', 'Enable passkey')}
        </Button>
      </div>
    </div>
  );
};

export default PasskeySettingsComponent;

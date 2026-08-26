'use client';

import React, { FC, useCallback, useEffect, useState } from 'react';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Integration } from '@prisma/client';
import { Autocomplete } from '@mantine/core';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export const CustomerModal: FC<{
  integration: Integration & {
    customer?: {
      id: string;
      name: string;
    };
  };
  onClose: () => void;
}> = (props) => {
  const t = useT();

  const fetch = useFetch();
  const { onClose, integration } = props;
  const [customer, setCustomer] = useState(
    integration.customer?.name || undefined
  );
  const modal = useModals();
  const loadCustomers = useCallback(async () => {
    return (await fetch('/integrations/customers')).json();
  }, []);
  const removeFromCustomer = useCallback(async () => {
    saveCustomer(true);
  }, []);
  const saveCustomer = useCallback(
    async (removeCustomer?: boolean) => {
      if (!customer) {
        return;
      }
      await fetch(`/integrations/${integration.id}/customer-name`, {
        method: 'PUT',
        body: JSON.stringify({
          name: removeCustomer ? '' : customer,
        }),
      });
      modal.closeAll();
      onClose();
    },
    [customer]
  );
  const { data } = useSWR('/customers', loadCustomers);
  return (
    <div className="relative w-full">
      <div className="mb-[80px]">
        <Autocomplete
          value={customer}
          onChange={setCustomer}
          classNames={{
            label: 'text-white',
          }}
          label={t('select_customer_label', 'Select Channel Group')}
          placeholder={t('start_typing', 'Start typing...')}
          data={data?.map((p: any) => p.name) || []}
        />
      </div>

      <div className="my-[16px] flex gap-[10px]">
        <Button onClick={() => saveCustomer()}>{t('save', 'Save')}</Button>
        {!!integration?.customer?.name && (
          <Button className="bg-red-700" onClick={removeFromCustomer}>
            {t('remove_from_customer', 'Remove from channel group')}
          </Button>
        )}
      </div>
    </div>
  );
};

export const CustomerRenameModal: FC<{
  name: string;
  onSave: (name: string) => Promise<void>;
}> = ({ name, onSave }) => {
  const t = useT();
  const modal = useModals();
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const save = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(t('customer_group_name_required', 'Enter a group name'));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSave(trimmed);
      modal.closeAll();
    } catch {
      setError(
        t('customer_group_rename_error', 'We could not rename this group.')
      );
    } finally {
      setSaving(false);
    }
  }, [modal, onSave, t, value]);

  return (
    <div>
      <Input
        name="customer-group-name"
        disableForm={true}
        removeError={true}
        label={t('customer_group_name', 'Group name')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {error && (
        <p className="mt-[8px] text-[13px] text-red-400">{error}</p>
      )}
      <div className="mt-[16px] flex justify-end gap-[8px]">
        <Button onClick={() => modal.closeAll()} disabled={saving}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button onClick={save} disabled={saving || !value.trim()}>
          {t('save', 'Save')}
        </Button>
      </div>
    </div>
  );
};

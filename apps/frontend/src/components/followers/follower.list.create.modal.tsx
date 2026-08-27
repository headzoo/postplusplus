'use client';

import { FC, useCallback, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const FollowerListCreateModal: FC<{
  close: () => void;
  onCreate: (name: string) => Promise<void>;
}> = ({ close, onCreate }) => {
  const t = useT();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const save = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('followers_list_name_required', 'Enter a list name'));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onCreate(trimmed);
      close();
    } catch {
      setError(
        t('followers_list_create_error', 'We could not create this list.')
      );
    } finally {
      setSaving(false);
    }
  }, [close, name, onCreate, t]);

  return (
    <div>
      <Input
        name="follower-list-name"
        disableForm={true}
        removeError={true}
        label={t('followers_list_name', 'List name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {error && <p className="mt-[8px] text-[13px] text-red-400">{error}</p>}
      <div className="mt-[16px] flex justify-end gap-[8px]">
        <Button onClick={close} disabled={saving}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button onClick={save} disabled={saving || !name.trim()}>
          {t('ok', 'Okay')}
        </Button>
      </div>
    </div>
  );
};

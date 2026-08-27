'use client';

import { FC, useCallback, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const FollowerListAddModal: FC<{
  close: () => void;
  listName?: string;
  onImport: (url: string) => Promise<void>;
}> = ({ close, listName, onImport }) => {
  const t = useT();
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const save = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError(t('followers_list_add_url_required', 'Paste a profile URL'));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onImport(trimmed);
      close();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t(
              'followers_list_add_error',
              'We could not add this profile to the list.'
            )
      );
    } finally {
      setSaving(false);
    }
  }, [close, onImport, t, url]);

  return (
    <div>
      <p className="mb-[12px] text-[13px] text-textItemBlur">
        {listName
          ? t(
              'followers_list_add_description_named',
              'Paste a profile URL to add someone to {{list}}.',
              { list: listName }
            )
          : t(
              'followers_list_add_description',
              'Paste a profile URL to add someone to this list.'
            )}
      </p>
      <Input
        name="follower-list-add-url"
        disableForm={true}
        removeError={true}
        label={t('followers_list_add_url', 'Profile URL')}
        placeholder="https://x.com/HarborClient"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      {error && <p className="mt-[8px] text-[13px] text-red-400">{error}</p>}
      <div className="mt-[16px] flex justify-end gap-[8px]">
        <Button onClick={close} disabled={saving}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button onClick={save} disabled={saving || !url.trim()}>
          {t('followers_list_add_submit', 'Add')}
        </Button>
      </div>
    </div>
  );
};

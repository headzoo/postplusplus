import { Input } from '@gitroom/react/form/input';
import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';

export const SwitchUser = () => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();
  const currentUser = useUser();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    if (!name) {
      return [];
    }
    return await (await fetch(`/user/impersonate?name=${name}`)).json();
  }, [name]);

  const { data } = useSWR(`/switch-search-${name}`, load, {
    refreshWhenHidden: false,
    revalidateOnMount: true,
    revalidateOnReconnect: false,
    revalidateOnFocus: false,
    refreshWhenOffline: false,
    revalidateIfStale: false,
    refreshInterval: 0,
  });

  const mapData = useMemo(() => {
    const seen = new Set<string>();
    return (data || [])
      .filter((curr: any) => curr?.user?.id !== currentUser?.id)
      .filter((curr: any) => {
        if (seen.has(curr?.user?.id)) {
          return false;
        }
        seen.add(curr?.user?.id);
        return true;
      })
      .map((curr: any) => ({
        id: curr?.user?.id,
        name: curr?.user?.name,
        email: curr?.user?.email,
        orgs: (data || [])
          .filter((org: any) => org?.user?.id === curr?.user?.id)
          .map(
            (org: any) =>
              `${org?.organization?.name} (${org?.role} / ${
                org?.organization?.subscription?.subscriptionTier || 'FREE'
              })`
          )
          .join(', '),
      }));
  }, [data, currentUser?.id]);

  const pick = useCallback(
    (item: { id: string; name: string; email: string }) => () => {
      setSelected(item);
      setName('');
    },
    []
  );

  const doSwitch = useCallback(async () => {
    if (!selected) {
      return;
    }
    if (
      !(await deleteDialog(
        t(
          'switch_user_confirm',
          `This will replace the current account's login with ${selected.email}. All data and the subscription stay with the account — only the login changes, and the new login gains its full access. Switch back to revert.`
        ),
        t('yes_switch', 'Yes, switch'),
        t('switch_user_title', 'Switch User?'),
        t('no_cancel', 'No, cancel')
      ))
    ) {
      return;
    }
    setSwitching(true);
    try {
      const res = await fetch('/user/switch', {
        method: 'POST',
        body: JSON.stringify({ id: selected.id }),
      });
      if (!res.ok) {
        throw new Error(await res.text().catch(() => ''));
      }
      window.location.reload();
    } catch {
      setSwitching(false);
      toaster.show(
        t(
          'switch_user_failed',
          'The user switch failed and nothing was changed'
        ),
        'warning'
      );
    }
  }, [selected]);

  return (
    <div className="relative flex items-center gap-[10px] flex-1 min-w-[280px]">
      <div className="flex-1 min-w-[220px]">
        <Input
          autoComplete="off"
          placeholder={t(
            'select_user_to_switch_to',
            'Select user to switch to'
          )}
          name="switchUser"
          disableForm={true}
          label=""
          removeError={true}
          value={
            selected
              ? `${selected.name ? `${selected.name} - ` : ''}${selected.email}`
              : name
          }
          onChange={(e) => {
            setSelected(null);
            setName(e.target.value);
          }}
        />
      </div>
      <Button
        onClick={doSwitch}
        loading={switching}
        disabled={!selected}
        className="rounded-[4px] whitespace-nowrap"
      >
        {t('switch_user', 'Switch User')}
      </Button>
      {!!mapData?.length && !selected && (
        <>
          <div
            className="bg-primary/80 fixed start-0 top-0 w-full h-full z-[998]"
            onClick={() => setName('')}
          />
          <div className="absolute top-[100%] start-0 w-max min-w-full max-w-[90vw] bg-sixth border border-customColor6 text-textColor z-[999]">
            {mapData.map((item: any) => (
              <div
                onClick={pick(item)}
                key={item?.id}
                className="p-[10px] border-b border-customColor6 hover:bg-tableBorder cursor-pointer whitespace-nowrap truncate"
              >
                {t('user_1', 'user:')}
                {item?.id?.split('-')?.at(-1)} -{' '}
                {item?.name ? `${item?.name} - ` : ''}
                {item?.email}
                {item?.orgs ? ` - ${item?.orgs}` : ''}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

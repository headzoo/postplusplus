'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Button } from '@gitroom/react/form/button';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';

interface AdminUserRow {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    activated: boolean;
    isSuperAdmin: boolean;
    createdAt: string;
  };
  organization: {
    id: string;
    name: string;
    subscription: { subscriptionTier: string } | null;
  };
}

interface AdminUsersResponse {
  items: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

const useAdminUsersList = (params: {
  page: number;
  limit: number;
  search: string;
}) => {
  const fetch = useFetch();
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    ...(params.search ? { search: params.search } : {}),
  });
  const key = `/admin/users?${query.toString()}`;
  return useSWR<AdminUsersResponse>(key, async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Failed to load users');
    }
    return res.json();
  });
};

export const AdminUsersComponent: FC = () => {
  const user = useUser();
  const t = useT();
  const fetch = useFetch();
  const [page, setPage] = useState(0);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const { data, isLoading, error } = useAdminUsersList({
    page,
    limit,
    search,
  });

  const onApplySearch = useCallback(() => {
    setPage(0);
    setSearch(searchInput.trim());
  }, [searchInput]);

  const onClear = useCallback(() => {
    setPage(0);
    setSearch('');
    setSearchInput('');
  }, []);

  const impersonate = useCallback(
    async (row: AdminUserRow) => {
      if (
        !(await deleteDialog(
          t(
            'impersonate_confirm',
            `Impersonate ${row.user.email} in ${row.organization.name}?`
          ),
          t('yes_impersonate', 'Yes, impersonate'),
          t('impersonate_title', 'Impersonate user?'),
          t('no_cancel', 'No, cancel')
        ))
      ) {
        return;
      }
      setImpersonatingId(row.id);
      try {
        await fetch('/user/impersonate', {
          method: 'POST',
          body: JSON.stringify({ id: row.id }),
        });
        window.location.reload();
      } finally {
        setImpersonatingId(null);
      }
    },
    [fetch, t]
  );

  if (!user?.admin) {
    return (
      <div className="text-textColor p-[20px]">
        {t('no_access', 'You do not have access to this page.')}
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="flex flex-col gap-[16px] text-textColor">
      <div className="flex items-center justify-between">
        <div className="text-[20px] font-[600]">{t('users', 'Users')}</div>
        <div className="text-[13px] opacity-70">
          {data ? `${data.total} total` : ''}
        </div>
      </div>

      <div className="flex flex-wrap gap-[12px] items-end bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[12px]">
        <div className="flex flex-col gap-[6px] flex-1 min-w-[240px]">
          <div className="text-[12px] opacity-70">{t('search', 'Search')}</div>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onApplySearch();
              }
            }}
            placeholder={t(
              'search_users_placeholder',
              'Email, name, user id, or organization'
            )}
            className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
          />
        </div>
        <Button onClick={onApplySearch}>{t('search', 'Search')}</Button>
        <Button secondary onClick={onClear}>
          {t('clear', 'Clear')}
        </Button>
      </div>

      {isLoading ? (
        <LoadingComponent />
      ) : error ? (
        <div className="text-red-400">
          {t('failed_to_load_users', 'Failed to load users.')}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="opacity-70">
          {t('no_users_found', 'No users found.')}
        </div>
      ) : (
        <div className="border border-newTableBorder rounded-[8px] overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[1.4fr_1fr_1.2fr_100px_90px_160px_140px] gap-[12px] px-[12px] py-[10px] bg-newBgColorInner text-[12px] uppercase opacity-70 border-b border-newTableBorder">
              <div>{t('email', 'Email')}</div>
              <div>{t('name', 'Name')}</div>
              <div>{t('organization', 'Organization')}</div>
              <div>{t('role', 'Role')}</div>
              <div>{t('tier', 'Tier')}</div>
              <div>{t('created', 'Created')}</div>
              <div className="text-right">{t('actions', 'Actions')}</div>
            </div>
            {data.items.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[1.4fr_1fr_1.2fr_100px_90px_160px_140px] gap-[12px] px-[12px] py-[10px] text-[13px] border-b border-newTableBorder last:border-b-0 items-center"
              >
                <div className="break-all">{row.user.email}</div>
                <div>{row.user.name || '—'}</div>
                <div className="break-all">{row.organization.name}</div>
                <div>{row.role}</div>
                <div>
                  {row.organization.subscription?.subscriptionTier || 'FREE'}
                </div>
                <div className="opacity-90">
                  {new Date(row.user.createdAt).toLocaleString()}
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => impersonate(row)}
                    loading={impersonatingId === row.id}
                    disabled={
                      user.impersonate &&
                      user.orgId === row.organization.id &&
                      user.id === row.user.id
                    }
                    className="rounded-[4px]"
                  >
                    {t('impersonate', 'Impersonate')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-[13px] opacity-70">
          {t('page', 'Page')} {page + 1} {t('of', 'of')} {totalPages}
        </div>
        <div className="flex gap-[8px]">
          <Button
            secondary
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            {t('previous', 'Previous')}
          </Button>
          <Button
            disabled={!data?.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('next', 'Next')}
          </Button>
        </div>
      </div>
    </div>
  );
};

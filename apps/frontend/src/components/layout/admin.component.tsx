'use client';

import { FC, ReactNode, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AdminGeneralComponent } from '@gitroom/frontend/components/admin/admin-general.component';
import { AdminUsersComponent } from '@gitroom/frontend/components/admin/admin-users.component';
import { AdminErrorsComponent } from '@gitroom/frontend/components/admin/admin-errors.component';
import { AdminStatsComponent } from '@gitroom/frontend/components/admin/admin-stats.component';
import { AdminScheduleComponent } from '@gitroom/frontend/components/admin/admin-schedule.component';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useAdminAuthStatus } from '@gitroom/frontend/components/admin/use.admin-auth';
import { getSafeAdminReturnTo } from '@gitroom/frontend/components/admin/admin-passkey.utils';

export const AdminGuard: FC<{ children: ReactNode }> = ({ children }) => {
  const user = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: status, error } = useAdminAuthStatus();
  const returnTo = useMemo(() => {
    const query = searchParams.toString();
    return getSafeAdminReturnTo(`${pathname}${query ? `?${query}` : ''}`);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (user && !user.admin) {
      router.replace('/calendar');
      return;
    }
    if (!user?.admin || !status) {
      return;
    }
    if (!status.enrolled) {
      router.replace(
        `/admin/passkey/setup?returnTo=${encodeURIComponent(returnTo)}`
      );
      return;
    }
    if (!status.verified) {
      router.replace(
        `/admin/passkey/verify?returnTo=${encodeURIComponent(returnTo)}`
      );
    }
  }, [returnTo, router, status, user]);

  if (!user?.admin) {
    return (
      <div className="bg-newBgColorInner flex-1 flex items-center justify-center p-[20px] text-textColor">
        You do not have access to this page.
      </div>
    );
  }

  if (!status && !error) {
    return <LoadingComponent />;
  }

  if (error || !status?.verified) {
    return (
      <div className="bg-newBgColorInner flex flex-1 items-center justify-center p-[20px] text-newTextColor">
        {error
          ? 'Unable to verify admin passkey status. Refresh and try again.'
          : 'Verifying admin access...'}
      </div>
    );
  }

  return <>{children}</>;
};

export const AdminLayout: FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();

  const list = useMemo(
    () => [
      { tab: 'general', label: t('general', 'General'), path: '/admin' },
      { tab: 'users', label: t('users', 'Users'), path: '/admin/users' },
      { tab: 'errors', label: t('errors', 'Errors'), path: '/admin/errors' },
      { tab: 'stats', label: t('stats', 'Stats'), path: '/admin/stats' },
      {
        tab: 'schedule',
        label: t('schedule', 'Schedule'),
        path: '/admin/schedule',
      },
    ],
    [t]
  );

  const tab = useMemo(() => {
    if (pathname === '/admin/users') {
      return 'users';
    }
    if (pathname === '/admin/errors') {
      return 'errors';
    }
    if (pathname === '/admin/stats') {
      return 'stats';
    }
    if (pathname === '/admin/schedule') {
      return 'schedule';
    }
    return 'general';
  }, [pathname]);

  return (
    <AdminGuard>
      <div className="bg-newBgColorInner p-[20px] flex flex-col transition-all w-[260px]">
        <div className="flex flex-1 flex-col gap-[15px]">
          {list.map(({ tab: tabKey, label, path }) => (
            <div
              key={tabKey}
              className={clsx(
                'cursor-pointer px-[12px] py-[8px] hover:bg-boxHover rounded-[8px]',
                tabKey === tab && 'bg-boxHover'
              )}
              onClick={() => router.push(path)}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px] overflow-y-auto min-h-0">
        {tab === 'general' && <AdminGeneralComponent />}
        {tab === 'users' && <AdminUsersComponent />}
        {tab === 'errors' && <AdminErrorsComponent />}
        {tab === 'stats' && <AdminStatsComponent />}
        {tab === 'schedule' && <AdminScheduleComponent />}
      </div>
    </AdminGuard>
  );
};

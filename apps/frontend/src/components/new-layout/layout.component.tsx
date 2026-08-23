'use client';

import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { jakartaSans } from '@gitroom/frontend/app/fonts';

import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { usePathname, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { ShowMediaBoxModal } from '@gitroom/frontend/components/media/media.component';
import { ShowLinkedinCompany } from '@gitroom/frontend/components/launches/helpers/linkedin.component';
import { MediaSettingsLayout } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { ShowPostSelector } from '@gitroom/frontend/components/post-url-selector/post.url.selector';
import { NewSubscription } from '@gitroom/frontend/components/layout/new.subscription';
import { Support } from '@gitroom/frontend/components/layout/support';
import { ContinueProvider } from '@gitroom/frontend/components/layout/continue.provider';
import { ContextWrapper } from '@gitroom/frontend/components/layout/user.context';
import { CopilotKit } from '@copilotkit/react-core';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { ImpersonationBanner } from '@gitroom/frontend/components/layout/impersonation-banner.component';
import { AnnouncementBanner } from '@gitroom/frontend/components/layout/announcement.banner';
import { PreConditionComponent } from '@gitroom/frontend/components/layout/pre-condition.component';
import { FirstBillingComponent } from '@gitroom/frontend/components/billing/first.billing.component';
import { TrialTracker } from '@gitroom/frontend/components/layout/gtm.component';
import { setSentryUser } from '@gitroom/react/sentry/initialize.sentry.client';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { SidebarNav } from '@gitroom/frontend/components/new-layout/sidebar-nav';
import { MobileSidebarDrawer } from '@gitroom/frontend/components/new-layout/mobile-sidebar.drawer';
import { SiteHeader } from '@gitroom/frontend/components/new-layout/site-header';
import { HelpDrawer } from '@gitroom/frontend/components/help/help.drawer';

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const desktopHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const activeHelpTriggerRef = useRef<HTMLButtonElement>(null);

  const { backendUrl, billingEnabled, isGeneral } = useVariables();

  const searchParams = useSearchParams();
  const helpParam = searchParams.get('help');
  const helpLocationKey = `${pathname}?${searchParams.toString()}`;
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: integrations = [] } = useIntegrationList();
  const { data: user, mutate } = useSWR('/user/self', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });

  useEffect(() => {
    setSentryUser(
      user ? { id: user.id, email: user.email, orgId: user.orgId } : null
    );
  }, [user]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (helpParam) {
      setHelpOpen(true);
    }
  }, [helpParam]);

  if (!user) return null;

  return (
    <ContextWrapper user={user}>
      <CopilotKit
        credentials="include"
        runtimeUrl={backendUrl + '/copilot/chat'}
        showDevConsole={false}
        agent="postiz"
      >
        <MantineWrapper>
          <ToolTip />
          <Toaster />
          <TrialTracker />
          <CheckPayment check={searchParams.get('check') || ''} mutate={mutate}>
            <ShowMediaBoxModal />
            <ShowLinkedinCompany />
            <MediaSettingsLayout />
            <ShowPostSelector />
            <PreConditionComponent />
            <NewSubscription />
            <ContinueProvider />
            <div
              className={clsx(
                'flex flex-col min-h-screen min-w-screen text-newTextColor p-[12px] mobile:p-[8px]',
                jakartaSans.className
              )}
            >
              <div>{user?.impersonate ? <ImpersonationBanner /> : <div />}</div>
              {user.tier === 'FREE' && isGeneral && billingEnabled && !user?.impersonate ? (
                <FirstBillingComponent />
              ) : (
                <>
                  <AnnouncementBanner />
                  <MobileSidebarDrawer
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                  />
                  <HelpDrawer
                    open={helpOpen}
                    onClose={() => setHelpOpen(false)}
                    triggerRef={activeHelpTriggerRef}
                    locationKey={helpLocationKey}
                  />
                  <div className="flex-1 flex gap-[8px]">
                    <Support />
                    <div className="flex flex-col bg-newBgColorInner w-[80px] rounded-[12px] mobile:hidden">
                      <div
                        id="left-menu"
                        className={clsx(
                          'fixed h-full w-[80px] start-[12px] flex flex-1 top-0',
                          user?.impersonate && 'pt-[60px]'
                        )}
                      >
                        <SidebarNav />
                      </div>
                    </div>
                    <div className="flex-1 bg-newBgLineColor rounded-[12px] overflow-hidden flex flex-col gap-[1px] blurMe">
                      <SiteHeader
                        showNewPost={integrations.length > 0}
                        onOpenSidebar={() => setSidebarOpen(true)}
                        onOpenHelp={(trigger) => {
                          activeHelpTriggerRef.current = trigger;
                          setHelpOpen(true);
                        }}
                        desktopHelpTriggerRef={desktopHelpTriggerRef}
                        mobileHelpTriggerRef={mobileHelpTriggerRef}
                      />
                      <div className="flex flex-1 gap-[1px] min-w-0 overflow-hidden">
                        {children}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CheckPayment>
        </MantineWrapper>
      </CopilotKit>
    </ContextWrapper>
  );
};

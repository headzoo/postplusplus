'use client';

import { FC, RefObject } from 'react';
import { Title } from '@gitroom/frontend/components/layout/title';
import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { ChromeExtensionComponent } from '@gitroom/frontend/components/layout/chrome.extension.component';
import { AttachToFeedbackIcon } from '@gitroom/frontend/components/new-layout/sentry.feedback.component';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import { NewPost } from '@gitroom/frontend/components/launches/new.post';
import { HelpIcon, MenuIcon } from '@gitroom/frontend/components/ui/icons';
import { HeaderMoreMenu } from '@gitroom/frontend/components/new-layout/header-more-menu';

export const SiteHeader: FC<{
  showNewPost: boolean;
  onOpenSidebar: () => void;
  onOpenHelp: (trigger: HTMLButtonElement) => void;
  desktopHelpTriggerRef?: RefObject<HTMLButtonElement | null>;
  mobileHelpTriggerRef?: RefObject<HTMLButtonElement | null>;
}> = ({
  showNewPost,
  onOpenSidebar,
  onOpenHelp,
  desktopHelpTriggerRef,
  mobileHelpTriggerRef,
}) => {
  const helpButton = (triggerRef?: RefObject<HTMLButtonElement | null>) => (
    <button
      ref={triggerRef}
      type="button"
      aria-label="Help"
      data-tooltip-id="tooltip"
      data-tooltip-content="Help"
      onClick={(event) => onOpenHelp(event.currentTarget)}
      className="hover:text-newTextColor"
    >
      <HelpIcon size={24} />
    </button>
  );

  return (
    <div className="flex bg-newBgColorInner h-[80px] px-[20px] items-center mobile:h-auto mobile:py-[12px] mobile:px-[12px] mobile:flex-col mobile:items-stretch mobile:gap-[8px]">
      <div className="flex flex-1 items-center gap-[12px] min-w-0">
        <button
          type="button"
          aria-label="Open menu"
          onClick={onOpenSidebar}
          className="hidden mobile:flex text-textItemBlur hover:text-newTextColor p-[4px] shrink-0"
        >
          <MenuIcon size={24} />
        </button>
        <div className="text-[24px] font-[600] flex flex-1 items-center gap-[12px] min-w-0 mobile:text-[20px] mobile:items-start">
          <Title />
        </div>
        <div className="flex items-center gap-[20px] text-textItemBlur mobile:hidden">
          <StreakComponent />
          {helpButton(desktopHelpTriggerRef)}
          <OrganizationSelector />
          <ChromeExtensionComponent />
          <AttachToFeedbackIcon />
          <NotificationComponent />
          {showNewPost && <NewPost variant="header" />}
        </div>
      </div>
      <div className="hidden mobile:flex items-center justify-start gap-[16px] text-textItemBlur">
        {showNewPost && <NewPost variant="header" />}
        <StreakComponent />
        {helpButton(mobileHelpTriggerRef)}
        <NotificationComponent />
        <HeaderMoreMenu />
      </div>
    </div>
  );
};

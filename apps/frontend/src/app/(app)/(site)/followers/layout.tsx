import { ReactNode } from 'react';
import { FollowersAssistant } from '@gitroom/frontend/components/followers/followers.assistant';
import { FollowersCopilotActions } from '@gitroom/frontend/components/followers/use.copilot.follower.refresh';

export default function FollowersLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <FollowersCopilotActions />
      <FollowersAssistant />
    </>
  );
}

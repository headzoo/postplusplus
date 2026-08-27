export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { FollowerTimelineComponent } from '@gitroom/frontend/components/followers/follower.timeline.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${
    isGeneralServerSide()
      ? 'Follower Timeline : Post++'
      : 'Gitroom Follower Timeline'
  }`,
  description: '',
};

export default async function Index() {
  return <FollowerTimelineComponent />;
}

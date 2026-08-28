export const dynamic = 'force-dynamic';

import { Metadata } from 'next';
import { ConversationsComponent } from '@gitroom/frontend/components/conversations/conversations.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${
    isGeneralServerSide() ? 'Conversations : Post++' : 'Gitroom Conversations'
  }`,
  description: '',
};

export default async function ConversationPage() {
  return <ConversationsComponent />;
}

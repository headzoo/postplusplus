import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${
    isGeneralServerSide() ? 'Integrations : Post++' : 'Gitroom Integrations'
  }`,
  description: '',
};

export default async function Index() {
  redirect('/settings?tab=integrations');
}

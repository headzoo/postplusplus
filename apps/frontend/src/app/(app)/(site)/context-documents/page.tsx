import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${
    isGeneralServerSide()
      ? 'Context documents : Post++'
      : 'Gitroom Context documents'
  }`,
  description: '',
};

export default async function Page() {
  redirect('/context');
}

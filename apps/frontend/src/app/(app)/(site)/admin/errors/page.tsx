export const dynamic = 'force-dynamic';
import { AdminLayout } from '@gitroom/frontend/components/layout/admin.component';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${
    isGeneralServerSide() ? 'Admin Errors : Post++' : 'Gitroom Admin Errors'
  }`,
  description: '',
};

export default async function Page() {
  return <AdminLayout />;
}

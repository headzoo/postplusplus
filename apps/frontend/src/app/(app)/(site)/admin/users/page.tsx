export const dynamic = 'force-dynamic';
import { AdminLayout } from '@gitroom/frontend/components/layout/admin.component';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${
    isGeneralServerSide() ? 'Admin Users : Post++' : 'Gitroom Admin Users'
  }`,
  description: '',
};

export default async function Page() {
  return <AdminLayout />;
}

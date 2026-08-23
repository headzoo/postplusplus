import { Metadata } from 'next';
import { HelpCenterPage } from '@gitroom/frontend/components/help/help.center.page';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Help : Post++' : 'Gitroom Help'}`,
  description: '',
};

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <HelpCenterPage slug={slug} />;
}

import { Pipelines } from '@gitroom/frontend/components/pipelines/pipelines';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${
    isGeneralServerSide() ? 'Pipelines : Post++' : 'Gitroom Pipelines'
  }`,
  description: '',
};

export default async function Page() {
  return <Pipelines />;
}

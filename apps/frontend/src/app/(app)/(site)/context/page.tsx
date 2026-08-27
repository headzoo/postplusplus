import { ContextDocumentLibrary } from '@gitroom/frontend/components/context-documents/context-document.library';
import { Metadata } from 'next';
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
  return <ContextDocumentLibrary />;
}

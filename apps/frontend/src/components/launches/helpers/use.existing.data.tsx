import { createContext, FC, ReactNode, useContext } from 'react';
import { Post } from '@prisma/client';

interface ExistingDataChannel {
  integration: string;
  posts: Array<Post & { canEdit?: boolean }>;
  settings: Record<string, unknown>;
}

interface ExistingData {
  integration?: string;
  group?: string;
  posts: Array<Post & { canEdit?: boolean }>;
  settings: Record<string, unknown>;
  channels?: ExistingDataChannel[];
  pipelineId?: string;
  pipelineQueueItemId?: string;
  pipelineQueueItemStatus?:
    | 'QUEUED'
    | 'PUBLISHING'
    | 'FAILED'
    | 'PUBLISHED'
    | 'REMOVED';
}

const ExistingDataContext = createContext<ExistingData>({
  integration: '',
  group: undefined as undefined | string,
  posts: [] as Post[],
  settings: {},
});
export const ExistingDataContextProvider: FC<{
  children: ReactNode;
  value: any;
}> = ({ children, value }) => {
  return (
    <ExistingDataContext.Provider value={value}>
      {children}
    </ExistingDataContext.Provider>
  );
};
export const useExistingData = () => useContext(ExistingDataContext);

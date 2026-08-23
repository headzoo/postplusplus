'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { parseApiError } from '@gitroom/frontend/components/pipelines/pipeline.utils';
import {
  ContextDocumentMetadata,
  getContextDocumentSkillSlug,
} from '@gitroom/frontend/components/context-documents/context-document.types';
import { CONTEXT_DOCUMENTS_KEY } from '@gitroom/frontend/components/context-documents/use.context-document.list';
import {
  contextDocumentContentKey,
  contextDocumentSkillContentKey,
} from '@gitroom/frontend/components/context-documents/use.context-document.content';
import { PIPELINES_KEY } from '@gitroom/frontend/components/pipelines/use.pipeline.list';
import { AGENT_SKILLS_KEY } from '@gitroom/frontend/components/agents/use.agent.skills';

export const useContextDocumentUpdate = () => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();

  return useCallback(
    async (
      id: string,
      content: string,
      options?: { documentName?: string; description?: string | null }
    ) => {
      const response = await fetch(`${CONTEXT_DOCUMENTS_KEY}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          content,
          ...(options && 'description' in options
            ? { description: options.description ?? null }
            : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const updated = (await response.json()) as ContextDocumentMetadata;
      const skillSlug =
        updated.skill?.slug ||
        getContextDocumentSkillSlug(options?.documentName || updated.name);

      await Promise.all([
        mutate(CONTEXT_DOCUMENTS_KEY),
        mutate(AGENT_SKILLS_KEY),
        mutate(PIPELINES_KEY),
        ...(skillSlug
          ? [mutate(contextDocumentSkillContentKey(skillSlug))]
          : [mutate(contextDocumentContentKey(updated.id))]),
      ]);

      return updated;
    },
    [fetch, mutate]
  );
};

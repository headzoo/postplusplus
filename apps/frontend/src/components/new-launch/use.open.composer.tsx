'use client';

import { useCallback } from 'react';
import dayjs from 'dayjs';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import {
  ADD_EDIT_MODAL_OPTIONS,
  AddEditModal,
  AddEditModalProps,
} from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { PostReferenceState } from '@gitroom/frontend/components/new-launch/post-reference.types';

export interface OpenComposerOptions {
  integrations: Integrations[];
  mutate?: () => void;
  date?: dayjs.Dayjs;
  selectedChannels?: string[];
  focusedChannel?: string;
  initialPostReference?: PostReferenceState;
  dummy?: AddEditModalProps['dummy'];
  set?: AddEditModalProps['set'];
  padding?: AddEditModalProps['padding'];
  customClose?: AddEditModalProps['customClose'];
  onlyValues?: AddEditModalProps['onlyValues'];
}

export const useOpenComposer = () => {
  const modal = useModals();
  const fetch = useFetch();

  const openComposer = useCallback(
    async (options: OpenComposerOptions) => {
      const date =
        options.date ??
        dayjs
          .utc((await (await fetch('/posts/find-slot')).json()).date)
          .local();

      const reopenModal = () => openComposer(options);

      modal.openModal({
        ...ADD_EDIT_MODAL_OPTIONS,
        children: (
          <AddEditModal
            allIntegrations={options.integrations.map((integration) => ({
              ...integration,
            }))}
            integrations={options.integrations}
            reopenModal={reopenModal}
            mutate={options.mutate ?? (() => undefined)}
            date={date}
            selectedChannels={options.selectedChannels}
            focusedChannel={options.focusedChannel}
            initialPostReference={options.initialPostReference}
            dummy={options.dummy}
            set={options.set}
            padding={options.padding}
            customClose={options.customClose}
            onlyValues={options.onlyValues}
          />
        ),
        title: '',
      });
    },
    [fetch, modal]
  );

  return { openComposer };
};

'use client';

import { useCallback } from 'react';
import dayjs from 'dayjs';
import useSWR, { useSWRConfig } from 'swr';
import { Media } from '@prisma/client';
import { MediaBox } from '@gitroom/frontend/components/media/media.component';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { SetSelectionModal } from '@gitroom/frontend/components/launches/calendar';
import {
  ADD_EDIT_MODAL_OPTIONS,
  AddEditModal,
} from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';

export const MediaLayoutComponent = () => {
  const fetch = useFetch();
  const modal = useModals();
  const t = useT();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: integrations = [] } = useIntegrationList();
  const setList = useCallback(async () => {
    return (await fetch('/sets')).json();
  }, [fetch]);
  const { data: sets = [] } = useSWR('sets', setList, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });

  const reloadCalendarView = useCallback(() => {
    globalMutate((key) => {
      if (typeof key === 'string') {
        return (
          key.startsWith('/posts') ||
          key.startsWith('/pipelines/calendar') ||
          key === 'sets'
        );
      }

      return false;
    });
  }, [globalMutate]);

  const createPostFromMedia = useCallback(
    async (media: Media) => {
      if (!integrations.length) {
        return;
      }

      const date = (await (await fetch('/posts/find-slot')).json()).date;

      const set: any = !sets.length
        ? undefined
        : await new Promise((resolve) => {
            modal.openModal({
              title: t('select_set', 'Select a Set'),
              closeOnClickOutside: true,
              closeOnEscape: true,
              withCloseButton: false,
              onClose: () => resolve('exit'),
              classNames: {
                modal: 'text-textColor',
              },
              children: (
                <SetSelectionModal
                  sets={sets}
                  onSelect={(selectedSet) => {
                    resolve(selectedSet);
                    modal.closeAll();
                  }}
                  onContinueWithoutSet={() => {
                    resolve(undefined);
                    modal.closeAll();
                  }}
                />
              ),
            });
          });

      if (set === 'exit') return;

      modal.openModal({
        ...ADD_EDIT_MODAL_OPTIONS,
        children: (
          <AddEditModal
            allIntegrations={integrations.map((p) => ({
              ...p,
            }))}
            {...(set?.content ? { set: JSON.parse(set.content) } : {})}
            onlyValues={[
              {
                content: '',
                image: [
                  {
                    id: media.id,
                    path: media.path,
                  },
                ],
              },
            ]}
            reopenModal={() => createPostFromMedia(media)}
            mutate={reloadCalendarView}
            integrations={integrations}
            date={dayjs.utc(date).local()}
          />
        ),
        title: ``,
      });
    },
    [integrations, sets, fetch, modal, t, reloadCalendarView]
  );

  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all">
      <MediaBox
        setMedia={() => {}}
        closeModal={() => {}}
        standalone={true}
        onCreatePost={integrations.length > 0 ? createPostFromMedia : undefined}
      />
    </div>
  );
};

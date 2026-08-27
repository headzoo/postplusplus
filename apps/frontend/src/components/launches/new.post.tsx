import React, { useCallback } from 'react';
import clsx from 'clsx';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { SetSelectionModal } from '@gitroom/frontend/components/launches/calendar';
import {
  ADD_EDIT_MODAL_OPTIONS,
  AddEditModal,
} from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import useSWR, { useSWRConfig } from 'swr';

export const NewPost = ({
  variant = 'sidebar',
}: {
  variant?: 'sidebar' | 'header';
}) => {
  const fetch = useFetch();
  const modal = useModals();
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
  const t = useT();

  const createAPost = useCallback(async () => {
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
          reopenModal={createAPost}
          mutate={reloadCalendarView}
          integrations={integrations}
          date={dayjs.utc(date).local()}
        />
      ),
      title: ``,
    });
  }, [integrations, sets]);
  return (
    <button
      onClick={createAPost}
      className={clsx(
        'text-white rounded-md bg-btnPrimary flex justify-center items-center gap-[5px] outline-none',
        variant === 'header'
          ? 'px-[16px] py-[8px] min-h-[40px] text-[14px] font-[500] whitespace-nowrap'
          : 'flex-1 pt-[12px] pb-[14px] ps-[16px] pe-[20px] group-[.sidebar]:p-0 min-h-[44px] max-h-[44px]'
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="21"
        height="20"
        viewBox="0 0 21 20"
        fill="none"
        className="min-w-[21px] min-h-[20px]"
      >
        <path
          d="M10.5001 4.16699V15.8337M4.66675 10.0003H16.3334"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div
        className={clsx(
          'text-[14px]',
          variant === 'sidebar' && 'flex-1 text-start group-[.sidebar]:hidden'
        )}
      >
        {variant === 'header'
          ? t('post', 'Post')
          : t('create_new_post', 'Create Post')}
      </div>
    </button>
  );
};

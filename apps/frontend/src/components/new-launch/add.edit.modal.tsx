'use client';
import 'reflect-metadata';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import dayjs from 'dayjs';
import { FC, useEffect } from 'react';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { ManageModal } from '@gitroom/frontend/components/new-launch/manage.modal';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { useShallow } from 'zustand/react/shallow';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';

const toEditorHtml = (content: string) =>
  content.indexOf('<p>') > -1
    ? content
    : content
        .split('\n')
        .map((line) => (line ? `<p>${line}</p>` : '<p><br></p>'))
        .join('');

export const ADD_EDIT_MODAL_OPTIONS = {
  id: 'add-edit-modal',
  closeOnClickOutside: false,
  removeLayout: true,
  closeOnEscape: false,
  withCloseButton: false,
  askClose: true,
  fullScreen: true,
  scrollableBackdrop: true,
  classNames: {
    modal: 'w-full min-h-full text-textColor',
  },
} as const;

export interface AddEditModalProps {
  dummy?: boolean;
  date: dayjs.Dayjs;
  integrations: Integrations[];
  allIntegrations?: Integrations[];
  selectedChannels?: string[];
  set?: any;
  focusedChannel?: string;
  addEditSets?: (data: any) => void;
  reopenModal: () => void;
  mutate: () => void;
  padding?: string;
  customClose?: () => void;
  onlyValues?: Array<{
    content: string;
    id?: string;
    image?: Array<{
      id: string;
      path: string;
    }>;
  }>;
}

export const AddEditModal: FC<AddEditModalProps> = (props) => {
  const { setAllIntegrations, setDate, setIsCreateSet, setDummy } =
    useLaunchStore(
      useShallow((state) => ({
        setAllIntegrations: state.setAllIntegrations,
        setDate: state.setDate,
        setIsCreateSet: state.setIsCreateSet,
        setDummy: state.setDummy,
      }))
    );

  const integrations = useLaunchStore((state) => state.integrations);
  useEffect(() => {
    setDummy(!!props.dummy);
    setDate(props.date || newDayjs());
    setAllIntegrations(props.allIntegrations || []);
    setIsCreateSet(!!props.addEditSets);
  }, []);

  if (!integrations.length) {
    return null;
  }

  return <AddEditModalInner {...props} />;
};

export const AddEditModalInner: FC<AddEditModalProps> = (props) => {
  const existingData = useExistingData();
  const { addOrRemoveSelectedIntegration, selectedIntegrations, integrations } =
    useLaunchStore(
      useShallow((state) => ({
        integrations: state.integrations,
        selectedIntegrations: state.selectedIntegrations,
        addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      }))
    );

  useEffect(() => {
    if (props?.set?.posts?.length) {
      for (const post of props?.set?.posts) {
        if (post.integration) {
          const integration = integrations.find(
            (i) => i.id === post.integration.id
          );
          addOrRemoveSelectedIntegration(integration, post.settings);
        }
      }
    }

    const existingChannels =
      existingData.channels ||
      (existingData.integration
        ? [
            {
              integration: existingData.integration,
              settings: existingData.settings,
              posts: existingData.posts,
            },
          ]
        : []);
    for (const channel of existingChannels) {
      const integration = integrations.find(
        (i) => i.id === channel.integration
      );
      if (integration) {
        addOrRemoveSelectedIntegration(integration, channel.settings);
      }
    }

    if (props?.selectedChannels?.length) {
      for (const channel of props.selectedChannels) {
        const integration = integrations.find((i) => i.id === channel);
        if (integration) {
          addOrRemoveSelectedIntegration(integration, {});
        }
      }
    }
  }, []);

  if (existingData.integration && selectedIntegrations.length === 0) {
    return null;
  }

  return <AddEditModalInnerInner {...props} />;
};

export const AddEditModalInnerInner: FC<AddEditModalProps> = (props) => {
  const existingData = useExistingData();
  const {
    reset,
    addGlobalValue,
    addInternalValue,
    global,
    setCurrent,
    internal,
    setTags,
    setEditor,
    setRepeater,
  } = useLaunchStore(
    useShallow((state) => ({
      reset: state.reset,
      addGlobalValue: state.addGlobalValue,
      addInternalValue: state.addInternalValue,
      setCurrent: state.setCurrent,
      global: state.global,
      internal: state.internal,
      setTags: state.setTags,
      setEditor: state.setEditor,
      setRepeater: state.setRepeater,
    }))
  );

  useEffect(() => {
    const existingChannels =
      existingData.channels ||
      (existingData.integration
        ? [
            {
              integration: existingData.integration,
              settings: existingData.settings,
              posts: existingData.posts,
            },
          ]
        : []);
    if (existingChannels.length) {
      if (existingChannels[0]?.posts?.[0]?.intervalInDays) {
        setRepeater(existingChannels[0].posts[0].intervalInDays);
      }
      setTags(
        // @ts-ignore
        existingChannels[0]?.posts?.[0]?.tags?.map((p: any) => ({
          label: p.tag.name,
          value: p.tag.name,
        })) || []
      );
      for (const channel of existingChannels) {
        addInternalValue(
          0,
          channel.integration,
          channel.posts.map((post) => ({
            delay: post.delay,
            content: toEditorHtml(post.content),
            id: post.id,
            // @ts-ignore
            media: post.image as any[],
          }))
        );
      }
      setCurrent(existingChannels[0].integration);
    } else {
      setEditor('normal');
    }

    if (props.focusedChannel) {
      setCurrent(props.focusedChannel);
    }

    addGlobalValue(
      0,
      props.onlyValues?.length
        ? props.onlyValues.map((p) => ({
            content: toEditorHtml(p.content),
            id: makeId(10),
            media: p.image || [],
          }))
        : props.set?.posts?.length
        ? props.set.posts[0].value.map((p: any) => ({
            id: makeId(10),
            content: toEditorHtml(p.content),
            // @ts-ignore
            media: p.media,
          }))
        : [
            {
              content: '',
              id: makeId(10),
              media: [],
            },
          ]
    );

    return () => {
      reset();
    };
  }, []);

  if (!global.length && !internal.length) {
    return null;
  }

  return (
    <>
      <style>{`#support-discord {display: none !important;}`}</style>
      <ManageModal {...props} />
    </>
  );
};

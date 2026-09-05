'use client';

import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AddEditModalProps } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PicksSocialsComponent } from '@gitroom/frontend/components/new-launch/picks.socials.component';
import { EditorWrapper } from '@gitroom/frontend/components/new-launch/editor';
import { SelectCurrent } from '@gitroom/frontend/components/new-launch/select.current';
import { ShowAllProviders } from '@gitroom/frontend/components/new-launch/providers/show.all.providers';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { DatePicker } from '@gitroom/frontend/components/launches/helpers/date.picker';
import { useShallow } from 'zustand/react/shallow';
import { RepeatComponent } from '@gitroom/frontend/components/launches/repeat.component';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { capitalize } from 'lodash';
import { SelectCustomer } from '@gitroom/frontend/components/launches/select.customer';
import { CopilotAssistantPopup } from '@gitroom/frontend/components/layout/copilot.assistant.popup';
import { useHelpPanelOpen } from '@gitroom/frontend/components/help/use.copilot.help.page';
import { DummyCodeComponent } from '@gitroom/frontend/components/new-launch/dummy.code.component';
import { CreationMethodBadge } from '@gitroom/frontend/components/launches/creation.method.badge';
import {
  CloseIcon,
  TrashIcon,
  DropdownArrowSmallIcon,
} from '@gitroom/frontend/components/ui/icons';
import { CustomScrollArea } from '@gitroom/frontend/components/ui/custom.scroll.area';
import { useShortlinkPreference } from '@gitroom/frontend/components/settings/shortlink-preference.component';
import dayjs from 'dayjs';
import { Button } from '@gitroom/react/form/button';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import {
  formatPipelineSlot,
  shouldHideComposerDatePicker,
  shouldHideComposerScheduleControls,
} from '@gitroom/frontend/components/pipelines/pipeline.utils';
import {
  PIPELINES_KEY,
  usePipelineList,
} from '@gitroom/frontend/components/pipelines/use.pipeline.list';
import { pipelineDetailKey } from '@gitroom/frontend/components/pipelines/use.pipeline.detail';
import {
  getLastPipelineId,
  setLastPipelineId,
} from '@gitroom/frontend/components/new-launch/last-pipeline';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  postReferenceSnapshotKey,
  attachRootPostReference,
} from '@gitroom/frontend/components/new-launch/post-reference.types';
import { ComposerPostReferencePreview } from '@gitroom/frontend/components/new-launch/post-reference.preview';

export const ManageModal: FC<AddEditModalProps> = (props) => {
  const t = useT();
  const fetch = useFetch();
  const helpPanelOpen = useHelpPanelOpen();
  const ref = useRef(null);
  const existingData = useExistingData();
  const [loading, setLoading] = useState(false);
  const toaster = useToaster();
  const modal = useModals();
  const router = useRouter();
  const { mutate: mutateSWR } = useSWRConfig();
  const { reloadCalendarView } = useCalendar();
  const { data: shortlinkPreferenceData } = useShortlinkPreference();
  const { data: pipelines } = usePipelineList();

  const { addEditSets, mutate, customClose, dummy } = props;

  const {
    selectedIntegrations,
    hide,
    date,
    setDate,
    repeater,
    setRepeater,
    tags,
    setTags,
    integrations,
    setSelectedIntegrations,
    locked,
    current,
    activateExitButton,
    setHide,
    showSettings,
    setShowSettings,
    publishingMode,
    setPublishingMode,
    pipelineId,
    setPipelineId,
    resetForNextPost,
    global,
    internal,
    editor,
    postReference,
  } = useLaunchStore(
    useShallow((state) => ({
      hide: state.hide,
      setHide: state.setHide,
      date: state.date,
      setDate: state.setDate,
      current: state.current,
      repeater: state.repeater,
      setRepeater: state.setRepeater,
      tags: state.tags,
      setTags: state.setTags,
      selectedIntegrations: state.selectedIntegrations,
      integrations: state.integrations,
      setSelectedIntegrations: state.setSelectedIntegrations,
      locked: state.locked,
      activateExitButton: state.activateExitButton,
      showSettings: state.showSettings,
      setShowSettings: state.setShowSettings,
      publishingMode: state.publishingMode,
      setPublishingMode: state.setPublishingMode,
      pipelineId: state.pipelineId,
      setPipelineId: state.setPipelineId,
      resetForNextPost: state.resetForNextPost,
      global: state.global,
      internal: state.internal,
      editor: state.editor,
      postReference: state.postReference,
    }))
  );
  const activePipelines = useMemo(
    () => (pipelines || []).filter((pipeline) => pipeline.active),
    [pipelines]
  );
  const selectedPipeline = activePipelines.find(
    (pipeline) => pipeline.id === pipelineId
  );
  const pipelineMode =
    publishingMode === 'pipeline' &&
    !!selectedPipeline &&
    !existingData?.integration &&
    !postReference;

  const selectPipeline = useCallback(
    (nextPipelineId: string) => {
      if (postReference) {
        return;
      }
      const pipeline = activePipelines.find(
        (candidate) => candidate.id === nextPipelineId
      );
      if (!pipeline) {
        setPublishingMode('manual');
        setPipelineId(undefined);
        return;
      }
      setSelectedIntegrations(
        pipeline.channels.map((integration) => ({
          settings: {},
          selectedIntegrations: integration,
        }))
      );
      setPipelineId(pipeline.id);
      setPublishingMode('pipeline');
      setLastPipelineId(pipeline.id);
    },
    [
      activePipelines,
      postReference,
      setPipelineId,
      setPublishingMode,
      setSelectedIntegrations,
    ]
  );

  const restoredPipelineRef = useRef(false);
  useEffect(() => {
    if (
      restoredPipelineRef.current ||
      existingData?.integration ||
      addEditSets ||
      props.selectedChannels?.length ||
      props.set ||
      props.initialPostReference ||
      postReference ||
      !activePipelines.length
    ) {
      return;
    }
    restoredPipelineRef.current = true;
    const lastPipelineId = getLastPipelineId();
    if (
      lastPipelineId &&
      activePipelines.some((pipeline) => pipeline.id === lastPipelineId)
    ) {
      selectPipeline(lastPipelineId);
    }
  }, [
    activePipelines,
    addEditSets,
    existingData?.integration,
    props.selectedChannels,
    props.set,
    props.initialPostReference,
    postReference,
    selectPipeline,
  ]);

  useEffect(() => {
    if (!postReference || publishingMode !== 'pipeline') {
      return;
    }

    setPublishingMode('manual');
    setPipelineId(undefined);
  }, [postReference, publishingMode, setPipelineId, setPublishingMode]);

  useEffect(() => {
    if (hide) {
      setHide(false);
    }
  }, [hide]);

  useEffect(() => {
    if (!showSettings) {
      return;
    }

    requestAnimationFrame(() => {
      document
        .querySelector('#wrapper-settings')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [showSettings]);

  const changeCustomer = useCallback(
    (customer: string) => {
      const neededIntegrations = integrations.filter(
        (p) => p?.customer?.id === customer
      );
      setSelectedIntegrations(
        neededIntegrations.map((p) => ({
          settings: {},
          selectedIntegrations: p,
        }))
      );
    },
    [integrations]
  );

  const initialSnapshotRef = useRef<string | null>(null);
  const baselineReadyRef = useRef(false);
  const isEditingExistingPost = !!existingData?.integration;
  const rootPost = existingData?.posts?.[0];
  const isAlreadyScheduled =
    rootPost?.state === 'QUEUE' ||
    (rootPost?.state === 'DRAFT' && !!rootPost?.publishDate);
  const isPublished = rootPost?.state === 'PUBLISHED';
  const hasPipelineQueueItem = !!existingData?.pipelineQueueItemId;
  const hideScheduleControls = shouldHideComposerScheduleControls({
    isEditingExistingPost,
    isAlreadyScheduled,
    hasPipelineQueueItem,
  });
  const hideDatePicker = shouldHideComposerDatePicker({
    hideScheduleControls,
    hasPipelineQueueItem,
  });
  const publishedRoots = (
    existingData?.channels?.length
      ? existingData.channels.map((channel) => channel.posts?.[0])
      : existingData?.posts?.length
      ? [existingData.posts[0]]
      : []
  ).filter((post) => post?.state === 'PUBLISHED');
  const cannotEditPublished =
    publishedRoots.length > 0 &&
    publishedRoots.some((post) => !(post as { canEdit?: boolean })?.canEdit);

  const getComposerSnapshot = useCallback(() => {
    const normalizeContent = (content: string) =>
      stripHtmlValidation(editor || 'normal', content || '', true).trim();

    return JSON.stringify({
      global: global.map((value) => ({
        content: normalizeContent(value.content),
        media: (value.media || []).map((media) => media.id).sort(),
        delay: value.delay ?? 0,
      })),
      internal: internal.map((item) => ({
        integrationId: item.integration.id,
        values: item.integrationValue.map((value) => ({
          content: normalizeContent(value.content),
          media: (value.media || []).map((media) => media.id).sort(),
          delay: value.delay ?? 0,
        })),
      })),
      tags: [...tags.map((tag) => tag.value)].sort(),
      date: date.utc().format('YYYY-MM-DDTHH:mm:ss'),
      repeater: repeater ?? null,
      settings: selectedIntegrations
        .map((integration) => ({
          id: integration.integration.id,
          settings: integration.settings,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      postReference: postReferenceSnapshotKey(postReference),
    });
  }, [
    editor,
    global,
    internal,
    tags,
    date,
    repeater,
    selectedIntegrations,
    postReference,
  ]);

  // Existing posts keep hydrating after first paint (editor mode, TipTap HTML
  // normalization, provider settings). Refresh the baseline until state is idle,
  // then lock so only real user edits count as unsaved.
  useEffect(() => {
    if (!isEditingExistingPost || baselineReadyRef.current) {
      return;
    }

    initialSnapshotRef.current = getComposerSnapshot();
    const lockTimer = window.setTimeout(() => {
      initialSnapshotRef.current = getComposerSnapshot();
      baselineReadyRef.current = true;
    }, 500);

    return () => window.clearTimeout(lockTimer);
  }, [isEditingExistingPost, getComposerSnapshot]);

  const hasComposerText = useCallback(() => {
    const hasText = (content: string) =>
      stripHtmlValidation(editor || 'normal', content || '', true).trim()
        .length > 0;

    return (
      global.some((value) => hasText(value.content)) ||
      internal.some((item) =>
        item.integrationValue.some((value) => hasText(value.content))
      )
    );
  }, [editor, global, internal]);

  const hasUnsavedChanges = useCallback(() => {
    if (isEditingExistingPost) {
      if (!baselineReadyRef.current || initialSnapshotRef.current === null) {
        return false;
      }

      return getComposerSnapshot() !== initialSnapshotRef.current;
    }

    return hasComposerText() || !!postReference;
  }, [
    isEditingExistingPost,
    getComposerSnapshot,
    hasComposerText,
    postReference,
  ]);

  const closeComposer = useCallback(() => {
    if (customClose) {
      customClose();
      return;
    }
    modal.closeAll();
  }, [customClose, modal]);

  const askClose = useCallback(async () => {
    if (!activateExitButton || dummy) {
      return;
    }

    if (!hasUnsavedChanges()) {
      closeComposer();
      return;
    }

    if (
      await deleteDialog(
        t(
          'are_you_sure_you_want_to_close_this_modal_all_data_will_be_lost',
          'Are you sure you want to close this modal? (all data will be lost)'
        ),
        t('continue', 'Continue'),
        undefined,
        t('cancel', 'Cancel')
      )
    ) {
      closeComposer();
    }
  }, [activateExitButton, dummy, hasUnsavedChanges, closeComposer, t]);

  useHotkeys(
    'Escape',
    () => {
      if (activateExitButton && !dummy) {
        askClose();
      }
    },
    [activateExitButton, dummy, askClose]
  );

  const deletePost = useCallback(async () => {
    setLoading(true);
    if (
      !(await deleteDialog(
        t(
          'are_you_sure_you_want_to_delete_post',
          'Are you sure you want to delete this post?'
        ),
        t('yes_delete_it', 'Yes, delete it!')
      ))
    ) {
      setLoading(false);
      return;
    }
    await fetch(`/posts/${existingData.group}`, {
      method: 'DELETE',
    });
    mutate();
    modal.closeAll();
    return;
  }, [existingData, mutate, modal]);

  const schedule = useCallback(
    (type: 'draft' | 'now' | 'schedule' | 'update') => async () => {
      const shouldEnqueueInPipeline = pipelineMode && type === 'schedule';
      let shouldQueueAtEnd =
        !!existingData?.pipelineQueueItemId && type === 'schedule';
      let republish = false;
      if (shouldQueueAtEnd) {
        if (existingData?.pipelineQueueItemStatus === 'PUBLISHED') {
          const channels = selectedIntegrations
            .map((p) => p.integration.name)
            .join(', ');
          const whatToDo = await new Promise((resolve) => {
            modal.openModal({
              title: t('what_do_you_want_to_do', 'What do you want to do?'),
              children: (
                <div className="flex flex-col">
                  <div className="text-[20px] mb-[20px]">
                    {t(
                      'post_already_published_pipeline_requeue_warning',
                      'This post was already published. Scheduling will move it to the end of the Pipeline queue so it publishes again to'
                    )}{' '}
                    {channels}{' '}
                    {t(
                      'pipeline_next_available_slot_suffix',
                      'in the next available recurring slot.'
                    )}
                  </div>
                  <div className="flex w-full gap-[10px]">
                    <div className="flex-1 flex">
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={() => resolve('update')}
                      >
                        {t(
                          'just_update_post_details',
                          'Just update the post details'
                        )}
                      </Button>
                    </div>
                    <div className="flex-1 flex">
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={() => resolve('republish')}
                      >
                        {t(
                          'queue_at_next_pipeline_slot',
                          'Queue at next Pipeline slot'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ),
            });
          });

          if (whatToDo === 'update') {
            type = 'update';
            shouldQueueAtEnd = false;
          }

          if (whatToDo === 'republish') {
            republish = true;
            type = 'update';
          }
        } else {
          type = 'draft';
        }
      } else if (
        !shouldEnqueueInPipeline &&
        (type === 'now' || type === 'schedule') &&
        (existingData?.posts?.[0]?.state === 'PUBLISHED' ||
          (existingData?.posts?.[0]?.state === 'QUEUE' &&
            dayjs().isAfter(date.utc())))
      ) {
        const channels = selectedIntegrations
          .map((p) => p.integration.name)
          .join(', ');
        const isRecurring =
          !!repeater || !!existingData?.posts?.[0]?.intervalInDays;

        const whatToDo = await new Promise((resolve) => {
          modal.openModal({
            title: t('what_do_you_want_to_do', 'What do you want to do?'),
            children: (
              <div className="flex flex-col">
                <div className="text-[20px] mb-[20px]">
                  {t(
                    'post_already_published_republish_warning',
                    'This post was already published. Republishing will publish it again to'
                  )}{' '}
                  {channels} {t('republish_at', 'at')}{' '}
                  {date.format('DD/MM/YYYY HH:mm')}.
                  {isRecurring && (
                    <div className="mt-[10px]">
                      {t(
                        'republish_recurring_note',
                        'This is a recurring post: your changes apply to all future recurrences starting now.'
                      )}
                    </div>
                  )}
                </div>
                <div className="flex w-full gap-[10px]">
                  <div className="flex-1 flex">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => resolve('update')}
                    >
                      {t(
                        'just_update_post_details',
                        'Just update the post details'
                      )}
                    </Button>
                  </div>
                  <div className="flex-1 flex">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => resolve('republish')}
                    >
                      {t('republish_the_post', 'Republish the post')}
                    </Button>
                  </div>
                </div>
              </div>
            ),
          });
        });

        if (whatToDo === 'update') {
          type = 'update';
        }

        if (whatToDo === 'republish') {
          republish = true;
        }
      }

      setLoading(true);

      // Pull the local values to build the payload, but rely on the server
      // (`/posts/valid`) for the actual validation — checkValidity now lives
      // server-side so it can't be bypassed.
      const allValues = await ref.current.getAllValues();

      const integrationById = (id: string) =>
        selectedIntegrations.find((p) => p.integration.id === id);

      const group = existingData.group || makeId(10);

      const posts = allValues.map((post: any) =>
        attachRootPostReference(
          {
            integration: {
              id: post.id,
            },
            group,
            settings: { ...(post.settings || {}) },
            value: post.values.map((value: any) => ({
              ...(value.id ? { id: value.id } : {}),
              content: value.content,
              delay: value.delay || 0,
              image:
                (value?.media || []).map(
                  ({ id, path, alt, thumbnail, thumbnailTimestamp }: any) => ({
                    id,
                    path,
                    alt,
                    thumbnail,
                    thumbnailTimestamp,
                  })
                ) || [],
            })),
          },
          postReference
        )
      );

      if (!dummy) {
        const checkAllValid = await (
          await fetch('/posts/valid', {
            method: 'POST',
            body: JSON.stringify({ type, posts }),
          })
        ).json();

        const focus = (id: string, where: 'fix' | 'preview') => {
          integrationById(id)?.ref?.current?.[where]?.();
        };

        const notEnoughChars = checkAllValid.filter((p: any) => p.emptyContent);

        for (const item of notEnoughChars) {
          toaster.show(
            `${capitalize(item.identifier.split('-')[0])} (${item.name}):` +
              ' ' +
              t(
                'post_needs_content_or_image',
                'Your post should have at least one character or one image.'
              ),
            'warning'
          );
          setLoading(false);
          focus(item.id, 'preview');
          return;
        }

        if (type !== 'draft') {
          for (const item of checkAllValid) {
            if (item.valid === false) {
              toaster.show(
                `${capitalize(item.identifier.split('-')[0])} (${item.name}): ${
                  item.settingsError ||
                  t('please_fix_your_settings', 'Please fix your settings')
                }`,
                'warning'
              );
              focus(item.id, 'fix');
              setLoading(false);
              setShowSettings(true);
              return;
            }

            if (item.errors !== true) {
              toaster.show(
                `${capitalize(item.identifier.split('-')[0])} (${item.name}): ${
                  item.errors
                }`,
                'warning'
              );
              focus(item.id, 'preview');
              setLoading(false);
              setShowSettings(false);
              return;
            }

            if (item.tooLong) {
              toaster.show(
                `${item.name} (${item.identifier}) ${t(
                  'post_is_too_long',
                  'post is too long, please fix it'
                )}`,
                'warning'
              );
              focus(item.id, 'preview');
              setLoading(false);
              return;
            }
          }
        }
      }

      const shortlinkPreference = shortlinkPreferenceData?.shortlink || 'ASK';

      let shortLink = false;

      if (!dummy && shortlinkPreference !== 'NO') {
        const shortLinkUrl = await (
          await fetch('/posts/should-shortlink', {
            method: 'POST',
            body: JSON.stringify({
              messages: allValues
                // platforms that remove links won't keep shortlinks either
                .filter(
                  (p: any) => !integrationById(p.id)?.integration?.stripLinks
                )
                .flatMap((p: any) => p.values.flatMap((a: any) => a.content)),
            }),
          })
        ).json();

        if (shortLinkUrl.ask) {
          if (shortlinkPreference === 'YES') {
            // Automatically shortlink without asking
            shortLink = true;
          } else {
            // ASK: Show the dialog
            shortLink = await deleteDialog(
              t(
                'shortlink_urls_question',
                'Do you want to shortlink the URLs? it will let you get statistics over clicks'
              ),
              t('yes_shortlink_it', 'Yes, shortlink it!'),
              undefined,
              t('no_original_urls', 'No, original URLs')
            );
          }
        }
      }

      const data = {
        type,
        ...(!shouldQueueAtEnd && republish ? { republish } : {}),
        ...(repeater ? { inter: repeater } : {}),
        tags,
        shortLink,
        date: date.utc().format('YYYY-MM-DDTHH:mm:ss'),
        posts,
      };
      const pipelineData = shouldEnqueueInPipeline
        ? {
            pipelineId: selectedPipeline!.id,
            post: {
              type: 'draft' as const,
              tags,
              shortLink,
              posts,
            },
          }
        : undefined;

      if (dummy) {
        modal.openModal({
          title: '',
          children: <DummyCodeComponent code={pipelineData || data} />,
          classNames: {
            modal: 'w-[100%] bg-transparent text-textColor',
          },
          size: '100%',
          withCloseButton: false,
          closeOnEscape: true,
          closeOnClickOutside: true,
        });

        setLoading(false);
      }

      if (!dummy) {
        try {
          if (shouldEnqueueInPipeline) {
            const response = await fetch('/pipelines/enqueue', {
              method: 'POST',
              body: JSON.stringify(pipelineData),
            });
            if (!response.ok) {
              const error = await response.json().catch(() => undefined);
              throw new Error(
                error?.message || 'Unable to add this content to the Pipeline.'
              );
            }
          } else {
            const skipPostSave =
              shouldQueueAtEnd &&
              existingData?.pipelineQueueItemStatus === 'PUBLISHED' &&
              cannotEditPublished;
            if (addEditSets) {
              addEditSets(data);
            } else if (!skipPostSave) {
              await fetch('/posts', {
                method: 'POST',
                body: JSON.stringify(data),
              });
            }
            if (shouldQueueAtEnd && existingData?.pipelineQueueItemId) {
              const response = await fetch(
                `/pipelines/items/${existingData.pipelineQueueItemId}/queue-at-end`,
                {
                  method: 'POST',
                  body: JSON.stringify({
                    ...(republish ||
                    existingData.pipelineQueueItemStatus === 'PUBLISHED'
                      ? { republish: true }
                      : {}),
                  }),
                }
              );
              if (!response.ok) {
                const error = await response.json().catch(() => undefined);
                throw new Error(
                  error?.message ||
                    'Unable to move this item to the end of the Pipeline queue.'
                );
              }
            }
          }
        } catch (error: any) {
          toaster.show(
            error?.message || 'Unable to save this content.',
            'warning'
          );
          setLoading(false);
          return;
        }

        if (!addEditSets) {
          mutate();
          if (shouldEnqueueInPipeline || shouldQueueAtEnd) {
            const detailPipelineId =
              selectedPipeline?.id || existingData?.pipelineId;
            await Promise.all([
              mutateSWR(PIPELINES_KEY),
              ...(detailPipelineId
                ? [mutateSWR(pipelineDetailKey(detailPipelineId))]
                : []),
            ]);
            reloadCalendarView();
          }
          toaster.show(
            shouldEnqueueInPipeline
              ? t('added_to_pipeline', 'Added to Pipeline')
              : shouldQueueAtEnd
              ? t(
                  'queued_at_end_of_pipeline',
                  'Moved to the end of the Pipeline queue'
                )
              : !existingData.integration
              ? t('added_successfully', 'Added successfully')
              : t('updated_successfully', 'Updated successfully')
          );
        }
        if (customClose) {
          setTimeout(() => {
            customClose();
          }, 2000);
        }

        if (!addEditSets) {
          const shouldStayOpen =
            !existingData?.integration && !customClose && !dummy;
          if (shouldStayOpen) {
            resetForNextPost();
            const lastPipelineId = getLastPipelineId();
            if (
              lastPipelineId &&
              activePipelines.some((pipeline) => pipeline.id === lastPipelineId)
            ) {
              selectPipeline(lastPipelineId);
            }
            setLoading(false);
          } else {
            modal.closeAll();
          }
        }
      }
    },
    [
      ref,
      repeater,
      tags,
      date,
      addEditSets,
      dummy,
      shortlinkPreferenceData,
      pipelineMode,
      selectedPipeline,
      mutateSWR,
      reloadCalendarView,
      toaster,
      existingData,
      customClose,
      activePipelines,
      resetForNextPost,
      selectPipeline,
      postReference,
      cannotEditPublished,
      selectedIntegrations,
      modal,
      t,
    ]
  );

  return (
    <div className="w-full min-h-screen flex justify-center relative">
      <div className="w-full min-h-screen max-w-none bg-newBgColorInner grid grid-cols-2 mobile:grid-cols-1 grid-rows-[1fr_auto] mobile:grid-rows-none">
        <section className="min-w-0 flex flex-col border-e border-newBorder mobile:border-e-0 mobile:border-b">
          <div className="bg-newBgColor h-[65px] flex items-center gap-[12px] px-[20px] text-[20px] font-[600]">
            {t('create_post_title', 'Create Post')}
            <CreationMethodBadge
              creationMethod={existingData?.posts?.[0]?.creationMethod}
              size="sm"
            />
          </div>
          <div className="flex-1 flex flex-col gap-[16px]">
            <CustomScrollArea
              id="social-content"
              className="flex-1"
              contentClassName="gap-[32px] flex flex-col min-h-full ps-[20px] pt-[20px] pb-[20px] pr-[28px]"
            >
              <div className="flex w-full">
                <div className="flex flex-1">
                  <PicksSocialsComponent
                    toolTip={true}
                    disabled={pipelineMode}
                    quoteReferenceActive={!!postReference}
                  />
                </div>
                <div>
                  {!dummy && !pipelineMode && !postReference && (
                    <SelectCustomer
                      onChange={changeCustomer}
                      integrations={integrations}
                    />
                  )}
                </div>
              </div>
              <div className="flex flex-1 gap-[6px] flex-col">
                <div>{!existingData.integration && <SelectCurrent />}</div>
                <div className="flex-1 flex flex-col">
                  <ComposerPostReferencePreview />
                  {!hide && <EditorWrapper totalPosts={1} value="" />}
                </div>
                <div
                  id="social-empty"
                  className={clsx(
                    'pb-[16px]'
                    // current !== 'global' && 'hidden'
                  )}
                />
              </div>
              <div
                id="wrapper-settings"
                className={clsx(
                  'select-none',
                  showSettings ? 'block' : 'hidden'
                )}
              >
                <div className="flex flex-col rounded-[12px] gap-[12px] bg-newSettings">
                  <div
                    id="social-settings"
                    className="flex flex-col gap-[20px] bg-newBgColor"
                  />
                  <style>
                    {`#social-settings [data-id="${current}"] {display: block !important;}`}
                  </style>
                </div>
              </div>
            </CustomScrollArea>
          </div>
        </section>
        <section className="min-w-0 flex flex-col">
          <div className="bg-newBgColor h-[65px] flex items-center px-[20px] text-[20px] font-[600]">
            <div className="flex-1">{t('post_preview', 'Post Preview')}</div>
            <div className="cursor-pointer">
              <CloseIcon onClick={askClose} className="text-[#A3A3A3]" />
            </div>
          </div>
          <div className="flex-1 p-[20px] pr-[28px]">
            <ShowAllProviders ref={ref} />
          </div>
        </section>
        <div className="col-span-2 mobile:col-span-1 select-none min-h-[84px] py-[20px] px-[20px] border-t border-newBorder flex flex-wrap items-center gap-[12px]">
          <div className="flex items-center gap-[8px]">
            {!dummy && !pipelineMode && (
              <RepeatComponent repeat={repeater} onChange={setRepeater} />
            )}
          </div>
          <div className="flex-1 flex flex-wrap items-center justify-end gap-x-[8px] gap-y-[12px] min-w-0">
            <div className="flex items-center gap-[8px] min-w-0 tablet:w-full tablet:justify-end">
              {existingData?.integration && (
                <button
                  onClick={deletePost}
                  className="cursor-pointer flex text-[#FF3F3F] gap-[8px] items-center text-[15px] font-[600]"
                >
                  <div>
                    <TrashIcon />
                  </div>
                  <div>{t('delete_post', 'Delete Post')}</div>
                </button>
              )}
              {!dummy && !existingData?.integration && (
                <>
                  <select
                    aria-label={t('publishing_mode', 'Publishing mode')}
                    value={
                      publishingMode === 'pipeline'
                        ? pipelineId || ''
                        : publishingMode
                    }
                    onChange={(event) => {
                      if (postReference) {
                        setPublishingMode(
                          event.target.value === 'now' ? 'now' : 'manual'
                        );
                        return;
                      }

                      if (
                        event.target.value === 'manual' ||
                        event.target.value === 'now'
                      ) {
                        setPublishingMode(event.target.value);
                        return;
                      }
                      selectPipeline(event.target.value);
                    }}
                    className="h-[44px] max-w-[210px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[14px]"
                  >
                    <option value="manual">
                      {t('schedule_manually', 'Schedule manually')}
                    </option>
                    <option value="now">{t('post_now', 'Post Now')}</option>
                    {!postReference && activePipelines.length > 0 ? (
                      <optgroup label={t('pipelines', 'Pipelines')}>
                        {activePipelines.map((pipeline) => (
                          <option key={pipeline.id} value={pipeline.id}>
                            {pipeline.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : !postReference ? (
                      <option value="" disabled>
                        {t('no_active_pipelines', 'No active Pipelines')}
                      </option>
                    ) : null}
                  </select>
                  {!postReference && activePipelines.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        modal.closeAll();
                        router.push('/pipelines');
                      }}
                      className="text-[13px] font-[600] text-[#8D5CFF]"
                    >
                      {t('create_pipeline', 'Create Pipeline')}
                    </button>
                  )}
                </>
              )}
              {!pipelineMode && !hideDatePicker && (
                <DatePicker onChange={setDate} date={date} />
              )}
              {pipelineMode && (
                <div className="h-[44px] max-w-[320px] px-[16px] bg-newBgColorInner border border-newBorder rounded-[8px] flex items-center text-[15px] font-[600] text-textColor min-w-0">
                  <div className="truncate">
                    {!selectedPipeline!.active
                      ? t('pipeline_paused', 'Paused')
                      : formatPipelineSlot(
                          selectedPipeline!.projectedEnqueueFor,
                          selectedPipeline!.timezone
                        )}
                  </div>
                </div>
              )}
              {!pipelineMode && hasPipelineQueueItem && (
                <div className="h-[44px] max-w-[320px] px-[16px] bg-newBgColorInner border border-newBorder rounded-[8px] flex items-center text-[15px] font-[600] text-textColor min-w-0">
                  <div className="truncate">
                    {t(
                      'pipeline_next_available_slot',
                      'Next available Pipeline slot'
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-[8px] shrink-0">
              {!addEditSets && (
                <div
                  {...(cannotEditPublished
                    ? {
                        'data-tooltip-id': 'tooltip',
                        'data-tooltip-content': t(
                          'cannot_edit_published_post',
                          'This channel does not support editing published posts'
                        ),
                      }
                    : {})}
                >
                  <button
                    disabled={
                      selectedIntegrations.length === 0 ||
                      loading ||
                      locked ||
                      cannotEditPublished
                    }
                    onClick={schedule(
                      isEditingExistingPost ? 'update' : 'draft'
                    )}
                    className="relative cursor-pointer disabled:cursor-not-allowed disabled:opacity-80 px-[20px] h-[44px] whitespace-nowrap bg-btnSimple justify-center items-center flex rounded-[8px] text-[15px] font-[600]"
                  >
                    {loading && (
                      <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
                        <div className="animate-spin h-[20px] w-[20px] border-4 border-textColor border-t-transparent rounded-full" />
                      </div>
                    )}
                    <div className={clsx(loading && 'invisible')}>
                      {isEditingExistingPost
                        ? t('save', 'Save')
                        : t('save_as_draft', 'Save as Draft')}
                    </div>
                  </button>
                </div>
              )}
              {addEditSets && (
                <button
                  className="text-white text-[15px] font-[600] min-w-[180px] btnSub disabled:cursor-not-allowed disabled:opacity-80 outline-none gap-[8px] flex justify-center items-center h-[44px] rounded-[8px] bg-[#eb3825] ps-[20px] pe-[16px]"
                  disabled={
                    selectedIntegrations.length === 0 || loading || locked
                  }
                  onClick={schedule('draft')}
                >
                  Save Set
                </button>
              )}
              {!addEditSets && !hideScheduleControls && (
                <div className="group cursor-pointer relative">
                  <button
                    disabled={
                      selectedIntegrations.length === 0 || loading || locked
                    }
                    onClick={schedule(
                      pipelineMode
                        ? 'schedule'
                        : publishingMode === 'now'
                        ? 'now'
                        : 'schedule'
                    )}
                    className="text-white relative min-w-[180px] whitespace-nowrap btnSub disabled:cursor-not-allowed disabled:opacity-80 outline-none gap-[8px] flex justify-center items-center h-[44px] rounded-[8px] bg-[#eb3825] ps-[20px] pe-[16px]"
                  >
                    {loading && (
                      <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
                        <div className="animate-spin h-[20px] w-[20px] border-4 border-white border-t-transparent rounded-full" />
                      </div>
                    )}
                    <div
                      className={clsx(
                        'text-[15px] font-[600]',
                        loading && 'invisible'
                      )}
                    >
                      {selectedIntegrations.length === 0
                        ? t('check_circles_above', 'Check the circles above')
                        : dummy
                        ? t('create_output', 'Create output')
                        : pipelineMode
                        ? t('add_to_pipeline', 'Add to Pipeline')
                        : publishingMode === 'now'
                        ? t('post_now', 'Post Now')
                        : !existingData?.integration
                        ? t('add_to_calendar', 'Add to calendar')
                        : isPublished
                        ? t('schedule', 'Schedule')
                        : existingData?.posts?.[0]?.state === 'DRAFT'
                        ? t('schedule', 'Schedule')
                        : t('update', 'Update')}
                    </div>
                    {!dummy && (
                      <div className="flex justify-center items-center h-[20px] w-[20px] pt-[4px] arrow-change">
                        <DropdownArrowSmallIcon className="group-hover:rotate-180 text-white" />
                      </div>
                    )}
                  </button>

                  {!dummy && publishingMode === 'manual' && !pipelineMode && (
                    <button
                      onClick={schedule('now')}
                      disabled={
                        selectedIntegrations.length === 0 || loading || locked
                      }
                      className="rounded-[8px] z-[300] disabled:cursor-not-allowed disabled:opacity-80 hidden group-hover:flex absolute bottom-[100%] -left-[12px] p-[12px] w-[206px] bg-newBgColorInner"
                    >
                      <div className="text-white rounded-[8px] bg-[#D82D7E] h-[44px] w-full flex justify-center items-center post-now">
                        {t('post_now', 'Post Now')}
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {!helpPanelOpen && (
        <CopilotAssistantPopup
          instructions={`
You are an assistant that help the user to schedule their social media posts,
Here are the things you can do:
- Add a new comment / post to the list of posts
- Delete a comment / post from the list of posts
- Add content to the comment / post
- Activate or deactivate the comment / post

Post content can be added using the addPostContentFor{num} function.
After using the addPostFor{num} it will create a new addPostContentFor{num+ 1} function.
`}
        />
      )}
    </div>
  );
};

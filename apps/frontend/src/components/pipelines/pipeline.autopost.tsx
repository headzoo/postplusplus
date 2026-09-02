'use client';

import React, {
  FC,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import clsx from 'clsx';
import { array, boolean, object, string } from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { FormProvider, useForm, Controller, Resolver } from 'react-hook-form';
import { CopilotTextarea } from '@copilotkit/react-textarea';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { Slider } from '@gitroom/react/form/slider';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { PipelineChannels } from '@gitroom/frontend/components/pipelines/pipeline.channels';
import {
  PipelineAutopost,
  PipelineAutopostPayload,
} from '@gitroom/frontend/components/pipelines/pipeline.types';
import { usePipelineAutopostMutations } from '@gitroom/frontend/components/pipelines/use.pipeline.autopost.mutations';
import { usePipelineAutoposts } from '@gitroom/frontend/components/pipelines/use.pipeline.autoposts';

type PipelineAutopostFormValues = {
  title: string;
  content: string;
  syncLast: boolean;
  url: string;
  active: boolean;
  addPicture: boolean;
  generateContent: boolean;
};

const autopostSchema = object().shape({
  title: string().required(),
  content: string(),
  syncLast: boolean().required(),
  url: string().url().required(),
  active: boolean().required(),
  addPicture: boolean().required(),
  generateContent: boolean().required(),
});

const getYesNoOptions = (t: (key: string, fallback: string) => string) => [
  { label: t('yes', 'Yes'), value: true },
  { label: t('no', 'No'), value: false },
];

const PipelineAutopostForm: FC<{
  pipelineId: string;
  channels: Integrations[];
  autopost?: PipelineAutopost;
  onSaved: () => void;
}> = ({ pipelineId, channels, autopost, onSaved }) => {
  const fetch = useFetch();
  const t = useT();
  const modal = useModals();
  const toaster = useToaster();
  const { createAutopost, updateAutopost } =
    usePipelineAutopostMutations(pipelineId);
  const yesNoOptions = getYesNoOptions(t);
  const [validUrl, setValidUrl] = useState(autopost?.url || '');
  const [lastUrl, setLastUrl] = useState(autopost?.lastUrl || '');

  const formValues = useMemo(
    () => ({
      title: autopost?.title || '',
      content: autopost?.content || '',
      syncLast: autopost?.syncLast || false,
      url: autopost?.url || '',
      active: autopost?.hasOwnProperty?.('active') ? autopost.active : true,
      addPicture: autopost?.addPicture || false,
      generateContent: autopost?.hasOwnProperty?.('generateContent')
        ? autopost.generateContent
        : true,
    }),
    [autopost]
  );

  const form = useForm<PipelineAutopostFormValues>({
    resolver: yupResolver(
      autopostSchema
    ) as Resolver<PipelineAutopostFormValues>,
    mode: 'onChange',
    defaultValues: formValues,
  });

  useEffect(() => {
    if (!autopost?.id) {
      return;
    }
    form.reset(formValues);
    setValidUrl(autopost.url || '');
    setLastUrl(autopost.lastUrl || '');
  }, [autopost, form, formValues]);

  const generateContent = form.watch('generateContent');
  const content = form.watch('content');
  const url = form.watch('url');
  const titleValue = form.watch('title');
  const syncLast = form.watch('syncLast');

  const canSave =
    validUrl === url && (syncLast || !!lastUrl) && Boolean(titleValue?.trim());

  const canValidateUrl = Boolean(url);

  const buildPayload = useCallback(
    (values: PipelineAutopostFormValues): PipelineAutopostPayload => ({
      title: values.title,
      content: values.content || '',
      syncLast: values.syncLast,
      url: values.url,
      active: values.active,
      addPicture: values.addPicture,
      generateContent: values.generateContent,
      ...(!values.syncLast ? { lastUrl } : { lastUrl: '' }),
    }),
    [lastUrl]
  );

  const save = useCallback(
    async (values: PipelineAutopostFormValues) => {
      const payload = buildPayload(values);
      try {
        if (autopost?.id) {
          await updateAutopost(autopost.id, payload);
          toaster.show(
            t('autopost_updated_successfully', 'Autopost updated successfully'),
            'success'
          );
        } else {
          await createAutopost(payload);
          toaster.show(
            t('autopost_added_successfully', 'Autopost added successfully'),
            'success'
          );
        }
        modal.closeAll();
        onSaved();
      } catch (err: any) {
        toaster.show(err?.message || 'Failed to save autopost.', 'warning');
      }
    },
    [
      autopost?.id,
      buildPayload,
      createAutopost,
      modal,
      onSaved,
      t,
      toaster,
      updateAutopost,
    ]
  );

  const validateUrl = useCallback(async () => {
    const feedUrl = form.getValues('url');
    try {
      const { success, url: newUrl } = await (
        await fetch(`/autopost/send?url=${encodeURIComponent(feedUrl)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      ).json();
      if (!success) {
        setValidUrl('');
        toaster.show(
          t('could_not_use_rss_feed', 'Could not use this RSS feed'),
          'warning'
        );
        return;
      }
      toaster.show(t('rss_valid', 'RSS valid!'), 'success');
      setValidUrl(feedUrl);
      setLastUrl(newUrl);
    } catch {
      setValidUrl('');
    }
  }, [fetch, form, t, toaster]);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(save)}>
        <div className="flex flex-col gap-[16px]">
          <div className="rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] py-[10px] text-[13px] text-newTableText flex flex-col gap-[8px]">
            <div className="font-[600] text-textColor">
              {t('pipeline_autopost_channels', 'Pipeline channels')}
            </div>
            <PipelineChannels channels={channels} />
            <p>
              {t(
                'pipeline_autopost_channel_explanation',
                'New RSS items are drafted for every channel configured on this Pipeline. There is no per-feed channel picker.'
              )}
            </p>
            <p>
              {t(
                'pipeline_autopost_slot_explanation',
                'Each new item is appended to this Pipeline queue and scheduled for the next available recurring slot after existing queued posts.'
              )}
            </p>
          </div>

          <Controller
            name="title"
            control={form.control}
            render={({ field }) => (
              <Input
                name="title"
                label="Title"
                translationKey="label_title"
                disableForm
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <Controller
            name="url"
            control={form.control}
            render={({ field }) => (
              <Input
                name="url"
                label="URL"
                translationKey="label_url"
                disableForm
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <Select
            name="syncLast"
            label="Should we sync the current last post?"
            translationKey="label_should_sync_last_post"
            extraForm={{
              setValueAs: (value) => value === 'true' || value === true,
            }}
          >
            {yesNoOptions.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            name="generateContent"
            label="Autogenerate content"
            translationKey="label_autogenerate_content"
            extraForm={{
              setValueAs: (value) => value === 'true' || value === true,
            }}
          >
            {yesNoOptions.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </Select>
          {!generateContent && (
            <>
              <div className="text-[14px] mb-[6px]">
                {t('post_content', 'Post content')}
              </div>
              <CopilotTextarea
                disableBranding={true}
                className={clsx(
                  '!min-h-40 !max-h-80 p-2 overflow-x-hidden scrollbar scrollbar-thumb-btnPrimary bg-newBgColorInner outline-none mb-[16px] border border-newBorder rounded-[8px] text-textColor'
                )}
                value={content}
                onChange={(e) => {
                  form.setValue('content', e.target.value);
                }}
                placeholder={t(
                  'write_your_post_placeholder',
                  'Write your post...'
                )}
                autosuggestionsConfig={{
                  textareaPurpose: `Assist me in writing social media post`,
                  chatApiConfigs: {},
                }}
              />
            </>
          )}
          <Select
            name="addPicture"
            label="Generate Picture?"
            translationKey="label_generate_picture"
            extraForm={{
              setValueAs: (value) => value === 'true' || value === true,
            }}
          >
            {yesNoOptions.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            name="active"
            label="Active"
            translationKey="label_active"
            extraForm={{
              setValueAs: (value) => value === 'true' || value === true,
            }}
          >
            {yesNoOptions.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </Select>

          <div className="flex gap-[10px]">
            {canSave && (
              <Button type="submit" disabled={!canSave}>
                {t('save', 'Save')}
              </Button>
            )}
            <Button
              type="button"
              onClick={validateUrl}
              disabled={!canValidateUrl}
            >
              {t('send_test', 'Send Test')}
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};

export const PipelineAutopostPanel: FC<{
  pipelineId: string;
  channels: Integrations[];
}> = ({ pipelineId, channels }) => {
  const t = useT();
  const modal = useModals();
  const toaster = useToaster();
  const { data, error, isLoading, mutate } = usePipelineAutoposts(pipelineId);
  const { deleteAutopost, toggleAutopostActive } =
    usePipelineAutopostMutations(pipelineId);

  const feeds = useMemo(() => data || [], [data]);

  const openForm = useCallback(
    (autopost?: PipelineAutopost) => {
      modal.openModal({
        title: autopost
          ? t('edit_autopost', 'Edit Autopost')
          : t('add_autopost_title', 'Add Autopost'),
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[760px] text-textColor',
        },
        children: (
          <PipelineAutopostForm
            pipelineId={pipelineId}
            channels={channels}
            autopost={autopost}
            onSaved={() => mutate()}
          />
        ),
      });
    },
    [channels, modal, mutate, pipelineId, t]
  );

  const confirmDelete = useCallback(
    (autopost: PipelineAutopost) => async () => {
      if (
        await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete',
            `Are you sure you want to delete ${autopost.title}?`,
            { name: autopost.title }
          )
        )
      ) {
        try {
          await deleteAutopost(autopost.id);
          toaster.show(
            t('autopost_deleted_successfully', 'Autopost deleted successfully'),
            'success'
          );
        } catch (err: any) {
          toaster.show(err?.message || 'Failed to delete autopost.', 'warning');
        }
      }
    },
    [deleteAutopost, t, toaster]
  );

  const changeActive = useCallback(
    (autopost: PipelineAutopost) => async (value: 'on' | 'off') => {
      try {
        await toggleAutopostActive(autopost.id, value === 'on');
        await mutate();
      } catch (err: any) {
        toaster.show(
          err?.message || 'Failed to update autopost status.',
          'warning'
        );
      }
    },
    [mutate, toggleAutopostActive, toaster]
  );

  if (isLoading) {
    return (
      <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[20px] flex items-center justify-center min-h-[160px]">
        <LoadingComponent />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[20px] flex flex-col gap-[12px]">
        <div className="text-[16px] font-[600]">
          {t('pipeline_autopost', 'Pipeline autopost')}
        </div>
        <div className="rounded-[8px] border border-red-500/30 px-[12px] py-[8px] text-[13px] text-red-500">
          {t(
            'failed_to_load_pipeline_autoposts',
            'Failed to load Pipeline RSS feeds.'
          )}
        </div>
        <Button type="button" onClick={() => mutate()}>
          {t('retry', 'Retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="shrink-0 rounded-[12px] border border-newBorder bg-newBgColor overflow-hidden">
      <div className="flex flex-col gap-[10px] border-b border-newBorder px-[20px] py-[14px] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[16px] font-[600]">
            {t('pipeline_autopost', 'Pipeline autopost')}
          </div>
          <div className="text-[12px] text-newTableText mt-[2px]">
            {t(
              'pipeline_autopost_description',
              'Watch RSS feeds and append new items to this Pipeline queue for all configured channels on the next available slot.'
            )}
          </div>
        </div>
      </div>

      <div className="p-[16px] flex flex-col gap-[12px]">
        {feeds.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto,auto,auto] gap-x-[12px] gap-y-[10px] items-center">
            <div className="text-[12px] uppercase opacity-60 hidden md:block">
              {t('title', 'Title')}
            </div>
            <div className="text-[12px] uppercase opacity-60 hidden md:block">
              {t('url', 'URL')}
            </div>
            <div className="text-[12px] uppercase opacity-60 hidden md:block">
              {t('edit', 'Edit')}
            </div>
            <div className="text-[12px] uppercase opacity-60 hidden md:block">
              {t('delete', 'Delete')}
            </div>
            <div className="text-[12px] uppercase opacity-60 hidden md:block">
              {t('active', 'Active')}
            </div>
            {feeds.map((feed) => (
              <Fragment key={feed.id}>
                <div className="text-[14px]">{feed.title}</div>
                <div className="text-[13px] text-newTableText truncate">
                  {feed.url}
                </div>
                <div>
                  <Button type="button" onClick={() => openForm(feed)}>
                    {t('edit', 'Edit')}
                  </Button>
                </div>
                <div>
                  <Button type="button" onClick={confirmDelete(feed)}>
                    {t('delete', 'Delete')}
                  </Button>
                </div>
                <div data-testid={`pipeline-autopost-active-${feed.id}`}>
                  <Slider
                    value={feed.active ? 'on' : 'off'}
                    onChange={changeActive(feed)}
                    fill={true}
                  />
                </div>
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="text-[14px] text-newTableText">
            {t(
              'pipeline_autopost_empty',
              'No RSS feeds yet. Add one to automatically queue new items for this Pipeline.'
            )}
          </div>
        )}

        <Button type="button" onClick={() => openForm()}>
          {t('add_an_autopost', 'Add an autopost')}
        </Button>
      </div>
    </div>
  );
};

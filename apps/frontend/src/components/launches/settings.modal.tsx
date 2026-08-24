'use client';

import React, { FC, useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Slider } from '@gitroom/react/form/slider';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ContextDocumentAssignmentPicker } from '@gitroom/frontend/components/context-documents/context-document.assignment-picker';
import { PipelineContextDocument } from '@gitroom/frontend/components/pipelines/pipeline.types';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useSWRConfig } from 'swr';

export const Element: FC<{
  setting: any;
  onChange: (value: any) => void;
}> = (props) => {
  const { setting, onChange } = props;
  const [value, setValue] = useState(setting.value);
  return (
    <div className="flex flex-col gap-[10px]">
      <div>{setting.title}</div>
      <div className="text-[14px]">{setting.description}</div>
      <Slider
        value={value === true ? 'on' : 'off'}
        onChange={() => {
          setValue(!value);
          onChange(!value);
        }}
        fill={true}
      />
    </div>
  );
};

export const ChannelAdditionalSettingsForm: FC<{
  integration: {
    id: string;
    additionalSettings?: string | null;
  };
  onSaved?: () => void;
}> = (props) => {
  const fetch = useFetch();
  const t = useT();
  const toast = useToaster();
  const { mutate } = useSWRConfig();
  const { onSaved, integration } = props;
  const [values, setValues] = useState(
    JSON.parse(integration?.additionalSettings || '[]')
  );
  const [selectedContextDocumentIds, setSelectedContextDocumentIds] = useState<
    string[]
  >([]);
  const [knownDocuments, setKnownDocuments] = useState<
    PipelineContextDocument[]
  >([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(JSON.parse(integration?.additionalSettings || '[]'));
  }, [integration.id, integration?.additionalSettings]);

  useEffect(() => {
    let cancelled = false;
    setLoadingDocuments(true);
    (async () => {
      try {
        const response = await fetch(
          `/integrations/${integration.id}/context-documents`
        );
        if (!response.ok) {
          throw new Error('Failed to load channel context documents');
        }
        const documents = (await response.json()) as PipelineContextDocument[];
        if (cancelled) {
          return;
        }
        setKnownDocuments(documents);
        setSelectedContextDocumentIds(documents.map((document) => document.id));
      } catch {
        if (!cancelled) {
          toast.show(
            t(
              'channel_context_documents_load_error',
              'Failed to load channel context documents'
            ),
            'warning'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingDocuments(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only reload when the channel changes — toast/t are unstable and would reset selections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetch, integration.id]);

  const changeValue = useCallback(
    (index: number) => (value: any) => {
      const newValues = [...values];
      newValues[index].value = value;
      setValues(newValues);
    },
    [values]
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      if (values.length) {
        const settingsResponse = await fetch(
          `/integrations/${integration.id}/settings`,
          {
            method: 'POST',
            body: JSON.stringify({
              additionalSettings: JSON.stringify(values),
            }),
          }
        );
        if (!settingsResponse.ok) {
          throw new Error('Failed to save channel settings');
        }
      }

      const documentsResponse = await fetch(
        `/integrations/${integration.id}/context-documents`,
        {
          method: 'PUT',
          body: JSON.stringify({
            contextDocumentIds: selectedContextDocumentIds,
          }),
        }
      );
      if (!documentsResponse.ok) {
        throw new Error('Failed to save channel context documents');
      }

      await mutate('/integrations/list');
      toast.show(t('settings_updated', 'Settings Updated'), 'success');
      onSaved?.();
    } catch {
      toast.show(
        t('channel_settings_save_error', 'Failed to save channel settings'),
        'warning'
      );
    } finally {
      setSaving(false);
    }
  }, [
    fetch,
    integration.id,
    mutate,
    onSaved,
    selectedContextDocumentIds,
    t,
    toast,
    values,
  ]);

  return (
    <div className="flex flex-col gap-[16px] border border-newBorder rounded-[8px] p-[16px]">
      {!!values.length && (
        <div className="flex flex-col gap-[16px]">
          {values.map((setting: any, index: number) => (
            <Element
              key={setting.title}
              setting={setting}
              onChange={changeValue(index)}
            />
          ))}
        </div>
      )}

      <div>
        {loadingDocuments ? (
          <div className="text-[13px] opacity-70">
            {t('loading', 'Loading...')}
          </div>
        ) : (
          <ContextDocumentAssignmentPicker
            selectedIds={selectedContextDocumentIds}
            onChange={setSelectedContextDocumentIds}
            knownDocuments={knownDocuments}
            title={t('channel_context_documents', 'Context documents')}
            helpText={t(
              'channel_context_documents_help',
              'Optional Markdown files that describe this channel — who they are, what they believe, and who they want to attract. Lead scoring and the agent can use these documents.'
            )}
            emptyText={t(
              'channel_context_documents_empty',
              'No organization documents yet. Upload Markdown files in the context document library, then attach them here.'
            )}
          />
        )}
      </div>

      <div className="flex gap-[10px]">
        <Button onClick={save} disabled={saving || loadingDocuments}>
          {saving ? t('saving', 'Saving...') : t('save', 'Save')}
        </Button>
      </div>
    </div>
  );
};

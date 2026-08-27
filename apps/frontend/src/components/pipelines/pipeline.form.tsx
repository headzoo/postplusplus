'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import timezones from 'timezones-list';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PickPlatforms } from '@gitroom/frontend/components/launches/helpers/pick.platform.component';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { PipelineDetail } from '@gitroom/frontend/components/pipelines/pipeline.types';
import {
  getReadableForegroundColor,
  PIPELINE_COLOR_PALETTE,
  PIPELINE_DEFAULT_COLOR,
} from '@gitroom/frontend/components/pipelines/pipeline.utils';
import { useCreatePipeline } from '@gitroom/frontend/components/pipelines/use.pipeline.create';
import { useUpdatePipeline } from '@gitroom/frontend/components/pipelines/use.pipeline.update';
import { ContextDocumentAssignmentPicker } from '@gitroom/frontend/components/context-documents/context-document.assignment-picker';

dayjs.extend(timezone);

export const PipelineForm: FC<{
  pipeline?: PipelineDetail;
  onSaved: () => void;
}> = ({ pipeline, onSaved }) => {
  const t = useT();
  const modal = useModals();
  const toaster = useToaster();
  const createPipeline = useCreatePipeline();
  const updatePipeline = useUpdatePipeline();
  const { data: integrations = [], isLoading } = useIntegrationList();

  const [name, setName] = useState(pipeline?.name || '');
  const [timezoneValue, setTimezoneValue] = useState(
    pipeline?.timezone || dayjs.tz.guess()
  );
  const [selectedIntegrations, setSelectedIntegrations] = useState<
    Integrations[]
  >(pipeline?.channels?.map((channel) => ({ ...channel })) || []);
  const [color, setColor] = useState(pipeline?.color || PIPELINE_DEFAULT_COLOR);
  const [selectedContextDocumentIds, setSelectedContextDocumentIds] = useState<
    string[]
  >(
    [
      ...(pipeline?.contextDocuments || []),
      ...(pipeline?.blockedContextDocuments || []),
    ].map((document) => document.id)
  );
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const blockedContextDocumentIds = useMemo(
    () =>
      new Set(
        pipeline?.blockedContextDocuments?.map((document) => document.id)
      ),
    [pipeline?.blockedContextDocuments]
  );

  const enabledIntegrations = useMemo(
    () =>
      integrations.filter((integration: Integrations) => !integration.disabled),
    [integrations]
  );

  const validate = useCallback(() => {
    if (!name.trim()) {
      setFormError('Pipeline name is required.');
      return false;
    }
    if (!timezoneValue) {
      setFormError('Pipeline timezone is required.');
      return false;
    }
    if (!selectedIntegrations.length) {
      setFormError('Select at least one channel for this Pipeline.');
      return false;
    }
    if (
      selectedContextDocumentIds.some((id) => blockedContextDocumentIds.has(id))
    ) {
      setFormError(
        'Deselect blocked agent skill assignments before saving this Pipeline.'
      );
      return false;
    }
    setFormError('');
    return true;
  }, [
    blockedContextDocumentIds,
    name,
    selectedContextDocumentIds,
    selectedIntegrations.length,
    timezoneValue,
  ]);

  const submit = useCallback(async () => {
    if (!validate()) {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        timezone: timezoneValue,
        color,
        integrations: selectedIntegrations.map((integration) => ({
          id: integration.id,
        })),
        contextDocumentIds: selectedContextDocumentIds,
      };
      if (pipeline?.id) {
        await updatePipeline(pipeline.id, payload);
        toaster.show(
          t('pipeline_updated_successfully', 'Pipeline updated successfully'),
          'success'
        );
      } else {
        await createPipeline(payload);
        toaster.show(
          t('pipeline_created_successfully', 'Pipeline created successfully'),
          'success'
        );
      }
      modal.closeAll();
      onSaved();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to save Pipeline.');
      toaster.show(error?.message || 'Failed to save Pipeline.', 'warning');
    } finally {
      setSaving(false);
    }
  }, [
    color,
    createPipeline,
    modal,
    name,
    onSaved,
    pipeline?.id,
    selectedContextDocumentIds,
    selectedIntegrations,
    t,
    timezoneValue,
    toaster,
    updatePipeline,
    validate,
  ]);

  return (
    <div className="flex flex-col gap-[20px]">
      {formError && (
        <div className="text-[13px] text-red-500 border border-red-500/30 rounded-[8px] px-[12px] py-[8px]">
          {formError}
        </div>
      )}
      <Input
        name="name"
        label="Pipeline name"
        translationKey="label_pipeline_name"
        disableForm={true}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Weekly product updates"
      />
      <Select
        name="timezone"
        label="Timezone"
        translationKey="label_pipeline_timezone"
        disableForm={true}
        value={timezoneValue}
        onChange={(event) => setTimezoneValue(event.target.value)}
      >
        {timezones.map((zone) => (
          <option key={zone.tzCode} value={zone.tzCode}>
            {zone.label}
          </option>
        ))}
      </Select>
      <div className="flex flex-col gap-[8px]">
        <div className="text-[14px] font-[600] text-textColor">
          {t('pipeline_color', 'Pipeline color')}
        </div>
        <div className="flex flex-col gap-[10px]">
          <div className="flex flex-wrap justify-center gap-[10px]">
            {PIPELINE_COLOR_PALETTE.slice(0, 5).map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                aria-label={swatch.label}
                aria-pressed={color === swatch.value}
                className="relative flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border-2 border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btnPrimary"
                style={{ backgroundColor: swatch.value }}
                onClick={() => setColor(swatch.value)}
              >
                {color === swatch.value && (
                  <svg
                    viewBox="0 0 12 12"
                    className="h-[14px] w-[14px] drop-shadow"
                    style={{ color: getReadableForegroundColor(swatch.value) }}
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M2 6.5l2.5 2.5L10 3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-[10px]">
            {PIPELINE_COLOR_PALETTE.slice(5, 10).map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                aria-label={swatch.label}
                aria-pressed={color === swatch.value}
                className="relative flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border-2 border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btnPrimary"
                style={{ backgroundColor: swatch.value }}
                onClick={() => setColor(swatch.value)}
              >
                {color === swatch.value && (
                  <svg
                    viewBox="0 0 12 12"
                    className="h-[14px] w-[14px] drop-shadow"
                    style={{ color: getReadableForegroundColor(swatch.value) }}
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M2 6.5l2.5 2.5L10 3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-[10px]">
            {PIPELINE_COLOR_PALETTE.slice(10).map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                aria-label={swatch.label}
                aria-pressed={color === swatch.value}
                className="relative flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border-2 border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btnPrimary"
                style={{ backgroundColor: swatch.value }}
                onClick={() => setColor(swatch.value)}
              >
                {color === swatch.value && (
                  <svg
                    viewBox="0 0 12 12"
                    className="h-[14px] w-[14px] drop-shadow"
                    style={{ color: getReadableForegroundColor(swatch.value) }}
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M2 6.5l2.5 2.5L10 3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-[8px]">
        <div className="text-[14px] font-[600] text-textColor">Channels</div>
        <div className="text-[13px] opacity-70">
          Queued posts use exactly these channels. Changing channels may be
          blocked while items are queued.
        </div>
        {!isLoading && !!enabledIntegrations.length && (
          <PickPlatforms
            integrations={enabledIntegrations}
            selectedIntegrations={selectedIntegrations}
            onChange={(next) => setSelectedIntegrations(next)}
            singleSelect={false}
            toolTip={true}
            isMain={true}
          />
        )}
        {!isLoading && !enabledIntegrations.length && (
          <div className="text-[13px] opacity-70">
            Connect channels before creating a Pipeline.
          </div>
        )}
      </div>
      <ContextDocumentAssignmentPicker
        selectedIds={selectedContextDocumentIds}
        onChange={setSelectedContextDocumentIds}
        knownDocuments={[
          ...(pipeline?.contextDocuments || []),
          ...(pipeline?.blockedContextDocuments || []),
        ]}
      />
      <div className="flex gap-[10px] justify-end sticky bottom-0 bg-newBgColorInner pt-[12px]">
        <Button type="button" secondary onClick={() => modal.closeAll()}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button type="button" onClick={submit} disabled={saving || isLoading}>
          {saving ? t('saving', 'Saving...') : t('save', 'Save')}
        </Button>
      </div>
    </div>
  );
};

'use client';

import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import Spinner from '@gitroom/frontend/components/layout/loading';

export type ImgflipTemplate = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  boxCount: number;
};

export type ImgflipGeneration = {
  url: string;
  pageUrl?: string;
  templateId: string;
  captions: string[];
};

export const captionsMatch = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((text, index) => text === right[index]);

export type MemeSavedMedia = {
  id: string;
  path: string;
};

const MAX_CAPTION_LENGTH = 500;
const TEMPLATES_KEY = 'meme-templates';

export const filterMemeTemplates = (
  templates: ImgflipTemplate[],
  query: string
): ImgflipTemplate[] => {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return templates;
  }
  return templates.filter((template) =>
    template.name.toLowerCase().includes(trimmed)
  );
};

export const useMemeTemplates = (enabled: boolean) => {
  const fetch = useFetch();
  return useSWR<ImgflipTemplate[]>(
    enabled ? TEMPLATES_KEY : null,
    async () => {
      const response = await fetch('/media/memes/templates');
      if (!response.ok) {
        throw new Error('Failed to load meme templates');
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid meme templates response');
      }
      return data;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    }
  );
};

export const MemeGenerator: FC<{
  onSave: (media: MemeSavedMedia) => void;
}> = ({ onSave }) => {
  const t = useT();
  const fetch = useFetch();
  const { closeCurrent } = useModals();
  const { data: templates, error, isLoading } = useMemeTemplates(true);

  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] =
    useState<ImgflipTemplate | null>(null);
  const [captions, setCaptions] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImgflipGeneration | null>(null);
  const [previewLoadError, setPreviewLoadError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const generationEpochRef = useRef(0);

  const invalidateInFlightGeneration = useCallback(() => {
    generationEpochRef.current += 1;
    setPreview(null);
    setPreviewLoadError(false);
    setSaveError(null);
    setGenerating(false);
  }, []);

  const filteredTemplates = useMemo(
    () => filterMemeTemplates(templates || [], search),
    [templates, search]
  );

  const selectTemplate = useCallback(
    (template: ImgflipTemplate) => {
      invalidateInFlightGeneration();
      setSelectedTemplate(template);
      setCaptions(Array.from({ length: template.boxCount }, () => ''));
      setGenerateError(null);
    },
    [invalidateInFlightGeneration]
  );

  useEffect(() => {
    if (!selectedTemplate && filteredTemplates.length > 0) {
      selectTemplate(filteredTemplates[0]);
    }
  }, [filteredTemplates, selectTemplate, selectedTemplate]);

  useEffect(() => {
    if (
      selectedTemplate &&
      filteredTemplates.length > 0 &&
      !filteredTemplates.some((template) => template.id === selectedTemplate.id)
    ) {
      selectTemplate(filteredTemplates[0]);
    }
  }, [filteredTemplates, selectTemplate, selectedTemplate]);

  const updateCaption = useCallback(
    (index: number, value: string) => {
      invalidateInFlightGeneration();
      setCaptions((prev) => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
    },
    [invalidateInFlightGeneration]
  );

  const generateMeme = useCallback(async () => {
    if (!selectedTemplate || generating || saving) {
      return;
    }
    const requestEpoch = generationEpochRef.current;
    const requestTemplateId = selectedTemplate.id;
    const requestCaptions = [...captions];
    setGenerating(true);
    setGenerateError(null);
    setSaveError(null);
    setPreviewLoadError(false);
    try {
      const response = await fetch('/media/memes/generate', {
        method: 'POST',
        body: JSON.stringify({
          templateId: requestTemplateId,
          captions: requestCaptions.map((text) => ({ text })),
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to generate meme');
      }
      const data = await response.json();
      if (!data?.url || typeof data.url !== 'string') {
        throw new Error('Invalid meme generation response');
      }
      if (
        requestEpoch !== generationEpochRef.current ||
        selectedTemplate?.id !== requestTemplateId ||
        !captionsMatch(captions, requestCaptions)
      ) {
        return;
      }
      setPreview({
        url: data.url,
        pageUrl: typeof data.pageUrl === 'string' ? data.pageUrl : undefined,
        templateId: requestTemplateId,
        captions: requestCaptions,
      });
    } catch {
      if (requestEpoch !== generationEpochRef.current) {
        return;
      }
      setGenerateError(
        t(
          'failed_to_generate_meme',
          'Failed to generate meme. Please try again.'
        )
      );
    } finally {
      setGenerating(false);
    }
  }, [captions, fetch, generating, saving, selectedTemplate, t]);

  const previewMatchesCurrentInputs =
    !!preview &&
    !!selectedTemplate &&
    preview.templateId === selectedTemplate.id &&
    captionsMatch(captions, preview.captions);

  const saveMeme = useCallback(async () => {
    if (!previewMatchesCurrentInputs || !preview?.url || saving || generating) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch('/media/memes/save', {
        method: 'POST',
        body: JSON.stringify({
          templateId: preview.templateId,
          url: preview.url,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to save meme');
      }
      const saved = await response.json();
      if (!saved?.id || !saved?.path) {
        throw new Error('Invalid meme save response');
      }
      onSave({ id: saved.id, path: saved.path });
      closeCurrent();
    } catch {
      setSaveError(
        t('failed_to_save_meme', 'Failed to save meme. Please try again.')
      );
    } finally {
      setSaving(false);
    }
  }, [
    closeCurrent,
    fetch,
    generating,
    onSave,
    preview,
    previewMatchesCurrentInputs,
    saving,
    t,
  ]);

  const canSave =
    previewMatchesCurrentInputs &&
    !!preview?.url &&
    !previewLoadError &&
    !generating;

  return (
    <div className="flex flex-col gap-[16px] w-full min-w-0">
      <div className="flex flex-col lg:flex-row gap-[16px] min-h-[420px]">
        <div className="flex flex-col gap-[10px] lg:w-[45%] min-w-0">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search_meme_templates', 'Search templates')}
            aria-label={t('search_meme_templates', 'Search templates')}
            className="w-full h-[38px] rounded-[8px] bg-newColColor px-[12px] text-[13px] outline-none border border-newBorder"
          />
          <div className="flex-1 min-h-[280px] max-h-[360px] overflow-y-auto rounded-[8px] border border-newBorder bg-newBgColor p-[8px] scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner">
            {isLoading && (
              <div className="h-full flex items-center justify-center">
                <Spinner width={24} height={24} />
              </div>
            )}
            {!isLoading && error && (
              <div className="h-full flex items-center justify-center text-[13px] text-center px-[12px] opacity-80">
                {t(
                  'failed_to_load_meme_templates',
                  'Failed to load meme templates'
                )}
              </div>
            )}
            {!isLoading && !error && filteredTemplates.length === 0 && (
              <div className="h-full flex items-center justify-center text-[13px] opacity-70">
                {t('no_meme_templates_found', 'No templates found')}
              </div>
            )}
            {!isLoading && !error && filteredTemplates.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-[8px]">
                {filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    aria-label={template.name}
                    onClick={() => selectTemplate(template)}
                    aria-pressed={selectedTemplate?.id === template.id}
                    className={clsx(
                      'flex flex-col gap-[6px] rounded-[8px] overflow-hidden border text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-newColColor',
                      selectedTemplate?.id === template.id
                        ? 'border-newColColor bg-newBgColorInner'
                        : 'border-newBorder bg-newBgColorInner/60 hover:border-newColColor'
                    )}
                  >
                    <div className="aspect-square bg-newSep overflow-hidden">
                      <img
                        src={template.url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="px-[6px] pb-[6px] text-[11px] line-clamp-2">
                      {template.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-[12px] lg:flex-1 min-w-0">
          {selectedTemplate ? (
            <>
              <div className="text-[14px] font-[600] truncate">
                {selectedTemplate.name}
              </div>
              <div className="flex flex-col gap-[8px]">
                {captions.map((caption, index) => {
                  const label = `${t('meme_text', 'Text')} ${index + 1}`;
                  const inputId = `meme-caption-${index}`;
                  return (
                    <label
                      key={`caption-${index}`}
                      htmlFor={inputId}
                      className="flex flex-col gap-[4px] text-[12px]"
                    >
                      <span>{label}</span>
                      <textarea
                        id={inputId}
                        value={caption}
                        maxLength={MAX_CAPTION_LENGTH}
                        rows={2}
                        onChange={(event) =>
                          updateCaption(index, event.target.value)
                        }
                        className="w-full rounded-[8px] bg-newColColor px-[10px] py-[8px] text-[13px] outline-none border border-newBorder resize-y min-h-[44px]"
                      />
                    </label>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-[8px]">
                <button
                  type="button"
                  disabled={generating || saving}
                  onClick={generateMeme}
                  className="bg-btnPrimary text-white px-[16px] h-[40px] rounded-[8px] text-[13px] font-[600] disabled:opacity-50"
                >
                  {generating
                    ? t('generating_meme', 'Generating…')
                    : t('generate_meme', 'Generate meme')}
                </button>
                <button
                  type="button"
                  disabled={!canSave || saving}
                  onClick={saveMeme}
                  className="bg-btnSimple px-[16px] h-[40px] rounded-[8px] text-[13px] font-[600] disabled:opacity-50"
                >
                  {saving
                    ? t('saving_meme', 'Saving…')
                    : t('save_meme_to_media', 'Save to media')}
                </button>
              </div>
              {generateError && (
                <p className="text-[12px] text-red-400" role="alert">
                  {generateError}
                </p>
              )}
              {saveError && (
                <p className="text-[12px] text-red-400" role="alert">
                  {saveError}
                </p>
              )}
              <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[10px] min-h-[180px] flex items-center justify-center">
                {!preview && !generating && (
                  <p className="text-[12px] opacity-60 text-center px-[12px]">
                    {t(
                      'meme_preview_placeholder',
                      'Generate a preview to see your meme here'
                    )}
                  </p>
                )}
                {generating && <Spinner width={28} height={28} />}
                {preview && !generating && !previewLoadError && (
                  <img
                    src={preview.url}
                    alt={
                      selectedTemplate
                        ? `${t('meme_preview', 'Preview of')} ${
                            selectedTemplate.name
                          }`
                        : t('meme_preview_image', 'Meme preview')
                    }
                    className="max-w-full max-h-[280px] object-contain rounded-[6px]"
                    onError={() => setPreviewLoadError(true)}
                  />
                )}
                {preview && previewLoadError && (
                  <p className="text-[12px] text-red-400 text-center px-[12px]">
                    {t(
                      'meme_preview_load_failed',
                      'Preview image failed to load. Try generating again.'
                    )}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[13px] opacity-70">
              {t('select_meme_template', 'Select a template to get started')}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-newBorder pt-[12px] flex flex-col gap-[6px] text-[11px] opacity-80">
        <p>
          {t(
            'imgflip_watermark_note',
            'Free API output includes an Imgflip watermark on generated images.'
          )}
        </p>
        <div className="flex flex-wrap gap-x-[12px] gap-y-[4px]">
          <a
            href="https://imgflip.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-100 underline"
          >
            Powered by Imgflip
          </a>
          <a
            href="https://imgflip.com/api"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-100 underline"
          >
            {t('imgflip_api_terms', 'Imgflip API terms')}
          </a>
        </div>
      </div>
    </div>
  );
};

export const MemeComposerButton: FC<{
  appendImages?: (value: MemeSavedMedia[]) => void;
  mediaNotAvailable?: boolean;
  onOpen?: () => void;
}> = ({ appendImages, mediaNotAvailable, onOpen }) => {
  const t = useT();
  const modals = useModals();
  const { imgflipEnabled } = useVariables();

  const openMemeGenerator = useCallback(() => {
    if (!appendImages) {
      return;
    }
    onOpen?.();
    modals.openModal({
      title: t('meme_generator', 'Meme Generator'),
      size: '900px',
      maxSize: '95vw',
      children: <MemeGenerator onSave={(media) => appendImages([media])} />,
    });
  }, [appendImages, modals, onOpen, t]);

  if (!imgflipEnabled || !appendImages || mediaNotAvailable) {
    return null;
  }

  return (
    <button
      type="button"
      data-tooltip-id="tooltip"
      data-tooltip-content={t('create_meme', 'Create meme')}
      aria-label={t('create_meme', 'Create meme')}
      onClick={openMemeGenerator}
      className="select-none cursor-pointer rounded-[6px] h-[30px] px-[10px] bg-newColColor flex justify-center items-center text-[12px] font-[600]"
    >
      Meme
    </button>
  );
};

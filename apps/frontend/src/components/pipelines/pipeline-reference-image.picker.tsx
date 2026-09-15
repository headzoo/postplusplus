'use client';

import { FC, useCallback } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { MediaBox } from '@gitroom/frontend/components/media/media.component';
import { CloseCircleIcon } from '@gitroom/frontend/components/ui/icons';
import { PipelineReferenceImage } from '@gitroom/frontend/components/pipelines/pipeline.types';

export const PIPELINE_REFERENCE_IMAGE_LIMIT = 3;

const getReferenceImageSrc = (
  image: PipelineReferenceImage,
  mediaDirectory: ReturnType<typeof useMediaDirectory>
) => mediaDirectory.set(image.thumbnail || image.path);

export const PipelineReferenceImagePicker: FC<{
  selectedImages: PipelineReferenceImage[];
  onChange: (images: PipelineReferenceImage[]) => void;
}> = ({ selectedImages, onChange }) => {
  const t = useT();
  const modal = useModals();
  const mediaDirectory = useMediaDirectory();
  const remainingCapacity =
    PIPELINE_REFERENCE_IMAGE_LIMIT - selectedImages.length;

  const openMediaLibrary = useCallback(() => {
    if (remainingCapacity <= 0) {
      return;
    }

    modal.openModal({
      title: t('pipeline_reference_images', 'Reference images'),
      askClose: false,
      closeOnEscape: true,
      fullScreen: true,
      size: 'calc(100% - 80px)',
      height: 'calc(100% - 80px)',
      children: (close) => (
        <MediaBox
          closeModal={close}
          type="image"
          maxSelection={remainingCapacity}
          setMedia={(items) => {
            const existingIds = new Set(
              selectedImages.map((image) => image.id)
            );
            const additions = items
              .filter((item) => !existingIds.has(item.id))
              .map(
                (item): PipelineReferenceImage => ({
                  id: item.id,
                  name: item.path.split('/').pop() || item.id,
                  path: item.path,
                })
              );
            onChange(
              [...selectedImages, ...additions].slice(
                0,
                PIPELINE_REFERENCE_IMAGE_LIMIT
              )
            );
          }}
        />
      ),
    });
  }, [modal, onChange, remainingCapacity, selectedImages, t]);

  const removeImage = useCallback(
    (id: string) => {
      onChange(selectedImages.filter((image) => image.id !== id));
    },
    [onChange, selectedImages]
  );

  const clearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex flex-col gap-[4px]">
        <div className="text-[14px] font-[600] text-textColor">
          {t('pipeline_reference_images', 'Reference images')}
        </div>
        <div className="text-[13px] opacity-70">
          {t(
            'pipeline_reference_images_help',
            'Optional images from your media library. When the agent generates images for this Pipeline, these references guide style and branding unless you ask for something off brand.'
          )}
        </div>
      </div>

      <div className="flex items-center gap-[10px] flex-wrap">
        <div className="text-[13px] opacity-70">
          {t('selected', 'Selected')}: {selectedImages.length} /{' '}
          {PIPELINE_REFERENCE_IMAGE_LIMIT}
        </div>
        {selectedImages.length > 0 && (
          <Button type="button" secondary onClick={clearAll}>
            {t('clear_all', 'Clear all')}
          </Button>
        )}
        <Link
          href="/media"
          className="text-[13px] text-btnPrimary hover:underline"
        >
          {t('manage_media_library', 'Manage media library')}
        </Link>
      </div>

      {selectedImages.length > 0 && (
        <div className="flex flex-wrap gap-[10px]">
          {selectedImages.map((image) => (
            <div
              key={image.id}
              className="relative w-[88px] h-[88px] rounded-[8px] border border-newBorder overflow-hidden bg-newBgColor"
            >
              <img
                src={getReferenceImageSrc(image, mediaDirectory)}
                alt={image.alt || image.originalName || image.name}
                className="w-full h-full object-cover"
              />
              <CloseCircleIcon
                onClick={() => removeImage(image.id)}
                className="absolute -end-[4px] -top-[4px] z-[20] rounded-full bg-white cursor-pointer"
              />
              <div
                className="absolute inset-x-0 bottom-0 bg-black/60 px-[6px] py-[4px] text-[10px] text-white truncate"
                title={image.originalName || image.name}
              >
                {image.originalName || image.name}
              </div>
            </div>
          ))}
        </div>
      )}

      {remainingCapacity > 0 ? (
        <Button type="button" secondary onClick={openMediaLibrary}>
          {selectedImages.length === 0
            ? t('add_reference_images', 'Add reference images')
            : t('add_more_reference_images', 'Add more reference images')}
        </Button>
      ) : (
        <div className="text-[13px] text-newTableText">
          {t(
            'pipeline_reference_images_limit_reached',
            'Maximum of three reference images reached. Remove one to replace it.'
          )}
        </div>
      )}
    </div>
  );
};

export const PipelineReferenceImagesPanel: FC<{
  images?: PipelineReferenceImage[];
  onEdit?: () => void;
  compact?: boolean;
}> = ({ images = [], onEdit, compact = false }) => {
  const t = useT();
  const mediaDirectory = useMediaDirectory();

  if (!images.length) {
    if (compact) {
      return null;
    }

    return (
      <div className="shrink-0 rounded-[12px] border border-newBorder bg-newBgColor overflow-hidden">
        <div className="flex flex-col gap-[10px] border-b border-newBorder px-[20px] py-[14px] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[16px] font-[600]">
              {t('pipeline_reference_images', 'Reference images')}
            </div>
            <div className="text-[12px] text-newTableText mt-[2px]">
              {t(
                'pipeline_no_reference_images',
                'No reference images attached. Edit the Pipeline to add up to three images from your media library for agent image generation.'
              )}
            </div>
          </div>
          {onEdit && <Button onClick={onEdit}>{t('edit', 'Edit')}</Button>}
        </div>
        <div className="p-[16px]">
          <Link
            href="/media"
            className="text-[13px] text-btnPrimary hover:underline w-fit"
          >
            {t('open_media_library', 'Open media library')}
          </Link>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className="flex items-center gap-[4px]"
        aria-label={t('pipeline_reference_images', 'Reference images')}
      >
        {images.map((image) => (
          <img
            key={image.id}
            src={getReferenceImageSrc(image, mediaDirectory)}
            alt={image.alt || image.originalName || image.name}
            title={image.originalName || image.name}
            className="w-[28px] h-[28px] rounded-[6px] border border-newBorder object-cover shrink-0"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="shrink-0 rounded-[12px] border border-newBorder bg-newBgColor overflow-hidden">
      <div className="flex flex-col gap-[10px] border-b border-newBorder px-[20px] py-[14px] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[16px] font-[600]">
            {t('pipeline_reference_images', 'Reference images')}
          </div>
          <div className="text-[12px] text-newTableText mt-[2px]">
            {t('pipeline_reference_images_count', '{count} attached', {
              count: images.length,
            })}
          </div>
        </div>
        {onEdit && <Button onClick={onEdit}>{t('edit', 'Edit')}</Button>}
      </div>
      <div className="p-[16px] flex flex-wrap gap-[12px]">
        {images.map((image) => (
          <div
            key={image.id}
            className={clsx(
              'rounded-[8px] border border-newBorder bg-newBgColorInner overflow-hidden',
              'w-[120px] flex flex-col'
            )}
          >
            <img
              src={getReferenceImageSrc(image, mediaDirectory)}
              alt={image.alt || image.originalName || image.name}
              className="w-full h-[90px] object-cover"
            />
            <div className="px-[8px] py-[6px] text-[12px] font-[600] truncate">
              {image.originalName || image.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

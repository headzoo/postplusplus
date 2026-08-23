'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { Button } from '@gitroom/react/form/button';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  formatContextDocumentSize,
  getContextDocumentSkillSlug,
} from '@gitroom/frontend/components/context-documents/context-document.types';
import { useContextDocumentList } from '@gitroom/frontend/components/context-documents/use.context-document.list';
import { PipelineContextDocument } from '@gitroom/frontend/components/pipelines/pipeline.types';

type AssignmentRow = {
  id: string;
  name: string;
  fileSize: number;
  updatedAt: string;
  isLarge?: boolean;
  stale?: boolean;
  skill?: boolean;
};

export const ContextDocumentAssignmentPicker: FC<{
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  knownDocuments?: PipelineContextDocument[];
  title?: string;
  helpText?: string;
  emptyText?: string;
}> = ({
  selectedIds,
  onChange,
  knownDocuments = [],
  title,
  helpText,
  emptyText,
}) => {
    const t = useT();
    const { data: library = [], error, isLoading } = useContextDocumentList();
    const [search, setSearch] = useState('');
    const pipelineDocuments = useMemo(
      () => library.filter((document) => !getContextDocumentSkillSlug(document.name)),
      [library]
    );

    const rows = useMemo(() => {
      const libraryById = new Map(library.map((document) => [document.id, document]));
      const knownById = new Map(knownDocuments.map((document) => [document.id, document]));
      const ids = new Set([
        ...library.map((document) => document.id),
        ...selectedIds,
      ]);

      return [...ids]
        .map((id): AssignmentRow | null => {
          const fromLibrary = libraryById.get(id);
          if (fromLibrary) {
            const skill = getContextDocumentSkillSlug(fromLibrary.name);
            if (skill && !selectedIds.includes(id)) {
              return null;
            }
            return {
              id: fromLibrary.id,
              name: fromLibrary.name,
              fileSize: fromLibrary.fileSize,
              updatedAt: fromLibrary.updatedAt,
              isLarge: fromLibrary.isLarge,
              stale: Boolean(skill),
              skill: Boolean(skill),
            };
          }

          const known = knownById.get(id);
          if (known && selectedIds.includes(id)) {
            return {
              id: known.id,
              name: known.name,
              fileSize: known.fileSize,
              updatedAt: known.updatedAt,
              stale: true,
              skill: Boolean(getContextDocumentSkillSlug(known.name)),
            };
          }

          if (selectedIds.includes(id)) {
            return {
              id,
              name: t('context_document_unavailable', 'Unavailable document'),
              fileSize: 0,
              updatedAt: '',
              stale: true,
            };
          }

          return null;
        })
        .filter((row): row is AssignmentRow => row !== null)
        .sort((left, right) => left.name.localeCompare(right.name));
    }, [knownDocuments, library, selectedIds, t]);

    const filteredRows = useMemo(() => {
      const query = search.trim().toLowerCase();
      if (!query) {
        return rows;
      }
      return rows.filter((row) => row.name.toLowerCase().includes(query));
    }, [rows, search]);

    const toggle = useCallback(
      (id: string) => {
        if (selectedIds.includes(id)) {
          onChange(selectedIds.filter((value) => value !== id));
          return;
        }
        onChange([...selectedIds, id]);
      },
      [onChange, selectedIds]
    );

    const clearAll = useCallback(() => {
      onChange([]);
    }, [onChange]);

    if (isLoading) {
      return (
        <div className="flex justify-center py-[16px]">
          <LoadingComponent height={40} width={40} />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-[10px]">
        <div className="flex flex-col gap-[4px]">
          <div className="text-[14px] font-[600] text-textColor">
            {title || t('pipeline_context_documents', 'Context documents')}
          </div>
          <div className="text-[13px] opacity-70">
            {helpText ||
              t(
                'pipeline_context_documents_help',
                'Optional Markdown files the agent can read when drafting posts for this Pipeline. Assignments reference your organization library — content is not copied.'
              )}
          </div>
        </div>

        {error && (
          <div className="rounded-[8px] border border-red-500/30 px-[12px] py-[8px] text-[13px] text-red-500">
            {t(
              'context_documents_load_error',
              'Failed to load context documents. Please refresh and try again.'
            )}
          </div>
        )}

        <div className="flex items-center gap-[10px] flex-wrap">
          <div className="text-[13px] opacity-70">
            {t('selected', 'Selected')}: {selectedIds.length}
          </div>
          {selectedIds.length > 0 && (
            <Button type="button" secondary onClick={clearAll}>
              {t('clear_all', 'Clear all')}
            </Button>
          )}
          <Link
            href="/context"
            className="text-[13px] text-btnPrimary hover:underline"
          >
            {t('manage_context_documents', 'Manage library')}
          </Link>
        </div>

        {!pipelineDocuments.length && !selectedIds.length ? (
          <div className="rounded-[8px] border border-newBorder bg-newBgColor px-[14px] py-[12px] text-[13px] opacity-80">
            {emptyText ||
              t(
                'pipeline_context_documents_empty',
                'No organization documents yet. Upload Markdown files in the context document library, then attach them here.'
              )}{' '}
            <Link href="/context" className="text-btnPrimary hover:underline">
              {t('open_context_documents', 'Open context documents')}
            </Link>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t(
                'search_context_documents',
                'Search documents by name'
              )}
              className="w-full h-[40px] px-[12px] rounded-[8px] bg-newBgColorInner border border-newColColor text-[14px] outline-none focus:border-[#eb3825]"
            />
            <div className="flex flex-col gap-[8px] max-h-[220px] overflow-y-auto pe-[2px]">
              {!filteredRows.length ? (
                <div className="text-[13px] opacity-70 px-[4px] py-[8px]">
                  {t('no_matching_documents', 'No documents match your search.')}
                </div>
              ) : (
                filteredRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={clsx(
                      'flex items-start gap-[10px] rounded-[8px] border px-[12px] py-[10px] text-left transition-colors',
                      selectedIds.includes(row.id)
                        ? 'border-btnPrimary/40 bg-btnPrimary/5'
                        : 'border-newBorder bg-newBgColor hover:border-newColColor',
                      row.stale && 'border-amber-500/40'
                    )}
                    onClick={() => toggle(row.id)}
                  >
                    <div className="pt-[2px]" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        disableForm
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </div>
                    <div className="flex flex-col gap-[4px] min-w-0 flex-1">
                      <div className="flex items-center gap-[8px] flex-wrap">
                        <span className="text-[14px] font-[600] truncate">{row.name}</span>
                        {row.isLarge && (
                          <span className="text-[11px] px-[6px] py-[1px] rounded-full border border-amber-500/40 text-amber-500">
                            {t('context_document_large_badge', 'Large')}
                          </span>
                        )}
                        {row.stale && (
                          <span className="text-[11px] px-[6px] py-[1px] rounded-full border border-amber-500/40 text-amber-500">
                            {row.skill
                              ? t('agent_skill_badge', 'Skill')
                              : t('context_document_stale_badge', 'Unavailable')}
                          </span>
                        )}
                      </div>
                      {!row.stale && (
                        <div className="text-[12px] opacity-70 flex flex-wrap gap-x-[10px] gap-y-[2px]">
                          <span>
                            {t('size', 'Size')}: {formatContextDocumentSize(row.fileSize)}
                          </span>
                          <span>
                            {t('updated', 'Updated')}:{' '}
                            {dayjs(row.updatedAt).format('MMM D, YYYY')}
                          </span>
                        </div>
                      )}
                      {row.stale && (
                        <div className="text-[12px] text-amber-500">
                          {t(
                            row.skill
                              ? 'context_document_skill_stale_hint'
                              : 'context_document_stale_hint',
                            row.skill
                              ? 'Skills cannot be attached to Pipelines. Deselect this skill before saving.'
                              : 'This document was removed from the library. Deselect it before saving.'
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    );
  };

export const PipelineContextDocumentsPanel: FC<{
  documents?: PipelineContextDocument[];
  onEdit?: () => void;
  compact?: boolean;
}> = ({ documents = [], onEdit, compact = false }) => {
  const t = useT();

  if (!documents.length) {
    if (compact) {
      return null;
    }

    return (
      <div className="rounded-[12px] border border-newBorder bg-newBgColor overflow-hidden">
        <div className="flex flex-col gap-[10px] border-b border-newBorder px-[20px] py-[14px] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[16px] font-[600]">
              {t('context_documents', 'Context documents')}
            </div>
            <div className="text-[12px] text-newTableText mt-[2px]">
              {t(
                'pipeline_no_context_documents',
                'No context documents attached. Edit the Pipeline to attach Markdown guidance for the agent.'
              )}
            </div>
          </div>
          {onEdit && <Button onClick={onEdit}>{t('edit', 'Edit')}</Button>}
        </div>
        <div className="p-[16px]">
          <Link href="/context" className="text-[13px] text-btnPrimary hover:underline w-fit">
            {t('open_context_documents', 'Open context documents')}
          </Link>
        </div>
      </div>
    );
  }

  if (compact) {
    const visible = documents.slice(0, 3);
    const overflow = documents.length - visible.length;

    return (
      <div className="flex flex-wrap items-center gap-[6px]">
        {visible.map((document) => (
          <span
            key={document.id}
            className="inline-flex max-w-[180px] truncate text-[11px] px-[7px] py-[2px] rounded-full border border-btnPrimary/40 text-btnPrimary"
            title={document.name}
          >
            {document.name}
          </span>
        ))}
        {overflow > 0 && (
          <span className="text-[11px] px-[7px] py-[2px] rounded-full border border-newBorder bg-newBgColorInner text-textItemBlur">
            +{overflow}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-newBorder bg-newBgColor overflow-hidden">
      <div className="flex flex-col gap-[10px] border-b border-newBorder px-[20px] py-[14px] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[16px] font-[600]">
            {t('context_documents', 'Context documents')}
          </div>
          <div className="text-[12px] text-newTableText mt-[2px]">
            {t('pipeline_context_documents_count', '{count} attached', {
              count: documents.length,
            })}
          </div>
        </div>
        {onEdit && <Button onClick={onEdit}>{t('edit', 'Edit')}</Button>}
      </div>
      <div className="p-[16px] flex flex-col gap-[8px]">
        {documents.map((document) => (
          <div
            key={document.id}
            className="rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] py-[10px] flex flex-col gap-[4px]"
          >
            <div className="text-[14px] font-[600] truncate">{document.name}</div>
            <div className="text-[12px] opacity-70 flex flex-wrap gap-x-[10px] gap-y-[2px]">
              <span>
                {t('size', 'Size')}: {formatContextDocumentSize(document.fileSize)}
              </span>
              <span>
                {t('updated', 'Updated')}:{' '}
                {dayjs(document.updatedAt).format('MMM D, YYYY · h:mm A')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

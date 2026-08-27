'use client';

import {
  ChangeEvent,
  ComponentPropsWithoutRef,
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useClickOutside } from '@mantine/hooks';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import Loading, {
  LoadingComponent,
} from '@gitroom/frontend/components/layout/loading';
import {
  useDecisionModal,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import {
  CONTEXT_DOCUMENT_LARGE_WARNING_BYTES,
  CONTEXT_DOCUMENT_MAX_BYTES,
  ContextDocumentMetadata,
  formatContextDocumentSize,
  getContextDocumentSkillSlug,
  isAttemptedContextDocumentSkillFilename,
  isContextDocumentLarge,
  normalizeContextDocumentName,
  RESERVED_AGENT_COMMAND_SLUGS,
} from '@gitroom/frontend/components/context-documents/context-document.types';
import { useContextDocumentList } from '@gitroom/frontend/components/context-documents/use.context-document.list';
import { useContextDocumentContent } from '@gitroom/frontend/components/context-documents/use.context-document.content';
import { useContextDocumentUpload } from '@gitroom/frontend/components/context-documents/use.context-document.upload';
import { useContextDocumentDelete } from '@gitroom/frontend/components/context-documents/use.context-document.delete';
import { useContextDocumentCreate } from '@gitroom/frontend/components/context-documents/use.context-document.create';
import { useContextDocumentUpdate } from '@gitroom/frontend/components/context-documents/use.context-document.update';
import { useContextDocumentRename } from '@gitroom/frontend/components/context-documents/use.context-document.rename';
import { PlusIcon } from '@gitroom/frontend/components/ui/icons';

const isExternalMarkdownLink = (href: string) => {
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const documentPreviewHeading = (Tag: 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => {
  const Component = ({
    children,
    ...props
  }: ComponentPropsWithoutRef<typeof Tag>) => (
    <Tag
      {...props}
      className="mb-3 mt-6 scroll-mt-4 text-lg font-semibold text-textColor first:mt-0"
    >
      {children}
    </Tag>
  );

  return Component;
};

const validateDocumentFilename = (
  rawName: string,
  t: (key: string, fallback: string) => string
): { name?: string; error?: string } => {
  const normalizedName = normalizeContextDocumentName(rawName);

  if (!normalizedName) {
    return {
      error: t(
        'context_document_invalid_extension',
        'Only .md and .markdown files are supported.'
      ),
    };
  }

  const skillSlug = getContextDocumentSkillSlug(normalizedName);
  if (isAttemptedContextDocumentSkillFilename(normalizedName) && !skillSlug) {
    return {
      error: t(
        'context_document_invalid_skill_name',
        'Agent skill filenames must use the format {slug}.skill.md, with lowercase letters, numbers, and hyphens in the slug.'
      ),
    };
  }

  if (skillSlug && RESERVED_AGENT_COMMAND_SLUGS.has(skillSlug)) {
    return {
      error: t(
        'context_document_reserved_skill',
        `Agent skill command /${skillSlug} is reserved and cannot be used.`
      ),
    };
  }

  return { name: normalizedName };
};

const ContextDocumentEditor: FC<{
  documentId: string;
  documentName: string;
  skillSlug?: string;
  onSaved?: () => void;
}> = ({ documentId, documentName, skillSlug, onSaved }) => {
  const t = useT();
  const toaster = useToaster();
  const modal = useModals();
  const decision = useDecisionModal();
  const updateDocument = useContextDocumentUpdate();
  const { data, error, isLoading } = useContextDocumentContent(
    documentId,
    skillSlug
  );
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (data && !initialized) {
      setContent(data.content);
      setDescription(data.description ?? '');
      setInitialized(true);
    }
  }, [data, initialized]);

  const dirty =
    initialized &&
    (content !== (data?.content ?? '') ||
      description !== (data?.description ?? ''));
  const byteLength = useMemo(() => {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(content).length;
    }
    return Buffer.byteLength(content, 'utf8');
  }, [content]);

  const handleSave = useCallback(async () => {
    if (byteLength > CONTEXT_DOCUMENT_MAX_BYTES) {
      toaster.show(
        t(
          'context_document_oversize',
          'This file exceeds the 256 KiB limit and cannot be uploaded.'
        ),
        'warning'
      );
      return;
    }

    if (isContextDocumentLarge(byteLength)) {
      const approved = await decision.open({
        title: t('context_document_large_title', 'Large document warning'),
        description: t(
          'context_document_large_description',
          `"${documentName}" is ${formatContextDocumentSize(
            byteLength
          )} (${byteLength.toLocaleString()} bytes). Documents at or above ${formatContextDocumentSize(
            CONTEXT_DOCUMENT_LARGE_WARNING_BYTES
          )} may be too large for reliable agent use. Consider splitting it into smaller files.`
        ),
        approveLabel: t('context_document_save_anyway', 'Save anyway'),
        cancelLabel: t('cancel', 'Cancel'),
      });

      if (!approved) {
        return;
      }
    }

    setSaving(true);
    try {
      const updated = await updateDocument(documentId, content, {
        documentName,
        ...(skillSlug ? {} : { description }),
      });
      toaster.show(
        t('context_document_saved_success', 'Document saved successfully.'),
        'success'
      );
      if (updated.warning) {
        toaster.show(updated.warning, 'warning');
      }
      onSaved?.();
      modal.closeAll();
    } catch (err: any) {
      toaster.show(
        err?.message ||
          t(
            'context_document_save_error',
            'Failed to save document. Please try again.'
          ),
        'warning'
      );
    } finally {
      setSaving(false);
    }
  }, [
    byteLength,
    content,
    decision,
    description,
    documentId,
    documentName,
    modal,
    onSaved,
    skillSlug,
    t,
    toaster,
    updateDocument,
  ]);

  const handleCancel = useCallback(async () => {
    if (dirty) {
      const approved = await decision.open({
        title: t('context_document_discard_title', 'Discard changes?'),
        description: t(
          'context_document_discard_description',
          'You have unsaved changes. Are you sure you want to close without saving?'
        ),
        approveLabel: t('context_document_discard_confirm', 'Discard'),
        cancelLabel: t('cancel', 'Cancel'),
      });
      if (!approved) {
        return;
      }
    }
    modal.closeAll();
  }, [decision, dirty, modal, t]);

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-[40px]">
        <Loading width={40} height={40} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-[14px] text-red-500">
        {t(
          'context_document_read_error',
          'Failed to load this document. Please try again.'
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[12px] h-full min-h-0">
      {!skillSlug && (
        <div className="flex flex-col gap-[6px] shrink-0">
          <label
            htmlFor="context-document-description"
            className="text-[13px] font-[600]"
          >
            {t('context_document_description_label', 'Description')}
          </label>
          <textarea
            id="context-document-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            rows={3}
            spellCheck
            placeholder={t(
              'context_document_description_placeholder',
              'What is this document for? Agents use this to decide when to read it.'
            )}
            className="w-full bg-input border border-tableBorder rounded-[8px] p-[12px] text-[14px] text-newTextColor outline-none resize-y focus:border-[#eb3825]"
            aria-label={t('context_document_description_label', 'Description')}
          />
          <div className="text-[12px] opacity-60">
            {t(
              'context_document_description_hint',
              'Optional. Up to 500 characters. Helps agents discover this document.'
            )}
          </div>
        </div>
      )}
      {previewing ? (
        <div
          className="w-full flex-1 min-h-0 h-0 overflow-auto bg-input border border-tableBorder rounded-[8px] p-[12px] text-newTextColor"
          aria-label={t('context_document_preview', 'Document preview')}
        >
          <article className="break-words text-base leading-7 text-textColor">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children, ...props }) => (
                  <h1
                    {...props}
                    className="mb-4 text-2xl font-bold text-textColor"
                  >
                    {children}
                  </h1>
                ),
                h2: documentPreviewHeading('h2'),
                h3: documentPreviewHeading('h3'),
                h4: documentPreviewHeading('h4'),
                h5: documentPreviewHeading('h5'),
                h6: documentPreviewHeading('h6'),
                p: ({ children, ...props }) => (
                  <p {...props} className="mb-4">
                    {children}
                  </p>
                ),
                ul: ({ children, ...props }) => (
                  <ul {...props} className="mb-4 list-disc space-y-1 pl-5">
                    {children}
                  </ul>
                ),
                ol: ({ children, ...props }) => (
                  <ol {...props} className="mb-4 list-decimal space-y-1 pl-5">
                    {children}
                  </ol>
                ),
                table: ({ children, ...props }) => (
                  <div className="mb-4 overflow-x-auto">
                    <table
                      {...props}
                      className="w-full border-collapse text-left"
                    >
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children, ...props }) => (
                  <th
                    {...props}
                    className="border border-newTableBorder p-2 font-semibold"
                  >
                    {children}
                  </th>
                ),
                td: ({ children, ...props }) => (
                  <td
                    {...props}
                    className="border border-newTableBorder p-2 align-top"
                  >
                    {children}
                  </td>
                ),
                blockquote: ({ children, ...props }) => (
                  <blockquote
                    {...props}
                    className="mb-4 border-l-2 border-newTableBorder pl-3 text-gray-500"
                  >
                    {children}
                  </blockquote>
                ),
                a: ({ children, href = '', ...props }) => {
                  const external = isExternalMarkdownLink(href);

                  return (
                    <a
                      {...props}
                      href={href}
                      className="text-blue-500 underline"
                      {...(external
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                    >
                      {children}
                    </a>
                  );
                },
                img: ({ alt = '', ...props }) => (
                  <img
                    {...props}
                    alt={alt}
                    className="my-4 max-w-full rounded"
                  />
                ),
                code: ({ children, ...props }) => (
                  <code
                    {...props}
                    className="rounded bg-newBgColor px-1 py-0.5 font-mono text-sm"
                  >
                    {children}
                  </code>
                ),
                pre: ({ children, ...props }) => (
                  <pre
                    {...props}
                    className="mb-4 overflow-x-auto rounded bg-newBgColor p-3 font-mono text-sm"
                  >
                    {children}
                  </pre>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          spellCheck={false}
          className="w-full flex-1 min-h-0 h-0 bg-input border border-tableBorder rounded-[8px] p-[12px] text-[14px] font-mono text-newTextColor outline-none resize-none focus:border-[#eb3825]"
          aria-label={t('context_document_editor', 'Document content')}
        />
      )}
      <div className="flex items-center justify-between gap-[12px] flex-wrap shrink-0">
        <div className="text-[12px] opacity-70">
          {formatContextDocumentSize(byteLength)} ({byteLength.toLocaleString()}{' '}
          bytes)
          {isContextDocumentLarge(byteLength) && (
            <span className="ms-[8px] text-amber-500">
              {t('context_document_large_badge', 'Large')}
            </span>
          )}
        </div>
        <div className="flex gap-[8px]">
          <Button secondary onClick={handleCancel} disabled={saving}>
            {t('cancel', 'Cancel')}
          </Button>
          <Button
            secondary
            className="w-[112px]"
            onClick={() => setPreviewing((current) => !current)}
            disabled={saving}
          >
            {previewing
              ? t('edit', 'Edit')
              : t('context_document_preview_button', 'Preview')}
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!dirty}>
            {t('save', 'Save')}
          </Button>
        </div>
      </div>
    </div>
  );
};

const ContextDocumentNameModal: FC<{
  initialName: string;
  confirmLabel: string;
  onSave: (name: string) => Promise<void>;
}> = ({ initialName, confirmLabel, onSave }) => {
  const t = useT();
  const modal = useModals();
  const [value, setValue] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const save = useCallback(async () => {
    const validated = validateDocumentFilename(value, t);
    if (!validated.name) {
      setError(validated.error);
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      await onSave(validated.name);
      modal.closeCurrent();
    } catch (err: any) {
      setError(
        err?.message ||
          t(
            'context_document_name_save_error',
            'We could not save this document name.'
          )
      );
    } finally {
      setSaving(false);
    }
  }, [modal, onSave, t, value]);

  return (
    <div>
      <Input
        name="context-document-name"
        disableForm={true}
        removeError={true}
        label={t('context_document_filename', 'Filename')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="NOTES.md"
      />
      {error && <p className="mt-[8px] text-[13px] text-red-400">{error}</p>}
      <div className="mt-[16px] flex justify-end gap-[8px]">
        <Button
          onClick={() => modal.closeCurrent()}
          disabled={saving}
          secondary
        >
          {t('cancel', 'Cancel')}
        </Button>
        <Button onClick={save} loading={saving} disabled={!value.trim()}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
};

const ContextDocumentMenu: FC<{
  disabled?: boolean;
  onRename: () => void;
  onReplace: () => void;
  onDelete: () => void;
}> = ({ disabled, onRename, onReplace, onDelete }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-label={t('context_document_actions', 'Document actions')}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center justify-center w-[28px] h-[28px] rounded-[6px] text-menuDots hover:text-menuDotsHover hover:bg-newBgColor disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M13.125 12C13.125 12.2225 13.059 12.44 12.9354 12.625C12.8118 12.81 12.6361 12.9542 12.4305 13.0394C12.225 13.1245 11.9988 13.1468 11.7805 13.1034C11.5623 13.06 11.3618 12.9528 11.2045 12.7955C11.0472 12.6382 10.94 12.4377 10.8966 12.2195C10.8532 12.0012 10.8755 11.775 10.9606 11.5695C11.0458 11.3639 11.19 11.1882 11.375 11.0646C11.56 10.941 11.7775 10.875 12 10.875C12.2984 10.875 12.5845 10.9935 12.7955 11.2045C13.0065 11.4155 13.125 11.7016 13.125 12ZM12 6.75C12.2225 6.75 12.44 6.68402 12.625 6.5604C12.81 6.43679 12.9542 6.26109 13.0394 6.05552C13.1245 5.84995 13.1468 5.62375 13.1034 5.40552C13.06 5.1873 12.9528 4.98684 12.7955 4.82951C12.6382 4.67217 12.4377 4.56503 12.2195 4.52162C12.0012 4.47821 11.775 4.50049 11.5695 4.58564C11.3639 4.67078 11.1882 4.81498 11.0646 4.99998C10.941 5.18499 10.875 5.4025 10.875 5.625C10.875 5.92337 10.9935 6.20952 11.2045 6.4205C11.4155 6.63147 11.7016 6.75 12 6.75ZM12 17.25C11.7775 17.25 11.56 17.316 11.375 17.4396C11.19 17.5632 11.0458 17.7389 10.9606 17.9445C10.8755 18.15 10.8532 18.3762 10.8966 18.5945C10.94 18.8127 11.0472 19.0132 11.2045 19.1705C11.3618 19.3278 11.5623 19.435 11.7805 19.4784C11.9988 19.5218 12.225 19.4995 12.4305 19.4144C12.6361 19.3292 12.8118 19.185 12.9354 19C13.059 18.815 13.125 18.5975 13.125 18.375C13.125 18.0766 13.0065 17.7905 12.7955 17.5795C12.5845 17.3685 12.2984 17.25 12 17.25Z"
            fill="currentColor"
          />
        </svg>
      </button>
      {open && (
        <div className="z-[300] absolute end-0 bottom-full mb-[6px] min-w-[140px] bg-newBgColorInner p-[8px] menu-shadow flex flex-col rounded-[8px] border border-newBorder">
          <button
            type="button"
            onClick={run(onRename)}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor"
          >
            {t('rename', 'Rename')}
          </button>
          <button
            type="button"
            onClick={run(onReplace)}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor"
          >
            {t('context_document_replace', 'Replace')}
          </button>
          <button
            type="button"
            onClick={run(onDelete)}
            className="px-[10px] py-[8px] text-[13px] rounded-[6px] text-start hover:bg-newBgColor"
          >
            {t('delete', 'Delete')}
          </button>
        </div>
      )}
    </div>
  );
};

const ContextDocumentCard: FC<{
  document: ContextDocumentMetadata;
  pending: boolean;
  uploading: boolean;
  onOpen: () => void;
  onRename: () => void;
  onReplace: () => void;
  onDelete: () => void;
}> = ({
  document,
  pending,
  uploading,
  onOpen,
  onRename,
  onReplace,
  onDelete,
}) => {
  const t = useT();
  const skillSlug =
    document.skill?.slug || getContextDocumentSkillSlug(document.name);
  const skillConflict =
    document.skill?.conflict ||
    (skillSlug ? RESERVED_AGENT_COMMAND_SLUGS.has(skillSlug) : false);

  return (
    <div
      className={clsx(
        'rounded-[8px] border border-newTableBorder bg-newTableHeader flex',
        pending && 'opacity-70 pointer-events-none'
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('context_document_open', 'Open document')}
        disabled={skillConflict}
        className="min-w-0 flex-1 p-[12px] flex flex-col gap-[8px] text-start"
      >
        <div className="min-w-0 flex items-center gap-[6px]">
          <span className="font-[600] text-[13px] truncate min-w-0 flex-1">
            {document.name}
          </span>
          {skillSlug && (
            <span
              className={clsx(
                'shrink-0 text-[11px] px-[7px] py-[2px] rounded-full border',
                skillConflict
                  ? 'border-amber-500/40 text-amber-500'
                  : 'border-btnPrimary/40 text-btnPrimary'
              )}
            >
              {skillConflict
                ? t('agent_skill_conflict_badge', 'Skill conflict')
                : t('agent_skill_badge', 'Skill')}{' '}
              · /{skillSlug}
            </span>
          )}
          {document.isLarge && (
            <span className="shrink-0 text-[11px] px-[7px] py-[2px] rounded-full border border-amber-500/40 text-amber-500">
              {t('context_document_large_badge', 'Large')}
            </span>
          )}
        </div>
        {!skillSlug && document.description && (
          <div className="text-[12px] opacity-70 line-clamp-2">
            {document.description}
          </div>
        )}
        <div className="text-[12px] opacity-70">
          {t('size', 'Size')}: {formatContextDocumentSize(document.fileSize)} (
          {document.fileSize.toLocaleString()} bytes)
        </div>
        {document.warning && (
          <div className="text-[12px] text-amber-500">{document.warning}</div>
        )}
        {skillConflict && (
          <div className="text-[12px] text-amber-500">
            {t(
              'agent_skill_conflict_hint',
              'This command is reserved and cannot be invoked. Replace or delete this legacy file to resolve the conflict.'
            )}
          </div>
        )}
      </button>
      <div className="shrink-0 p-[12px] ps-0">
        <ContextDocumentMenu
          disabled={pending || uploading}
          onRename={onRename}
          onReplace={onReplace}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
};

export const ContextDocumentLibrary: FC = () => {
  const t = useT();
  const toaster = useToaster();
  const decision = useDecisionModal();
  const modal = useModals();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data, error, isLoading, mutate } = useContextDocumentList();
  const uploadDocument = useContextDocumentUpload();
  const deleteDocument = useContextDocumentDelete();
  const createDocument = useContextDocumentCreate();
  const renameDocument = useContextDocumentRename();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');

  const documents = data || [];
  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return documents;
    }
    return documents.filter((document) =>
      document.name.toLowerCase().includes(query)
    );
  }, [documents, search]);

  useEffect(() => {
    if (!documents.length && search) {
      setSearch('');
    }
  }, [documents.length, search]);

  const openEditor = useCallback(
    (
      document: Pick<ContextDocumentMetadata, 'id' | 'name'> & {
        skill?: ContextDocumentMetadata['skill'];
      }
    ) => {
      const skillSlug =
        document.skill?.slug || getContextDocumentSkillSlug(document.name);
      const skillConflict =
        document.skill?.conflict ||
        (skillSlug ? RESERVED_AGENT_COMMAND_SLUGS.has(skillSlug) : false);

      if (skillConflict) {
        return;
      }

      modal.openModal({
        title: document.name,
        size: '840px',
        maxSize: '90vw',
        top: 20,
        height: 'calc(100dvh - 40px)',
        children: (
          <ContextDocumentEditor
            documentId={document.id}
            documentName={document.name}
            skillSlug={skillSlug}
            onSaved={() => {
              void mutate();
            }}
          />
        ),
      });
    },
    [modal, mutate]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const openCreateModal = useCallback(() => {
    modal.openModal({
      title: t('context_document_new_title', 'New document'),
      children: (
        <ContextDocumentNameModal
          initialName=""
          confirmLabel={t('context_document_create', 'Create')}
          onSave={async (name) => {
            const created = await createDocument({ name, content: '' });
            await mutate();
            toaster.show(
              t(
                'context_document_created_success',
                'Document created successfully.'
              ),
              'success'
            );
            openEditor(created);
          }}
        />
      ),
    });
  }, [createDocument, modal, mutate, openEditor, t, toaster]);

  const openRenameModal = useCallback(
    (document: ContextDocumentMetadata) => {
      modal.openModal({
        title: t('context_document_rename_title', 'Rename document'),
        children: (
          <ContextDocumentNameModal
            initialName={document.name}
            confirmLabel={t('rename', 'Rename')}
            onSave={async (name) => {
              await renameDocument(document.id, name, document.name);
              await mutate();
              toaster.show(
                t(
                  'context_document_renamed_success',
                  'Document renamed successfully.'
                ),
                'success'
              );
            }}
          />
        ),
      });
    },
    [modal, mutate, renameDocument, t, toaster]
  );

  const handleFileSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';

      if (!file) {
        return;
      }

      const validated = validateDocumentFilename(file.name, t);
      if (!validated.name) {
        toaster.show(validated.error!, 'warning');
        return;
      }
      const normalizedName = validated.name;

      if (file.size > CONTEXT_DOCUMENT_MAX_BYTES) {
        toaster.show(
          t(
            'context_document_oversize',
            'This file exceeds the 256 KiB limit and cannot be uploaded.'
          ),
          'warning'
        );
        return;
      }

      const existing = data?.find(
        (document) => document.name === normalizedName
      );

      if (existing) {
        const approved = await decision.open({
          title: t(
            'context_document_replace_title',
            'Replace existing document?'
          ),
          description: t(
            'context_document_replace_description',
            `"${normalizedName}" already exists in your organization library. Uploading will replace its content while keeping the same document id. Pipeline assignments will continue to reference this document.`
          ),
          approveLabel: t(
            'context_document_replace_confirm',
            'Replace document'
          ),
          cancelLabel: t('cancel', 'Cancel'),
        });

        if (!approved) {
          return;
        }
      }

      if (isContextDocumentLarge(file.size)) {
        const approved = await decision.open({
          title: t('context_document_large_title', 'Large document warning'),
          description: t(
            'context_document_large_description',
            `"${normalizedName}" is ${formatContextDocumentSize(
              file.size
            )} (${file.size.toLocaleString()} bytes). Documents at or above ${formatContextDocumentSize(
              CONTEXT_DOCUMENT_LARGE_WARNING_BYTES
            )} may be too large for reliable agent use. Consider splitting it into smaller files.`
          ),
          approveLabel: t('context_document_upload_anyway', 'Upload anyway'),
          cancelLabel: t('cancel', 'Cancel'),
        });

        if (!approved) {
          return;
        }
      }

      setUploading(true);

      try {
        const uploaded = await uploadDocument(file);
        await mutate();

        toaster.show(
          existing
            ? t(
                'context_document_replaced_success',
                'Document replaced successfully.'
              )
            : t(
                'context_document_uploaded_success',
                'Document uploaded successfully.'
              ),
          'success'
        );

        if (uploaded.warning) {
          toaster.show(uploaded.warning, 'warning');
        }
      } catch (err: any) {
        toaster.show(
          err?.message ||
            t(
              'context_document_upload_error',
              'Failed to upload document. Please try again.'
            ),
          'warning'
        );
      } finally {
        setUploading(false);
      }
    },
    [data, decision, mutate, t, toaster, uploadDocument]
  );

  const confirmDelete = useCallback(
    (document: ContextDocumentMetadata) => async () => {
      const approved = await decision.open({
        title: t('context_document_delete_title', 'Delete document?'),
        description: t(
          'context_document_delete_description',
          `Deleting "${document.name}" will remove it from your organization library and detach it from any Pipelines. Queued posts are not affected.`
        ),
        approveLabel: t('context_document_delete_confirm', 'Delete document'),
        cancelLabel: t('cancel', 'Cancel'),
      });

      if (!approved) {
        return;
      }

      setPendingId(document.id);

      try {
        await deleteDocument(document.id);
        await mutate();
        toaster.show(
          t(
            'context_document_deleted_success',
            'Document deleted. Pipeline assignments were removed.'
          ),
          'success'
        );
      } catch (err: any) {
        toaster.show(
          err?.message ||
            t(
              'context_document_delete_error',
              'Failed to delete document. Please try again.'
            ),
          'warning'
        );
      } finally {
        setPendingId(null);
      }
    },
    [decision, deleteDocument, mutate, t, toaster]
  );

  if (isLoading) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[20px] transition-all text-textColor">
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="flex flex-col gap-[6px]">
        <h1 className="text-[24px] font-[600]">
          {t('context_documents', 'Context documents')} ({data?.length || 0})
        </h1>
        <p className="text-[14px] opacity-70 max-w-[760px]">
          {t(
            'context_documents_description',
            'Create or upload reusable Markdown files for your organization. Add a short description so agents can discover relevant documents. Standard documents can be attached to Pipelines; {slug}.skill.md files are agent procedures invoked with /slug. Maximum file size is 256 KiB.'
          )}
        </p>
      </div>

      {error && (
        <div className="rounded-[12px] border border-red-500/30 bg-newBgColor px-[16px] py-[12px] text-[14px] text-red-500">
          {t(
            'context_documents_load_error',
            'Failed to load context documents. Please refresh and try again.'
          )}
        </div>
      )}

      <div className="flex items-center gap-[12px]">
        <button
          type="button"
          onClick={openCreateModal}
          className="relative cursor-pointer bg-forth text-white flex gap-[8px] h-[44px] px-[18px] justify-center items-center rounded-[8px]"
        >
          <PlusIcon size={14} />
          <div>{t('create', 'Create')}</div>
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={handleUploadClick}
          className="relative cursor-pointer bg-btnSimple changeColor flex gap-[8px] h-[44px] px-[18px] justify-center items-center rounded-[8px] disabled:opacity-80 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
              <div className="animate-spin h-[20px] w-[20px] border-4 border-white border-t-transparent rounded-full" />
            </div>
          ) : (
            <PlusIcon size={14} />
          )}
          <div className={uploading ? 'invisible' : undefined}>
            {t('context_document_upload', 'Upload')}
          </div>
        </button>
        {!!documents.length && (
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t(
                'search_context_documents',
                'Search documents by name'
              )}
              className="w-full h-[44px] px-[14px] rounded-[8px] bg-newBgColorInner border border-newColColor text-[14px] outline-none focus:border-[#eb3825]"
            />
          </div>
        )}
      </div>

      {!documents.length ? (
        <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[32px] flex flex-col items-center justify-center gap-[12px] text-center">
          <div className="text-[18px] font-[600]">
            {t('context_documents_empty_title', 'No context documents yet')}
          </div>
          <div className="text-[14px] opacity-70 max-w-[520px]">
            {t(
              'context_documents_empty_description',
              'Create a blank Markdown document in the browser, or upload .md / .markdown files such as BRANDING.md for Pipeline guidance, or {slug}.skill.md files for agent procedures invoked with /slug.'
            )}
          </div>
          <div className="flex gap-[8px] flex-wrap justify-center">
            <Button onClick={openCreateModal}>{t('create', 'Create')}</Button>
            <Button onClick={handleUploadClick} loading={uploading} secondary>
              {t('context_document_upload', '+ Upload')}
            </Button>
          </div>
        </div>
      ) : !filteredDocuments.length ? (
        <div className="rounded-[12px] border border-newBorder bg-newBgColor p-[32px] flex flex-col items-center justify-center gap-[12px] text-center">
          <div className="text-[18px] font-[600]">
            {t('no_matching_documents', 'No documents match your search.')}
          </div>
          <div className="text-[14px] opacity-70 max-w-[520px]">
            {t(
              'context_documents_search_empty_description',
              'Try a different file name, or clear the search to see all documents.'
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[12px]">
          {filteredDocuments.map((document) => (
            <ContextDocumentCard
              key={document.id}
              document={document}
              pending={pendingId === document.id}
              uploading={uploading}
              onOpen={() => openEditor(document)}
              onRename={() => openRenameModal(document)}
              onReplace={handleUploadClick}
              onDelete={confirmDelete(document)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

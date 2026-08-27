import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

export const CONTEXT_DOCUMENT_MAX_BYTES = 256 * 1024;
export const CONTEXT_DOCUMENT_LARGE_WARNING_BYTES = 128 * 1024;

const ALLOWED_EXTENSIONS = new Set(['.md', '.markdown']);
const MAX_FILENAME_LENGTH = 255;
export const SKILL_FILENAME_SUFFIX = '.skill.md';
export const SKILL_SLUG_PATTERN = /^[a-z0-9-]+$/;
export const RESERVED_AGENT_COMMAND_SLUGS = new Set(['followers']);

export type ValidatedContextDocumentUpload = {
  name: string;
  content: string;
  fileSize: number;
};

export function isContextDocumentLarge(fileSize: number): boolean {
  return fileSize >= CONTEXT_DOCUMENT_LARGE_WARNING_BYTES;
}

export function getContextDocumentLargeWarning(
  fileSize: number
): string | undefined {
  if (!isContextDocumentLarge(fileSize)) {
    return undefined;
  }

  return `This document is ${fileSize} bytes and may be too large for reliable agent use. Consider splitting it into smaller files.`;
}

export function normalizeContextDocumentName(originalName: string): string {
  const basename = path
    .basename((originalName || '').replace(/\\/g, '/'))
    .trim();

  if (!basename) {
    throw new BadRequestException('A Markdown filename is required.');
  }

  const extension = path.extname(basename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new BadRequestException(
      'Only .md and .markdown files are supported.'
    );
  }

  const stem = basename.slice(0, basename.length - extension.length).trim();
  if (!stem) {
    throw new BadRequestException('A Markdown filename is required.');
  }

  const normalizedName = `${stem}${extension}`;
  if (normalizedName.length > MAX_FILENAME_LENGTH) {
    throw new BadRequestException('The Markdown filename is too long.');
  }

  return normalizedName;
}

export function parseSkillFilename(
  name: string | undefined
): string | undefined {
  if (typeof name !== 'string') {
    return undefined;
  }
  if (!name.endsWith(SKILL_FILENAME_SUFFIX)) {
    return undefined;
  }

  const slug = name.slice(0, -SKILL_FILENAME_SUFFIX.length);
  return SKILL_SLUG_PATTERN.test(slug) ? slug : undefined;
}

export function isAttemptedSkillFilename(name: string): boolean {
  return name.endsWith(SKILL_FILENAME_SUFFIX);
}

export function buildSkillFilename(slug: string): string {
  if (!SKILL_SLUG_PATTERN.test(slug)) {
    throw new BadRequestException(
      'Agent skill commands must use lowercase letters, numbers, and hyphens.'
    );
  }

  return `${slug}${SKILL_FILENAME_SUFFIX}`;
}

export function isReservedAgentCommandSlug(slug: string): boolean {
  return RESERVED_AGENT_COMMAND_SLUGS.has(slug);
}

export function decodeUtf8Fatal(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new BadRequestException(
      'The uploaded file must be valid UTF-8 text.'
    );
  }
}

export function validateContextDocumentNameForWrite(
  originalName: string
): string {
  const name = normalizeContextDocumentName(originalName);
  const skillSlug = parseSkillFilename(name);
  if (isAttemptedSkillFilename(name) && !skillSlug) {
    throw new BadRequestException(
      'Agent skill filenames must use the format {slug}.skill.md, with lowercase letters, numbers, and hyphens in the slug.'
    );
  }
  if (skillSlug && isReservedAgentCommandSlug(skillSlug)) {
    throw new BadRequestException(
      `Agent skill command /${skillSlug} is reserved and cannot be used.`
    );
  }
  return name;
}

export const CONTEXT_DOCUMENT_DESCRIPTION_MAX_LENGTH = 500;

export function validateContextDocumentDescription(
  value: unknown
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('Document description must be a string.');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > CONTEXT_DOCUMENT_DESCRIPTION_MAX_LENGTH) {
    throw new BadRequestException(
      `Document description cannot exceed ${CONTEXT_DOCUMENT_DESCRIPTION_MAX_LENGTH} characters.`
    );
  }

  return trimmed;
}

export function validateContextDocumentContent(
  content: string,
  options?: { allowEmpty?: boolean }
): { content: string; fileSize: number } {
  if (typeof content !== 'string') {
    throw new BadRequestException('Document content is required.');
  }

  if (content.includes('\0')) {
    throw new BadRequestException('The document contains invalid null bytes.');
  }

  const fileSize = Buffer.byteLength(content, 'utf8');
  if (fileSize > CONTEXT_DOCUMENT_MAX_BYTES) {
    throw new BadRequestException(
      `The document exceeds the ${CONTEXT_DOCUMENT_MAX_BYTES} byte limit.`
    );
  }

  if (!options?.allowEmpty && !content.trim()) {
    throw new BadRequestException('The document content is empty.');
  }

  return { content, fileSize };
}

export function validateContextDocumentUpload(
  file?: Pick<Express.Multer.File, 'buffer' | 'size' | 'originalname'>
): ValidatedContextDocumentUpload {
  if (!file) {
    throw new BadRequestException('A Markdown file is required.');
  }

  if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException('A Markdown file is required.');
  }

  const fileSize = file.buffer.length;
  if (fileSize === 0) {
    throw new BadRequestException('The uploaded file is empty.');
  }

  if (fileSize > CONTEXT_DOCUMENT_MAX_BYTES) {
    throw new BadRequestException(
      `The uploaded file exceeds the ${CONTEXT_DOCUMENT_MAX_BYTES} byte limit.`
    );
  }

  if (typeof file.size === 'number' && file.size > CONTEXT_DOCUMENT_MAX_BYTES) {
    throw new BadRequestException(
      `The uploaded file exceeds the ${CONTEXT_DOCUMENT_MAX_BYTES} byte limit.`
    );
  }

  const name = validateContextDocumentNameForWrite(file.originalname || '');
  const content = decodeUtf8Fatal(file.buffer);

  if (!content.trim()) {
    throw new BadRequestException('The uploaded file is empty.');
  }

  const validated = validateContextDocumentContent(content);

  return {
    name,
    content: validated.content,
    fileSize: validated.fileSize,
  };
}

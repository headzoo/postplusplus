import { createHash } from 'crypto';
import { parseUtmParamsString } from '@gitroom/helpers/utils/utm.params';

export const MAX_CONVERSION_ID_LENGTH = 512;
export const MAX_CONVERSION_GOAL_LENGTH = 256;
export const MAX_CONVERSION_JSON_KEYS = 32;
export const MAX_CONVERSION_JSON_VALUE_LENGTH = 1_024;
export const MAX_CONVERSION_QUERY_RANGE_DAYS = 90;
export const MAX_CONVERSION_FUTURE_SKEW_MS = 5 * 60 * 1000;

export const STANDARD_UTM_FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export type StandardUtmField = (typeof STANDARD_UTM_FIELDS)[number];

export const normalizeGoalAttributionUtm = (
  input: string | Partial<Record<StandardUtmField, string | undefined>>
) => {
  const fields =
    typeof input === 'string'
      ? (() => {
          const params = parseUtmParamsString(input);
          if (!params) {
            return null;
          }
          return Object.fromEntries(
            STANDARD_UTM_FIELDS.map((key) => [
              key,
              params.get(key) ?? undefined,
            ])
          ) as Partial<Record<StandardUtmField, string | undefined>>;
        })()
      : input;
  if (!fields) {
    return null;
  }
  const params = new URLSearchParams();
  for (const key of STANDARD_UTM_FIELDS) {
    const value = fields[key]?.trim();
    if (value) {
      params.set(key, value);
    }
  }
  const normalized = params.toString();
  if (!normalized) {
    return null;
  }
  return {
    snapshot: normalized,
    fingerprint: createHash('sha256').update(normalized).digest('hex'),
  };
};

export const sanitizeBoundedJson = (
  value: unknown,
  label: string
): Record<string, string | number | boolean | null> | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_CONVERSION_JSON_KEYS) {
    throw new Error(`${label} exceeds the maximum number of keys`);
  }
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of entries) {
    if (!key.length || key.length > 128) {
      throw new Error(`${label} keys must be between 1 and 128 characters`);
    }
    if (raw === null) {
      sanitized[key] = null;
      continue;
    }
    if (typeof raw === 'boolean' || typeof raw === 'number') {
      sanitized[key] = raw;
      continue;
    }
    if (typeof raw === 'string') {
      if (raw.length > MAX_CONVERSION_JSON_VALUE_LENGTH) {
        throw new Error(`${label}.${key} exceeds the maximum value length`);
      }
      sanitized[key] = raw;
      continue;
    }
    throw new Error(`${label}.${key} must be a scalar value`);
  }
  return sanitized;
};

export const encodeConversionCursor = (occurredAt: Date, id: string) =>
  Buffer.from(
    JSON.stringify({ occurredAt: occurredAt.toISOString(), id }),
    'utf8'
  ).toString('base64url');

export const decodeConversionCursor = (cursor: string) => {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as { occurredAt?: string; id?: string };
    if (
      typeof parsed.occurredAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !parsed.id.length ||
      parsed.id.length > MAX_CONVERSION_ID_LENGTH
    ) {
      throw new Error('Invalid conversion cursor');
    }
    const occurredAt = new Date(parsed.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new Error('Invalid conversion cursor');
    }
    return { occurredAt, id: parsed.id };
  } catch {
    throw new Error('Invalid conversion cursor');
  }
};

export const parseUtcDateRange = (
  from: string,
  to: string,
  maxDays = MAX_CONVERSION_QUERY_RANGE_DAYS
) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error('Date range must use YYYY-MM-DD UTC calendar days');
  }
  const rangeFrom = new Date(`${from}T00:00:00.000Z`);
  const rangeTo = new Date(`${to}T00:00:00.000Z`);
  if (
    Number.isNaN(rangeFrom.getTime()) ||
    Number.isNaN(rangeTo.getTime()) ||
    rangeFrom.toISOString().slice(0, 10) !== from ||
    rangeTo.toISOString().slice(0, 10) !== to
  ) {
    throw new Error('Date range must use valid UTC calendar days');
  }
  if (rangeTo <= rangeFrom) {
    throw new Error('Date range end must be after start');
  }
  const spanDays =
    (rangeTo.getTime() - rangeFrom.getTime()) / (24 * 60 * 60 * 1000);
  if (spanDays > maxDays) {
    throw new Error(`Date range cannot exceed ${maxDays} UTC days`);
  }
  return { from: rangeFrom, to: rangeTo };
};

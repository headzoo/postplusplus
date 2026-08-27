export const MAX_HTTP_LOG_BODY = 64 * 1024;
export const MAX_HTTP_LOG_IDENTITY = 512;

export type WebhookLogIdentity = {
  displayName?: string;
  username?: string;
};

export type WebhookLogEndpoints = {
  sourceDisplayName?: string;
  sourceUsername?: string;
  targetDisplayName?: string;
  targetUsername?: string;
};

export function capHttpLogEventType(value?: string | null) {
  return capHttpLogIdentity(value);
}

export function capHttpLogIdentity(value?: string | null) {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length <= MAX_HTTP_LOG_IDENTITY
    ? trimmed
    : trimmed.slice(0, MAX_HTTP_LOG_IDENTITY);
}

export function hostnameFromUrl(url?: string) {
  if (!url) {
    return undefined;
  }
  try {
    return capHttpLogIdentity(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

export function integrationIdentity(
  name?: string | null,
  profile?: string | null
): WebhookLogIdentity {
  return {
    displayName: capHttpLogIdentity(name),
    username: capHttpLogIdentity(profile),
  };
}

export function webhookTargetIdentity(
  name?: string | null,
  url?: string
): WebhookLogIdentity {
  return {
    displayName: capHttpLogIdentity(name),
    username: hostnameFromUrl(url),
  };
}

export function logEventType(event?: {
  eventType?: string;
  kind?: string;
  metadata?: { referenceType?: string };
}) {
  const eventType = event?.eventType;
  if (eventType !== 'post.create') {
    return eventType;
  }
  if (event?.kind === 'reply') {
    return 'post.reply.create';
  }
  if (event?.kind === 'repost') {
    return 'post.repost.create';
  }
  if (event?.kind === 'mention') {
    return event.metadata?.referenceType === 'quote'
      ? 'post.quote.create'
      : 'post.mention.create';
  }
  return eventType;
}

export function eventEndpoints(
  event:
    | {
        direction?: string;
        counterparty?: { name?: string; username?: string };
      }
    | undefined,
  integration?: { name?: string | null; profile?: string | null }
): WebhookLogEndpoints {
  const channel = integrationIdentity(integration?.name, integration?.profile);
  const actor = integrationIdentity(
    event?.counterparty?.name,
    event?.counterparty?.username
  );
  if (event?.direction === 'outbound') {
    return {
      sourceDisplayName: channel.displayName,
      sourceUsername: channel.username,
      targetDisplayName: actor.displayName,
      targetUsername: actor.username,
    };
  }
  return {
    sourceDisplayName: actor.displayName,
    sourceUsername: actor.username,
    targetDisplayName: channel.displayName,
    targetUsername: channel.username,
  };
}

const REDACTED = '[redacted]';
const BINARY_OMITTED = '[binary omitted]';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
]);

const SENSITIVE_QUERY = new Set([
  'access_token',
  'oauth_token',
  'refresh_token',
  'token',
  'api_key',
  'apikey',
]);

export type HttpLogHeaders = Record<string, string | string[] | undefined>;

export function truncateHttpLogBody(value: string, max = MAX_HTTP_LOG_BODY) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}… [truncated ${value.length - max} chars]`;
}

export function redactHttpLogUrl(url: string) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_QUERY.has(key.toLowerCase())) {
        parsed.searchParams.set(key, REDACTED);
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function serializeHttpLogHeaders(headers?: unknown): string {
  const normalized = normalizeHeaders(headers);
  return JSON.stringify(normalized);
}

export function shouldOmitHttpLogBody(contentType?: string, body?: unknown) {
  return isBinaryContentType(contentType) || isBinaryBody(body);
}

export async function readCappedHttpLogBody(
  response: {
    body?: ReadableStream<Uint8Array> | null;
    headers?: { get(name: string): string | null };
  },
  max = MAX_HTTP_LOG_BODY
) {
  const contentType = response.headers?.get('content-type') || undefined;
  if (shouldOmitHttpLogBody(contentType)) {
    return BINARY_OMITTED;
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    return '';
  }
  const decoder = new TextDecoder();
  let result = '';
  try {
    while (result.length < max) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const remaining = max - result.length;
      const take = Math.min(value.byteLength, remaining + 16);
      result += decoder.decode(value.subarray(0, take), { stream: true });
    }
    result += decoder.decode();
  } finally {
    try {
      await reader.cancel();
    } catch {
      /** already closed */
    }
  }
  return truncateHttpLogBody(result, max);
}

export function serializeHttpLogBody(body: unknown, contentType?: string) {
  if (shouldOmitHttpLogBody(contentType, body)) {
    return BINARY_OMITTED;
  }
  if (body == null) {
    return '';
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
    return truncateHttpLogBody(body.toString('utf8'));
  }
  if (typeof body === 'string') {
    return truncateHttpLogBody(body);
  }
  try {
    return truncateHttpLogBody(JSON.stringify(body));
  } catch {
    return truncateHttpLogBody(String(body));
  }
}

function isBinaryContentType(contentType?: string) {
  if (!contentType) {
    return false;
  }
  const type = contentType.split(';')[0].trim().toLowerCase();
  return (
    type.startsWith('image/') ||
    type.startsWith('video/') ||
    type.startsWith('audio/') ||
    type === 'application/octet-stream' ||
    type === 'multipart/form-data'
  );
}

function isBinaryBody(body: unknown) {
  if (body == null) {
    return false;
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return true;
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return true;
  }
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return true;
  }
  if (
    body instanceof Uint8Array &&
    (typeof Buffer === 'undefined' || !Buffer.isBuffer(body))
  ) {
    return true;
  }
  return (
    typeof body === 'object' &&
    typeof (body as { pipe?: unknown }).pipe === 'function'
  );
}

function normalizeHeaders(headers?: unknown): HttpLogHeaders {
  if (!headers) {
    return {};
  }
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return Object.fromEntries(
      [...headers.entries()].map(([key, value]) => [
        key,
        redactHeaderValue(key, value),
      ])
    );
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(
      headers.map(([key, value]) => [
        String(key),
        redactHeaderValue(String(key), value),
      ])
    );
  }
  if (typeof headers === 'object') {
    return Object.fromEntries(
      Object.entries(headers as Record<string, unknown>).map(([key, value]) => [
        key,
        redactHeaderValue(key, value),
      ])
    );
  }
  return {};
}

function redactHeaderValue(name: string, value: unknown) {
  if (SENSITIVE_HEADERS.has(name.toLowerCase())) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item == null ? '' : String(item)));
  }
  if (value == null) {
    return undefined;
  }
  return String(value);
}

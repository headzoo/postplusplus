import { open, mkdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const MAX_FILENAME_ATTEMPTS = 120;

export type IncomingWebhookSinkInput = {
  method: string;
  providerIdentifier?: string;
  headers?: unknown;
  query?: unknown;
  rawBody?: Buffer;
};

export function getIncomingWebhookLogDirectory() {
  const directory = process.env.INCOMING_WEBHOOK_LOG_DIR?.trim();
  return directory && isAbsolute(directory) ? directory : undefined;
}

export async function sinkIncomingWebhook(input: IncomingWebhookSinkInput) {
  try {
    const directory = getIncomingWebhookLogDirectory();
    if (!directory) {
      return;
    }

    await mkdir(directory, { recursive: true });

    const provider = sanitizeSegment(input.providerIdentifier || 'unknown');
    const method = sanitizeSegment(input.method || 'unknown').toLowerCase();
    const hasBody = Buffer.isBuffer(input.rawBody);
    const body = JSON.stringify(
      {
        receivedAt: new Date().toISOString(),
        method: input.method,
        provider: input.providerIdentifier,
        path: `/channel-webhooks/${input.providerIdentifier || ''}`,
        headers: input.headers || {},
        query: input.query || {},
        body: hasBody ? input.rawBody!.toString('utf8') : null,
        bodyEncoding: hasBody ? 'utf8' : null,
      },
      null,
      2
    );

    return await writeExclusive(directory, provider, method, body);
  } catch {
    /** raw capture must never break webhook delivery */
  }
}

function sanitizeSegment(value: string) {
  const sanitized = value
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || 'unknown';
}

function filenameFor(date: Date, provider: string, method: string) {
  const value = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ];

  return `${value.join('-')}-${sanitizeSegment(provider)}-${sanitizeSegment(
    method
  )}.json`;
}

async function writeExclusive(
  directory: string,
  provider: string,
  method: string,
  body: string
) {
  const initialTime = new Date();

  for (let attempt = 0; attempt < MAX_FILENAME_ATTEMPTS; attempt++) {
    const filename = filenameFor(
      new Date(initialTime.getTime() + attempt * 1000),
      provider,
      method
    );

    try {
      const handle = await open(join(directory, filename), 'wx');
      try {
        await handle.writeFile(body, 'utf8');
      } finally {
        await handle.close();
      }

      return filename;
    } catch (error: any) {
      if (error?.code === 'EEXIST') {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Incoming webhook log could not allocate an output file');
}

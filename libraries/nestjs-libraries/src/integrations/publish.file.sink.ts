import { open, mkdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const MAX_FILENAME_ATTEMPTS = 120;

export type PublishFileSinkAction =
  | 'post'
  | 'comment'
  | 'edit'
  | 'checkPostStatus'
  | 'finalizePost';

export type PublishFileSinkPayload = {
  action: PublishFileSinkAction;
  provider: string;
  integrationId: string;
  internalId: string;
  name: string;
  posts?: unknown[];
  extra?: Record<string, unknown>;
};

export function getPublishFileSinkDirectory() {
  const directory = process.env.PUBLISH_FILE_SINK_DIR?.trim();
  return directory && isAbsolute(directory) ? directory : undefined;
}

export async function sinkOutboundPublish(payload: PublishFileSinkPayload) {
  const directory = getPublishFileSinkDirectory();
  if (!directory) {
    throw new Error('Publish file sink is not configured');
  }

  await mkdir(directory, { recursive: true });

  const body = JSON.stringify(
    {
      action: payload.action,
      provider: payload.provider,
      integrationId: payload.integrationId,
      internalId: payload.internalId,
      name: payload.name,
      ...(payload.posts !== undefined ? { posts: payload.posts } : {}),
      ...(payload.extra !== undefined ? { extra: payload.extra } : {}),
    },
    null,
    2
  );

  return writeExclusive(directory, payload.provider, payload.action, body);
}

function sanitizeSegment(value: string) {
  const sanitized = value
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || 'unknown';
}

function filenameFor(date: Date, provider: string, action: string) {
  const value = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ];

  return `${value.join('-')}-${sanitizeSegment(provider)}-${sanitizeSegment(
    action
  )}.json`;
}

async function writeExclusive(
  directory: string,
  provider: string,
  action: string,
  body: string
) {
  const initialTime = new Date();

  for (let attempt = 0; attempt < MAX_FILENAME_ATTEMPTS; attempt++) {
    const filename = filenameFor(
      new Date(initialTime.getTime() + attempt * 1000),
      provider,
      action
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

  throw new Error('Publish file sink could not allocate an output file');
}

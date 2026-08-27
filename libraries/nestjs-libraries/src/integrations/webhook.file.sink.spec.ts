import {
  getIncomingWebhookLogDirectory,
  sinkIncomingWebhook,
} from '@gitroom/nestjs-libraries/integrations/webhook.file.sink';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('webhook.file.sink', () => {
  const originalDirectory = process.env.INCOMING_WEBHOOK_LOG_DIR;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'postiz-incoming-webhook-'));
    delete process.env.INCOMING_WEBHOOK_LOG_DIR;
  });

  afterEach(async () => {
    jest.useRealTimers();
    await rm(directory, { recursive: true, force: true });

    if (originalDirectory === undefined) {
      delete process.env.INCOMING_WEBHOOK_LOG_DIR;
    } else {
      process.env.INCOMING_WEBHOOK_LOG_DIR = originalDirectory;
    }
  });

  it('is disabled for missing or relative configuration', async () => {
    expect(getIncomingWebhookLogDirectory()).toBeUndefined();
    await expect(
      sinkIncomingWebhook({
        method: 'POST',
        providerIdentifier: 'x',
        rawBody: Buffer.from('{"ok":true}'),
      })
    ).resolves.toBeUndefined();

    process.env.INCOMING_WEBHOOK_LOG_DIR = 'relative-output';
    expect(getIncomingWebhookLogDirectory()).toBeUndefined();
  });

  it('writes the raw body and headers when an absolute directory is set', async () => {
    const nestedDirectory = join(directory, 'nested', 'output');
    process.env.INCOMING_WEBHOOK_LOG_DIR = nestedDirectory;

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-16T13:01:14.000Z'));

    const filename = await sinkIncomingWebhook({
      method: 'POST',
      providerIdentifier: 'x',
      headers: { 'x-twitter-webhooks-signature': 'sha256=abc' },
      rawBody: Buffer.from('{"hello":"world"}'),
    });

    expect(filename).toBe('2026-08-16-13-01-14-x-post.json');
    expect(getIncomingWebhookLogDirectory()).toBe(nestedDirectory);

    const written = JSON.parse(
      await readFile(join(nestedDirectory, filename!), 'utf8')
    );
    expect(written).toEqual({
      receivedAt: '2026-08-16T13:01:14.000Z',
      method: 'POST',
      provider: 'x',
      path: '/channel-webhooks/x',
      headers: { 'x-twitter-webhooks-signature': 'sha256=abc' },
      query: {},
      body: '{"hello":"world"}',
      bodyEncoding: 'utf8',
    });
  });

  it('writes a null body when the request has no payload', async () => {
    process.env.INCOMING_WEBHOOK_LOG_DIR = directory;
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-16T13:01:14.000Z'));

    const filename = await sinkIncomingWebhook({
      method: 'GET',
      providerIdentifier: 'x',
      query: { crc_token: 'challenge' },
    });

    const written = JSON.parse(
      await readFile(join(directory, filename!), 'utf8')
    );
    expect(written.body).toBeNull();
    expect(written.bodyEncoding).toBeNull();
    expect(written.query).toEqual({ crc_token: 'challenge' });
  });

  it('swallows write errors without throwing', async () => {
    process.env.INCOMING_WEBHOOK_LOG_DIR = '/dev/null/not-a-dir';
    await expect(
      sinkIncomingWebhook({
        method: 'POST',
        providerIdentifier: 'x',
        rawBody: Buffer.from('{}'),
      })
    ).resolves.toBeUndefined();
    await expect(readdir(directory)).resolves.toEqual([]);
  });
});

jest.mock('nostr-tools', () => ({
  getPublicKey: jest.fn(),
  Relay: jest.fn(),
  finalizeEvent: jest.fn(),
  SimplePool: jest.fn(),
}));

import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { FileProvider } from '@gitroom/nestjs-libraries/integrations/social/file.provider';
import { PostDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const post = (message: string): PostDetails[] => [
  {
    id: 'root-post',
    message,
    settings: {},
  },
];

describe('FileProvider', () => {
  const originalDirectory = process.env.FILE_CHANNEL_DIRECTORY;
  const originalFrontendUrl = process.env.FRONTEND_URL;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'postiz-file-channel-'));
    delete process.env.FILE_CHANNEL_DIRECTORY;
    process.env.FRONTEND_URL = 'https://postiz.example';
  });

  afterEach(async () => {
    jest.useRealTimers();
    await rm(directory, { recursive: true, force: true });

    if (originalDirectory === undefined) {
      delete process.env.FILE_CHANNEL_DIRECTORY;
    } else {
      process.env.FILE_CHANNEL_DIRECTORY = originalDirectory;
    }

    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
  });

  it('is unavailable for missing or relative deployment configuration', async () => {
    const provider = new FileProvider();
    const manager = new IntegrationManager();

    expect(provider.isConfigured()).toBe(false);
    expect(await provider.authenticate()).toBe(
      'File channel is not configured'
    );
    expect(manager.getAllowedSocialsIntegrations()).not.toContain('file');
    expect((await manager.getAllIntegrations()).social).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ identifier: 'file' })])
    );

    process.env.FILE_CHANNEL_DIRECTORY = 'relative-output';

    expect(provider.isConfigured()).toBe(false);
    expect(manager.getAllowedSocialsIntegrations()).not.toContain('file');
    expect(manager.getSocialIntegration('file')).toBeInstanceOf(FileProvider);
  });

  it('uses the normal callback flow and stable integration identity', async () => {
    process.env.FILE_CHANNEL_DIRECTORY = directory;
    const provider = new FileProvider();

    const authUrl = await provider.generateAuthUrl();
    const callback = new URL(authUrl.url);

    expect(callback.pathname).toBe('/integrations/social/file');
    expect(callback.searchParams.get('state')).toBe(authUrl.state);
    expect(callback.searchParams.get('code')).toBe('file-channel');
    expect(await provider.authenticate()).toMatchObject({
      id: 'file',
      name: 'File',
      accessToken: 'file-channel',
      picture: '',
      refreshToken: '',
    });
  });

  it('creates directories and writes the root message as UTF-8', async () => {
    const nestedDirectory = join(directory, 'nested', 'output');
    process.env.FILE_CHANNEL_DIRECTORY = nestedDirectory;
    const provider = new FileProvider();

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-02T03:04:05.000Z'));
    const [response] = await provider.post(
      '',
      '',
      post('Héllo file'),
      {} as any
    );

    expect(response).toMatchObject({
      id: 'root-post',
      postId: '2025-01-02-03-04-05.txt',
      releaseURL: '2025-01-02-03-04-05.txt',
      status: 'completed',
    });
    expect(response.releaseURL).not.toContain(nestedDirectory);
    expect(await readFile(join(nestedDirectory, response.postId), 'utf8')).toBe(
      'Héllo file'
    );
  });

  it('allocates distinct names without overwriting same-second collisions', async () => {
    process.env.FILE_CHANNEL_DIRECTORY = directory;
    const provider = new FileProvider();
    const initialFilename = '2025-01-02-03-04-05.txt';

    await writeFile(join(directory, initialFilename), 'existing', 'utf8');
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-02T03:04:05.000Z'));

    const [first] = await provider.post('', '', post('first'), {} as any);
    const [second] = await provider.post('', '', post('second'), {} as any);

    expect(first.postId).toBe('2025-01-02-03-04-06.txt');
    expect(second.postId).toBe('2025-01-02-03-04-07.txt');
    expect(first.postId).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.txt$/);
    expect(await readFile(join(directory, initialFilename), 'utf8')).toBe(
      'existing'
    );
    expect(await readFile(join(directory, first.postId), 'utf8')).toBe('first');
    expect(await readFile(join(directory, second.postId), 'utf8')).toBe(
      'second'
    );
  });
});

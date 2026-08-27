import {
  getPublishFileSinkDirectory,
  sinkOutboundPublish,
} from '@gitroom/nestjs-libraries/integrations/publish.file.sink';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('publish.file.sink', () => {
  const originalDirectory = process.env.PUBLISH_FILE_SINK_DIR;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'postiz-publish-sink-'));
    delete process.env.PUBLISH_FILE_SINK_DIR;
  });

  afterEach(async () => {
    jest.useRealTimers();
    await rm(directory, { recursive: true, force: true });

    if (originalDirectory === undefined) {
      delete process.env.PUBLISH_FILE_SINK_DIR;
    } else {
      process.env.PUBLISH_FILE_SINK_DIR = originalDirectory;
    }
  });

  it('is disabled for missing or relative configuration', () => {
    expect(getPublishFileSinkDirectory()).toBeUndefined();

    process.env.PUBLISH_FILE_SINK_DIR = 'relative-output';
    expect(getPublishFileSinkDirectory()).toBeUndefined();
  });

  it('writes JSON without tokens and returns the filename', async () => {
    const nestedDirectory = join(directory, 'nested', 'output');
    process.env.PUBLISH_FILE_SINK_DIR = nestedDirectory;

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-12T19:47:00.000Z'));

    const filename = await sinkOutboundPublish({
      action: 'post',
      provider: 'x',
      integrationId: 'int-1',
      internalId: 'acct-1',
      name: 'My X',
      posts: [
        {
          id: 'root-post',
          message: 'Hello sink',
          settings: { __type: 'x' },
          media: [],
        },
      ],
    });

    expect(filename).toBe('2026-08-12-19-47-00-x-post.json');
    expect(getPublishFileSinkDirectory()).toBe(nestedDirectory);

    const written = JSON.parse(
      await readFile(join(nestedDirectory, filename), 'utf8')
    );

    expect(written).toEqual({
      action: 'post',
      provider: 'x',
      integrationId: 'int-1',
      internalId: 'acct-1',
      name: 'My X',
      posts: [
        {
          id: 'root-post',
          message: 'Hello sink',
          settings: { __type: 'x' },
          media: [],
        },
      ],
    });
    expect(JSON.stringify(written)).not.toMatch(/token/i);
  });

  it('allocates distinct names without overwriting same-second collisions', async () => {
    process.env.PUBLISH_FILE_SINK_DIR = directory;
    const initialFilename = '2026-08-12-19-47-00-x-post.json';

    await writeFile(
      join(directory, initialFilename),
      '{"existing":true}',
      'utf8'
    );
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-12T19:47:00.000Z'));

    const first = await sinkOutboundPublish({
      action: 'post',
      provider: 'x',
      integrationId: 'int-1',
      internalId: 'acct-1',
      name: 'My X',
      posts: [{ id: 'a', message: 'first' }],
    });
    const second = await sinkOutboundPublish({
      action: 'post',
      provider: 'x',
      integrationId: 'int-1',
      internalId: 'acct-1',
      name: 'My X',
      posts: [{ id: 'b', message: 'second' }],
    });
    const comment = await sinkOutboundPublish({
      action: 'comment',
      provider: 'x',
      integrationId: 'int-1',
      internalId: 'acct-1',
      name: 'My X',
      posts: [{ id: 'c', message: 'thread' }],
      extra: { postId: 'parent' },
    });

    expect(first).toBe('2026-08-12-19-47-01-x-post.json');
    expect(second).toBe('2026-08-12-19-47-02-x-post.json');
    expect(comment).toBe('2026-08-12-19-47-00-x-comment.json');
    expect(await readFile(join(directory, initialFilename), 'utf8')).toBe(
      '{"existing":true}'
    );
    expect(
      JSON.parse(await readFile(join(directory, first), 'utf8')).posts[0]
        .message
    ).toBe('first');
    expect(
      JSON.parse(await readFile(join(directory, second), 'utf8')).posts[0]
        .message
    ).toBe('second');
    expect(
      JSON.parse(await readFile(join(directory, comment), 'utf8')).extra
    ).toEqual({ postId: 'parent' });
  });
});

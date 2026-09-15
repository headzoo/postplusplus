import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InstagramDto } from './instagram.dto';

const validateSettings = (input: object) =>
  validate(plainToInstance(InstagramDto, input), {
    skipMissingProperties: false,
  });

describe('InstagramDto', () => {
  it('allows a missing post type so pipeline saves do not require opening Instagram settings', async () => {
    await expect(validateSettings({})).resolves.toHaveLength(0);
  });

  it('allows an empty post type from the composer placeholder', async () => {
    await expect(validateSettings({ post_type: '' })).resolves.toHaveLength(0);
  });

  it('accepts feed posts and stories', async () => {
    await expect(validateSettings({ post_type: 'post' })).resolves.toHaveLength(
      0
    );
    await expect(
      validateSettings({ post_type: 'story' })
    ).resolves.toHaveLength(0);
  });

  it('rejects unknown post types', async () => {
    const errors = await validateSettings({ post_type: 'article' });
    expect(errors).not.toHaveLength(0);
    expect(JSON.stringify(errors)).toContain('post');
    expect(JSON.stringify(errors)).toContain('story');
  });
});

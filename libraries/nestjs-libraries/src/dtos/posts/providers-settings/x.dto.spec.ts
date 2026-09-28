import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { XDto } from './x.dto';

const validateSettings = (input: object) =>
  validate(plainToInstance(XDto, input), {
    skipMissingProperties: false,
  });

describe('XDto', () => {
  it('allows a missing reply audience so pipeline and autopost saves do not require opening X settings', async () => {
    await expect(validateSettings({})).resolves.toHaveLength(0);
  });

  it('allows an empty reply audience from the composer placeholder', async () => {
    await expect(
      validateSettings({ who_can_reply_post: '' })
    ).resolves.toHaveLength(0);
  });

  it('accepts each supported reply audience', async () => {
    for (const who_can_reply_post of [
      'everyone',
      'following',
      'mentionedUsers',
      'subscribers',
      'verified',
    ] as const) {
      await expect(
        validateSettings({ who_can_reply_post })
      ).resolves.toHaveLength(0);
    }
  });

  it('rejects unknown reply audiences', async () => {
    const errors = await validateSettings({ who_can_reply_post: 'friends' });
    expect(errors).not.toHaveLength(0);
    expect(JSON.stringify(errors)).toContain('everyone');
    expect(JSON.stringify(errors)).toContain('verified');
  });

  it('does not require a reply audience for articles', async () => {
    await expect(
      validateSettings({
        post_type: 'article',
        article_title: 'A long-form article',
        article_status: 'draft',
      })
    ).resolves.toHaveLength(0);
  });
});

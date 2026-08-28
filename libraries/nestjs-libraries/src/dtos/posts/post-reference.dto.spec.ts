import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PostReferenceDto } from './post-reference.dto';

describe('PostReferenceDto', () => {
  it.each([
    [{ type: 'reply', providerIdentifier: 'x', externalId: '123' }],
    [{ type: 'quote', providerIdentifier: 'X', externalId: '123' }],
    [{ type: 'quote', providerIdentifier: 'x', externalId: 'bad id' }],
    [
      {
        type: 'quote',
        providerIdentifier: 'x',
        externalId: '123',
        url: 'javascript:alert(1)',
      },
    ],
  ])('rejects malformed quote references', async (input) => {
    await expect(
      validate(plainToInstance(PostReferenceDto, input))
    ).resolves.not.toHaveLength(0);
  });
});

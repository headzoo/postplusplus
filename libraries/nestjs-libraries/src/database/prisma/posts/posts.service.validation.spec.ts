import { BadRequestException } from '@nestjs/common';

jest.mock('@gitroom/helpers/utils/sanitize.post.content', () => ({
  sanitizePostContent: (value: string) => value,
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));

import { PostsService } from './posts.service';

describe('PostsService post references', () => {
  const reference = {
    type: 'quote' as const,
    providerIdentifier: 'x',
    externalId: '123456789',
  };

  const service = (provider: any) => {
    const instance = Object.create(PostsService.prototype) as any;
    instance._integrationManager = {
      getSocialIntegration: jest.fn().mockReturnValue(provider),
    };
    return instance;
  };

  it('rejects references that target another provider', () => {
    expect(() =>
      service({
        name: 'X',
        postReferences: { quote: true },
      }).validatePostReference(
        { value: [{ reference }], settings: {} },
        { providerIdentifier: 'linkedin' }
      )
    ).toThrow(BadRequestException);
  });

  it('rejects references on comments and unsupported providers', () => {
    expect(() =>
      service({
        name: 'X',
        postReferences: { quote: true },
      }).validatePostReference(
        { value: [{}, { reference }], settings: {} },
        { providerIdentifier: 'x' }
      )
    ).toThrow('first post in a thread');

    expect(() =>
      service({ name: 'LinkedIn' }).validatePostReference(
        { value: [{ reference }], settings: {} },
        { providerIdentifier: 'x' }
      )
    ).toThrow('does not support quote post references');
  });
});

import { BadRequestException, HttpException } from '@nestjs/common';
import { ChannelWebhooksController } from './channel-webhooks.controller';

jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));

const sinkIncomingWebhook = jest.fn();
jest.mock('@gitroom/nestjs-libraries/integrations/webhook.file.sink', () => ({
  sinkIncomingWebhook: (...args: unknown[]) => sinkIncomingWebhook(...args),
}));

describe('ChannelWebhooksController', () => {
  const service = {
    handleChallenge: jest.fn(),
    handleDelivery: jest.fn(),
    logInboundAttempt: jest.fn().mockResolvedValue(undefined),
    statusFromError: jest.fn((error: unknown) =>
      error instanceof HttpException ? error.getStatus() : 500
    ),
    messageFromError: jest.fn((error: unknown) =>
      error instanceof Error ? error.message : 'Channel webhook request failed'
    ),
  };
  const controller = new ChannelWebhooksController(service as any);

  beforeEach(() => {
    jest.clearAllMocks();
    sinkIncomingWebhook.mockResolvedValue(undefined);
  });

  it('delegates a bounded challenge without an organization context', async () => {
    service.handleChallenge.mockResolvedValue({
      accepted: true,
      responseBody: { response_token: 'sha256=challenge' },
      logged: true,
    });

    await expect(
      controller.challenge('x', { crc_token: 'challenge' })
    ).resolves.toEqual({ response_token: 'sha256=challenge' });
    expect(sinkIncomingWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        providerIdentifier: 'x',
        query: { crc_token: 'challenge' },
      })
    );
    expect(service.handleChallenge).toHaveBeenCalledWith('x', {
      query: { crc_token: 'challenge' },
    });
    expect(service.logInboundAttempt).not.toHaveBeenCalled();
  });

  it('rejects missing raw bodies before provider verification', async () => {
    await expect(
      controller.delivery('x', { rawBody: undefined, headers: {} } as any)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sinkIncomingWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        providerIdentifier: 'x',
        rawBody: undefined,
      })
    );
    expect(service.handleDelivery).not.toHaveBeenCalled();
    expect(service.logInboundAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        providerIdentifier: 'x',
        method: 'POST',
        statusCode: 400,
        error: 'Missing raw webhook body',
      })
    );
  });

  it('returns a non-2xx error for an invalid provider signature', async () => {
    service.handleDelivery.mockResolvedValue({
      accepted: false,
      statusCode: 401,
      logged: true,
    });

    await expect(
      controller.delivery('x', {
        rawBody: Buffer.from('{}'),
        headers: { 'x-twitter-webhooks-signature': 'invalid' },
      } as any)
    ).rejects.toMatchObject<HttpException>({ status: 401 });
    expect(service.logInboundAttempt).not.toHaveBeenCalled();
  });

  it('acknowledges valid duplicate deliveries', async () => {
    service.handleDelivery.mockResolvedValue({
      accepted: true,
      connectedAccountId: 'account-1',
      events: [],
      logged: true,
    });

    await expect(
      controller.delivery('x', {
        rawBody: Buffer.from('{}'),
        headers: { 'x-twitter-webhooks-signature': 'valid' },
      } as any)
    ).resolves.toEqual({ ok: true });
  });

  it('rejects providers without the webhook capability', async () => {
    service.handleDelivery.mockRejectedValue(
      new HttpException('Channel webhook provider is unavailable', 404)
    );

    await expect(
      controller.delivery('unsupported', {
        rawBody: Buffer.from('{}'),
        headers: {},
      } as any)
    ).rejects.toMatchObject<HttpException>({ status: 404 });
    expect(service.logInboundAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        providerIdentifier: 'unsupported',
        statusCode: 404,
        error: 'Channel webhook provider is unavailable',
      })
    );
  });

  it('logs invalid provider slugs before the service runs', async () => {
    await expect(
      controller.delivery('not valid!', {
        rawBody: Buffer.from('{}'),
        headers: {},
      } as any)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.handleDelivery).not.toHaveBeenCalled();
    expect(service.logInboundAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        providerIdentifier: 'invalid',
        statusCode: 400,
        error: 'Invalid channel webhook provider',
      })
    );
  });

  it('sanitizes oversized request headers instead of rejecting the delivery', async () => {
    service.handleDelivery.mockResolvedValue({
      accepted: true,
      connectedAccountId: 'account-1',
      events: [],
      logged: true,
    });
    const headers: Record<string, string> = {};
    for (let i = 0; i < 80; i++) {
      headers[`x-forwarded-extra-${i}`] = 'x'.repeat(5000);
    }
    headers['x-twitter-webhooks-signature'] = 'sha256=valid';

    await expect(
      controller.delivery('x', {
        rawBody: Buffer.from('{}'),
        headers,
      } as any)
    ).resolves.toEqual({ ok: true });

    const passed = service.handleDelivery.mock.calls[0][1].headers;
    expect(Object.keys(passed)).toHaveLength(64);
    expect(passed['x-twitter-webhooks-signature']).toBe('sha256=valid');
    expect(passed['x-forwarded-extra-0']).toHaveLength(4096);
    expect(sinkIncomingWebhook).toHaveBeenCalled();
  });
});

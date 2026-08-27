import { Logger } from '@nestjs/common';
import { TemporalRegister } from './temporal.register';

const originalEnvironment = { ...process.env };

const waitForBackgroundTask = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

describe('TemporalRegister', () => {
  const listSearchAttributes = jest.fn();
  const addSearchAttributes = jest.fn();
  const temporalService = {
    client: {
      getRawClient: () => ({
        connection: {
          operatorService: {
            listSearchAttributes,
            addSearchAttributes,
          },
        },
      }),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnvironment };
    delete process.env.TEMPORAL_TLS;
    delete process.env.TEMPORAL_NAMESPACE;
    delete process.env.TEMPORAL_ADDRESS;
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('returns before a pending Temporal search-attribute RPC completes', async () => {
    let resolveListSearchAttributes: (value: {
      customAttributes: Record<string, number>;
    }) => void;
    listSearchAttributes.mockReturnValue(
      new Promise((resolve) => {
        resolveListSearchAttributes = resolve;
      })
    );

    const register = new TemporalRegister(temporalService as any);

    expect(register.onModuleInit()).toBeUndefined();
    expect(listSearchAttributes).toHaveBeenCalledWith({ namespace: 'default' });
    expect(addSearchAttributes).not.toHaveBeenCalled();

    resolveListSearchAttributes!({ customAttributes: {} });
    await waitForBackgroundTask();

    expect(addSearchAttributes).toHaveBeenCalledWith({
      namespace: 'default',
      searchAttributes: { organizationId: 1, postId: 1 },
    });
  });

  it.each([
    [
      'list',
      () => listSearchAttributes.mockRejectedValue(new Error('unavailable')),
    ],
    [
      'add',
      () => {
        listSearchAttributes.mockResolvedValue({ customAttributes: {} });
        addSearchAttributes.mockRejectedValue(new Error('forbidden'));
      },
    ],
  ])('logs an eventual %s search-attribute failure', async (_, setup) => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    setup();

    new TemporalRegister(temporalService as any).onModuleInit();
    await waitForBackgroundTask();

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to register Temporal search attributes (address: localhost:7233, namespace: default)',
      expect.any(Error)
    );
  });

  it('logs an unavailable raw Temporal connection', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    new TemporalRegister({ client: undefined } as any).onModuleInit();
    await waitForBackgroundTask();

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to register Temporal search attributes (address: localhost:7233, namespace: default)',
      expect.objectContaining({
        message:
          'Temporal connection unavailable while registering search attributes',
      })
    );
  });
});

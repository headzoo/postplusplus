import { ConversionEvaluationTriggerService } from './conversion-evaluation.trigger.service';

describe('ConversionEvaluationTriggerService', () => {
  const createService = () => {
    const signal = jest.fn().mockResolvedValue(undefined);
    const workflow = { getHandle: jest.fn().mockReturnValue({ signal }) };
    const service = new ConversionEvaluationTriggerService({
      client: { getRawClient: () => ({ workflow }) },
    } as any);
    return { service, signal };
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends at most one signal per cadence', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-14T12:00:00.000Z') });
    const { service, signal } = createService();

    await expect(service.signal()).resolves.toBe(true);
    await expect(service.signal()).resolves.toBe(false);
    jest.setSystemTime(new Date('2026-10-14T12:00:29.000Z'));
    await expect(service.signal()).resolves.toBe(false);
    jest.setSystemTime(new Date('2026-10-14T12:00:30.000Z'));
    await expect(service.signal()).resolves.toBe(true);

    expect(signal).toHaveBeenCalledTimes(2);
  });
});

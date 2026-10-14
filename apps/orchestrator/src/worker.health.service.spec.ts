import { WorkerHealthService } from './worker.health.service';

describe('WorkerHealthService', () => {
  const createService = (workers: Record<string, boolean> | null) => {
    const getAllWorkers = jest.fn(() =>
      workers
        ? {
            workers: new Map(
              Object.entries(workers).map(([taskQueue, isRunning]) => [
                taskQueue,
                { isRunning },
              ])
            ),
          }
        : null
    );
    return {
      service: new WorkerHealthService({ getAllWorkers } as any),
      workers,
    };
  };

  let exit: jest.SpyInstance;
  beforeEach(() => {
    exit = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
  });
  afterEach(() => {
    exit.mockRestore();
  });

  it('reports queues whose worker is not running', () => {
    const { service } = createService({ main: true, x: false });

    expect(service.getStoppedWorkers()).toEqual(['x']);
  });

  it('treats a missing worker manager as all stopped', () => {
    const { service } = createService(null);

    expect(service.getStoppedWorkers()).toEqual(['all']);
  });

  it('treats a deployment configured without workers as healthy', () => {
    const { service } = createService({});

    expect(service.getStoppedWorkers()).toEqual([]);
  });

  it('exits once a worker has been stopped for two minutes', () => {
    const { service } = createService({ main: true, x: false });

    service.check(0);
    service.check(119_000);
    expect(exit).not.toHaveBeenCalled();

    service.check(120_000);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('forgets a worker that recovered', () => {
    const { service, workers } = createService({ main: true, x: false });

    service.check(0);
    workers!.x = true;
    service.check(60_000);
    workers!.x = false;
    service.check(90_000);
    service.check(200_000);
    expect(exit).not.toHaveBeenCalled();

    service.check(210_000);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

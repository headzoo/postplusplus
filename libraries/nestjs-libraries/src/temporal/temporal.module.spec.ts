const register = jest.fn((options) => ({ options }));
const registerAsync = jest.fn((options) => ({ options }));
const bundleWorkflowCode = jest.fn();

jest.mock('nestjs-temporal-core', () => ({
  TemporalModule: {
    register,
    registerAsync,
  },
}));

jest.mock('@temporalio/worker', () => ({
  bundleWorkflowCode,
}));

jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  socialIntegrationList: [
    { identifier: 'x', maxConcurrentJob: 10 },
    { identifier: 'linkedin', maxConcurrentJob: 3 },
    { identifier: 'facebook-page', maxConcurrentJob: 5 },
    { identifier: 'unlimited' },
  ],
}));

import { getTemporalModule } from './temporal.module';

const originalEnvironment = { ...process.env };

const getWorkerOptions = async () => {
  const module = getTemporalModule(true, '/workflows', [class Activity {}]) as {
    options: { useFactory: () => Promise<any> };
  };

  return module.options.useFactory();
};

describe('getTemporalModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnvironment };
    delete process.env.TEMPORAL_WORKER_MODE;
    delete process.env.EXCLUDE_QUEUE;
    delete process.env.WORKER_CONCURRENCY_DIVIDER;
    bundleWorkflowCode.mockResolvedValue({ code: 'workflow-bundle' });
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('registers client-only options without bundling workflows', () => {
    getTemporalModule(false);

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueue: 'main',
        connection: expect.objectContaining({ namespace: 'default' }),
      })
    );
    expect(registerAsync).not.toHaveBeenCalled();
    expect(bundleWorkflowCode).not.toHaveBeenCalled();
  });

  it('bundles once and shares the bundle across all full-mode workers', async () => {
    const options = await getWorkerOptions();

    expect(bundleWorkflowCode).toHaveBeenCalledTimes(1);
    expect(bundleWorkflowCode).toHaveBeenCalledWith({
      workflowsPath: '/workflows',
    });
    expect(options.workers).toHaveLength(4);
    expect(
      options.workers.every((worker) => !('workflowsPath' in worker))
    ).toBe(true);
    expect(
      options.workers.every(
        (worker) => worker.workflowBundle === options.workers[0].workflowBundle
      )
    ).toBe(true);
  });

  it('creates only the main worker in main mode', async () => {
    process.env.TEMPORAL_WORKER_MODE = 'main';

    const options = await getWorkerOptions();

    expect(options.workers).toHaveLength(1);
    expect(options.workers[0]).toMatchObject({ taskQueue: 'main' });
  });

  it('preserves full-mode queue exclusions and divided provider concurrency', async () => {
    process.env.EXCLUDE_QUEUE = 'linkedin';
    process.env.WORKER_CONCURRENCY_DIVIDER = '2';

    const options = await getWorkerOptions();

    expect(options.workers.map((worker) => worker.taskQueue)).toEqual([
      'main',
      'x',
      'unlimited',
    ]);
    expect(
      options.workers.find((worker) => worker.taskQueue === 'x')
    ).toMatchObject({
      workerOptions: { maxConcurrentActivityTaskExecutions: 5 },
    });
    expect(
      options.workers.find((worker) => worker.taskQueue === 'unlimited')
    ).toMatchObject({
      workerOptions: { maxConcurrentActivityTaskExecutions: 1000000 },
    });
  });
});

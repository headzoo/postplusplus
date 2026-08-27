import { TemporalModule } from 'nestjs-temporal-core';
import {
  bundleWorkflowCode,
  type WorkflowBundleWithSourceMap,
} from '@temporalio/worker';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';

const getConnectionOptions = () => ({
  isGlobal: true,
  connection: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    ...(process.env.TEMPORAL_TLS === 'true' ? { tls: true } : {}),
    ...(process.env.TEMPORAL_API_KEY
      ? { apiKey: process.env.TEMPORAL_API_KEY }
      : {}),
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
  },
  taskQueue: 'main',
  logLevel: 'error' as const,
});

const getWorkerMode = () => {
  const mode = process.env.TEMPORAL_WORKER_MODE;

  if (!mode || mode === 'all') {
    return 'all';
  }

  if (mode === 'main') {
    return 'main';
  }

  throw new Error(
    `Unsupported TEMPORAL_WORKER_MODE "${mode}". Use "main" or "all".`
  );
};

const getWorkerDefinitions = (
  workflowBundle: WorkflowBundleWithSourceMap,
  activityClasses: any[],
  mode: 'main' | 'all'
) => {
  const excludeQueues = (process.env.EXCLUDE_QUEUE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const divider = Math.max(
    1,
    Number(process.env.WORKER_CONCURRENCY_DIVIDER) || 1
  );

  const integrations =
    mode === 'main'
      ? [{ identifier: 'main', maxConcurrentJob: undefined }]
      : [
          { identifier: 'main', maxConcurrentJob: undefined },
          ...socialIntegrationList,
        ];

  return integrations
    .filter((integration) => integration.identifier.indexOf('-') === -1)
    .map((integration) => ({
      integration,
      taskQueue: integration.identifier.split('-')[0],
    }))
    .filter(({ taskQueue }) => !excludeQueues.includes(taskQueue))
    .map(({ integration, taskQueue }) => {
      const concurrency = integration.maxConcurrentJob
        ? Math.max(1, Math.floor(integration.maxConcurrentJob / divider))
        : undefined;

      return {
        taskQueue,
        workflowBundle: workflowBundle as unknown as Record<string, unknown>,
        activityClasses,
        autoStart: true,
        ...(concurrency
          ? {
              workerOptions: {
                maxConcurrentActivityTaskExecutions: concurrency,
              },
            }
          : {
              workerOptions: {
                maxConcurrentActivityTaskExecutions: 1000000,
              },
            }),
      };
    });
};

export const getTemporalModule = (
  isWorkers: boolean,
  path?: string,
  activityClasses?: any[]
) => {
  if (!isWorkers) {
    return TemporalModule.register(getConnectionOptions());
  }

  return TemporalModule.registerAsync({
    isGlobal: true,
    useFactory: async () => {
      if (!path) {
        throw new Error(
          'A workflows path is required when workers are enabled.'
        );
      }

      const mode = getWorkerMode();
      const workflowBundle = await bundleWorkflowCode({
        workflowsPath: path,
      });

      return {
        ...getConnectionOptions(),
        workers: getWorkerDefinitions(
          workflowBundle,
          activityClasses || [],
          mode
        ),
      };
    },
  });
};

import * as Sentry from '@sentry/nestjs';
import { capitalize } from 'lodash';

export const setSentryUserContext = (params: {
  userId?: string;
  email?: string;
  orgId?: string;
  paymentId?: string | null;
}) => {
  try {
    Sentry.setUser(
      params.userId
        ? {
            id: params.userId,
            ...(params.email ? { email: params.email } : {}),
          }
        : null
    );
    if (params.orgId) {
      Sentry.setTag('organization.id', params.orgId);
    }
    if (params.paymentId?.startsWith('cus_')) {
      Sentry.setTag('stripe.customer_id', params.paymentId);
    }
  } catch (err) {
    /* never let telemetry break a request */
  }
};

export const initializeSentry = (appName: string, allowLogs = false) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return null;
  }

  // Loads a native addon, so only pay for it when Sentry is enabled.
  let profilingIntegrations: ReturnType<
    typeof import('@sentry/profiling-node').nodeProfilingIntegration
  >[] = [];
  try {
    const { nodeProfilingIntegration } =
      require('@sentry/profiling-node') as typeof import('@sentry/profiling-node');
    profilingIntegrations = [nodeProfilingIntegration()];
  } catch (err) {
    console.log(err);
  }

  try {
    Sentry.init({
      initialScope: {
        tags: {
          service: appName,
          component: 'nestjs',
        },
        contexts: {
          app: {
            name: `Postiz ${capitalize(appName)}`,
          },
        },
      },
      environment: process.env.NODE_ENV || 'development',
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      spotlight: process.env.SENTRY_SPOTLIGHT === '1',
      integrations: [
        ...profilingIntegrations,
        Sentry.consoleLoggingIntegration({
          levels: ['log', 'info', 'warn', 'error', 'debug', 'assert', 'trace'],
        }),
        Sentry.openAIIntegration({
          recordInputs: true,
          recordOutputs: true,
        }),
      ],
      tracesSampleRate: 1.0,
      enableLogs: true,

      // Profiling
      profileSessionSampleRate:
        process.env.NODE_ENV === 'development' ? 1.0 : 0.45,
      profileLifecycle: 'trace',
    });
  } catch (err) {
    console.log(err);
  }
  return true;
};

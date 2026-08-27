'use client';

import { useMemo } from 'react';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { usePipelineList } from '@gitroom/frontend/components/pipelines/use.pipeline.list';
import { useRuleCapabilities } from '@gitroom/frontend/components/rules/use.rule.capabilities';
import {
  PostRuleAction,
  PostRuleConditionMetric,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';

export interface RuleAssignmentOption {
  id: string;
  name: string;
  identifier?: string;
  type: 'integration' | 'pipeline';
  disabled?: boolean;
  disabledReason?: string;
}

export const useRuleAssignmentOptions = (
  action?: PostRuleAction,
  metrics?: PostRuleConditionMetric[]
) => {
  const { data: integrations = [], isLoading: integrationsLoading } =
    useIntegrationList();
  const { data: pipelines = [], isLoading: pipelinesLoading } =
    usePipelineList();
  const { data: capabilities } = useRuleCapabilities();

  const integrationOptions = useMemo<RuleAssignmentOption[]>(() => {
    if (!capabilities) {
      return integrations.map((integration) => ({
        id: integration.id,
        name: integration.name,
        identifier: integration.identifier,
        type: 'integration' as const,
      }));
    }

    const providerCapsByIdentifier = new Map(
      capabilities.providers.map((p) => [p.providerIdentifier, p])
    );

    return integrations.map((integration) => {
      const providerCaps = providerCapsByIdentifier.get(integration.identifier);
      if (!providerCaps) {
        return {
          id: integration.id,
          name: integration.name,
          identifier: integration.identifier,
          type: 'integration' as const,
          disabled: true,
          disabledReason: 'Provider does not support Rules',
        };
      }

      if (action && !providerCaps.actions.includes(action)) {
        return {
          id: integration.id,
          name: integration.name,
          identifier: integration.identifier,
          type: 'integration' as const,
          disabled: true,
          disabledReason: `Provider does not support ${action}`,
        };
      }

      if (metrics && metrics.length > 0) {
        const unsupportedMetrics = metrics.filter(
          (m) => !providerCaps.metrics.includes(m)
        );
        if (unsupportedMetrics.length > 0) {
          return {
            id: integration.id,
            name: integration.name,
            identifier: integration.identifier,
            type: 'integration' as const,
            disabled: true,
            disabledReason: `Provider does not support metrics: ${unsupportedMetrics.join(
              ', '
            )}`,
          };
        }
      }

      return {
        id: integration.id,
        name: integration.name,
        identifier: integration.identifier,
        type: 'integration' as const,
      };
    });
  }, [integrations, capabilities, action, metrics]);

  const pipelineOptions = useMemo<RuleAssignmentOption[]>(() => {
    return pipelines
      .filter((p) => p.active)
      .map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        type: 'pipeline' as const,
      }));
  }, [pipelines]);

  return {
    integrationOptions,
    pipelineOptions,
    isLoading: integrationsLoading || pipelinesLoading,
  };
};

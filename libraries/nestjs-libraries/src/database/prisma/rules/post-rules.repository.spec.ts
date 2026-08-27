import { BadRequestException } from '@nestjs/common';
import { PostRulesRepository } from './post-rules.repository';

describe('PostRulesRepository', () => {
  const createRepository = () => {
    const findManyRules = jest.fn();
    const findFirstRule = jest.fn();
    const createRule = jest.fn();
    const updateRule = jest.fn();
    const deleteManyRules = jest.fn();
    const findManyIntegrations = jest.fn();
    const findManyPipelines = jest.fn();
    const findFirstPipeline = jest.fn();
    const deleteManyIntegrations = jest.fn();
    const deleteManyPipelines = jest.fn();
    const createManyIntegrations = jest.fn();
    const createManyPipelines = jest.fn();
    const transaction = jest.fn(
      async (callback: (tx: any) => Promise<unknown>) =>
        callback({
          postRule: {
            findFirst: findFirstRule,
          },
          postRuleIntegration: {
            deleteMany: deleteManyIntegrations,
            createMany: createManyIntegrations,
          },
          postRulePipeline: {
            deleteMany: deleteManyPipelines,
            createMany: createManyPipelines,
          },
        })
    );

    const repository = Object.create(
      PostRulesRepository.prototype
    ) as PostRulesRepository;
    (repository as any)._postRule = {
      model: {
        postRule: {
          findMany: findManyRules,
          findFirst: findFirstRule,
          create: createRule,
          update: updateRule,
          deleteMany: deleteManyRules,
        },
      },
    };
    (repository as any)._integration = {
      model: {
        integration: {
          findMany: findManyIntegrations,
        },
      },
    };
    (repository as any)._pipeline = {
      model: {
        pipeline: {
          findMany: findManyPipelines,
          findFirst: findFirstPipeline,
        },
      },
    };
    (repository as any)._transaction = {
      model: {
        $transaction: transaction,
      },
    };

    return {
      repository,
      findManyRules,
      findFirstRule,
      createRule,
      updateRule,
      deleteManyRules,
      findManyIntegrations,
      findManyPipelines,
      findFirstPipeline,
      deleteManyIntegrations,
      deleteManyPipelines,
      createManyIntegrations,
      createManyPipelines,
      transaction,
    };
  };

  it('rejects duplicate assignment ids', () => {
    const { repository } = createRepository();

    expect(() =>
      repository.assertUniqueIds(
        ['channel-1', 'channel-1'],
        'channel assignments'
      )
    ).toThrow(BadRequestException);
  });

  it('replaces assignments atomically', async () => {
    const {
      repository,
      findFirstRule,
      deleteManyIntegrations,
      deleteManyPipelines,
      createManyIntegrations,
      createManyPipelines,
      transaction,
    } = createRepository();
    findFirstRule
      .mockResolvedValueOnce({ id: 'rule-1' })
      .mockResolvedValueOnce({
        id: 'rule-1',
        integrations: [{ integrationId: 'channel-2' }],
        pipelines: [{ pipelineId: 'pipeline-2' }],
      });

    await expect(
      repository.replaceAssignments(
        'org-1',
        'rule-1',
        ['channel-2'],
        ['pipeline-2']
      )
    ).resolves.toEqual({
      id: 'rule-1',
      integrations: [{ integrationId: 'channel-2' }],
      pipelines: [{ pipelineId: 'pipeline-2' }],
    });

    expect(transaction).toHaveBeenCalled();
    expect(deleteManyIntegrations).toHaveBeenCalledWith({
      where: { ruleId: 'rule-1', organizationId: 'org-1' },
    });
    expect(deleteManyPipelines).toHaveBeenCalledWith({
      where: { ruleId: 'rule-1', organizationId: 'org-1' },
    });
    expect(createManyIntegrations).toHaveBeenCalledWith({
      data: [
        {
          organizationId: 'org-1',
          ruleId: 'rule-1',
          integrationId: 'channel-2',
        },
      ],
    });
    expect(createManyPipelines).toHaveBeenCalledWith({
      data: [
        {
          organizationId: 'org-1',
          ruleId: 'rule-1',
          pipelineId: 'pipeline-2',
        },
      ],
    });
  });

  it('scopes delete to the organization', async () => {
    const { repository, deleteManyRules } = createRepository();
    deleteManyRules.mockResolvedValue({ count: 0 });

    await expect(repository.delete('org-1', 'rule-1')).resolves.toBe(false);
    expect(deleteManyRules).toHaveBeenCalledWith({
      where: { id: 'rule-1', organizationId: 'org-1' },
    });
  });
});

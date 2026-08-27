jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));

import { RulesController } from './rules.controller';

describe('RulesController', () => {
  const organization = { id: 'org-1' } as any;
  const service = {
    getCapabilities: jest.fn(),
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    setEnabled: jest.fn(),
    replaceAssignments: jest.fn(),
  };
  const controller = new RulesController(service as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes capability discovery without org scope', () => {
    service.getCapabilities.mockReturnValue({ actions: [], providers: [] });

    expect(controller.getCapabilities()).toEqual({
      actions: [],
      providers: [],
    });
    expect(service.getCapabilities).toHaveBeenCalled();
  });

  it('delegates org-scoped lifecycle endpoints', async () => {
    service.list.mockResolvedValue([{ id: 'rule-1' }]);
    service.getById.mockResolvedValue({ id: 'rule-1' });
    service.create.mockResolvedValue({ id: 'rule-1' });
    service.update.mockResolvedValue({ id: 'rule-1' });
    service.delete.mockResolvedValue({ id: 'rule-1' });
    service.setEnabled.mockResolvedValue({ id: 'rule-1', enabled: false });
    service.replaceAssignments.mockResolvedValue({
      id: 'rule-1',
      integrationIds: ['channel-1'],
      pipelineIds: [],
    });

    await expect(controller.listRules(organization)).resolves.toEqual([
      { id: 'rule-1' },
    ]);
    await expect(controller.getRule(organization, 'rule-1')).resolves.toEqual({
      id: 'rule-1',
    });
    await expect(
      controller.createRule(organization, {
        name: 'Rule',
        action: 'REMOVE',
        initialDelayHours: 1,
        conditionMatch: 'ANY',
        conditions: [],
      })
    ).resolves.toEqual({ id: 'rule-1' });
    await expect(
      controller.updateRule(organization, 'rule-1', {
        name: 'Rule',
        action: 'REMOVE',
        initialDelayHours: 1,
        conditionMatch: 'ANY',
        conditions: [],
      })
    ).resolves.toEqual({ id: 'rule-1' });
    await expect(
      controller.deleteRule(organization, 'rule-1')
    ).resolves.toEqual({
      id: 'rule-1',
    });
    await expect(
      controller.setRuleActivation(organization, 'rule-1', { enabled: false })
    ).resolves.toEqual({ id: 'rule-1', enabled: false });
    await expect(
      controller.replaceAssignments(organization, 'rule-1', {
        integrationIds: ['channel-1'],
        pipelineIds: [],
      })
    ).resolves.toEqual({
      id: 'rule-1',
      integrationIds: ['channel-1'],
      pipelineIds: [],
    });

    expect(service.list).toHaveBeenCalledWith('org-1');
    expect(service.getById).toHaveBeenCalledWith('org-1', 'rule-1');
    expect(service.create).toHaveBeenCalledWith('org-1', expect.any(Object));
    expect(service.update).toHaveBeenCalledWith(
      'org-1',
      'rule-1',
      expect.any(Object)
    );
    expect(service.delete).toHaveBeenCalledWith('org-1', 'rule-1');
    expect(service.setEnabled).toHaveBeenCalledWith('org-1', 'rule-1', {
      enabled: false,
    });
    expect(service.replaceAssignments).toHaveBeenCalledWith('org-1', 'rule-1', {
      integrationIds: ['channel-1'],
      pipelineIds: [],
    });
  });
});

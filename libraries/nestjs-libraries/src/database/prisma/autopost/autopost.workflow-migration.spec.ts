jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationService {} })
);

import { AutopostService } from './autopost.service';

describe('AutopostService workflow migration', () => {
  const createService = (
    running: string[],
    autoposts: Record<string, { active: boolean }>
  ) => {
    const repository = {
      getAutopostForWorkflow: jest.fn(async (id: string) =>
        autoposts[id] ? { id, organizationId: 'org', ...autoposts[id] } : null
      ),
    };
    const terminate = jest.fn().mockResolvedValue(undefined);
    const start = jest.fn().mockResolvedValue(undefined);
    const list = jest.fn(async function* () {
      for (const workflowId of running) {
        yield { workflowId };
      }
    });
    const workflow = {
      list,
      start,
      getHandle: jest.fn(() => ({ terminate })),
    };
    const service = new AutopostService(
      repository as any,
      { client: { getRawClient: () => ({ workflow }) } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    return { service, list, terminate, start, workflow };
  };

  it('replaces running legacy runs with V3 for active autoposts', async () => {
    const { service, list, terminate, start, workflow } = createService(
      ['autopost-feed', 'autopost-paused', 'autopost-deleted'],
      { feed: { active: true }, paused: { active: false } }
    );

    await service.migrateAutopostWorkflows();

    expect(list).toHaveBeenCalledWith({
      query:
        "(WorkflowType='autoPostWorkflow' OR WorkflowType='autoPostWorkflowV2') AND ExecutionStatus='Running'",
    });
    expect(workflow.getHandle).toHaveBeenCalledWith('autopost-feed');
    expect(workflow.getHandle).toHaveBeenCalledWith('autopost-paused');
    expect(workflow.getHandle).toHaveBeenCalledWith('autopost-deleted');
    expect(terminate).toHaveBeenCalledTimes(3);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(
      'autoPostWorkflowV3',
      expect.objectContaining({
        workflowId: 'autopost-feed',
        args: [{ id: 'feed', immediately: false }],
      })
    );
  });

  it('does nothing when no legacy runs are running', async () => {
    const { service, terminate, start } = createService([], {
      feed: { active: true },
    });

    await service.migrateAutopostWorkflows();

    expect(terminate).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('keeps migrating the remaining runs when one fails', async () => {
    const { service, terminate, start } = createService(
      ['autopost-broken', 'autopost-feed'],
      { broken: { active: true }, feed: { active: true } }
    );
    terminate.mockRejectedValueOnce(new Error('temporal timeout'));

    await expect(service.migrateAutopostWorkflows()).resolves.toBeUndefined();

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(
      'autoPostWorkflowV3',
      expect.objectContaining({ workflowId: 'autopost-feed' })
    );
  });
});

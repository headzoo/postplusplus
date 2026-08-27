import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, validateSync } from 'class-validator';

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationService {} })
);

import { PipelineAutopostDto } from '@gitroom/nestjs-libraries/dtos/autopost/autopost.dto';
import { AutopostService } from './autopost.service';

describe('Pipeline autopost boundaries', () => {
  const body = {
    title: 'Feed',
    content: 'Template',
    lastUrl: '',
    syncLast: true,
    url: 'https://example.com/rss.xml',
    active: true,
    addPicture: false,
    generateContent: false,
  };

  const createService = () => {
    const repository = {
      getPipeline: jest.fn().mockResolvedValue({ id: 'pipeline' }),
      getPipelineAutoposts: jest.fn().mockResolvedValue([]),
      createPipelineAutopost: jest
        .fn()
        .mockResolvedValue({ id: 'feed', active: true }),
      updatePipelineAutopost: jest.fn(),
      changePipelineAutopostActive: jest.fn(),
      deletePipelineAutopost: jest.fn(),
      disablePipelineAutoposts: jest.fn().mockResolvedValue([]),
    };
    const start = jest.fn().mockResolvedValue(undefined);
    const temporal = {
      client: { getRawClient: () => ({ workflow: { start } }) },
      terminateWorkflow: jest.fn().mockResolvedValue(undefined),
    };
    return {
      repository,
      temporal,
      start,
      service: new AutopostService(
        repository as any,
        temporal as any,
        {} as any,
        {} as any,
        {} as any
      ),
    };
  };

  it('accepts only the Pipeline feed contract and rejects unsafe URLs', async () => {
    expect(
      validateSync(plainToInstance(PipelineAutopostDto, body))
    ).toHaveLength(0);

    const errors = await validate(
      plainToInstance(PipelineAutopostDto, {
        ...body,
        url: 'http://127.0.0.1/internal.xml',
        integrations: [{ id: 'must-not-be-accepted' }],
        onSlot: false,
      })
    );
    expect(errors.some((error) => error.property === 'url')).toBe(true);
    expect(errors.some((error) => error.property === 'integrations')).toBe(
      false
    );
    expect(errors.some((error) => error.property === 'onSlot')).toBe(false);
  });

  it('starts V2 workflows for Pipeline feed creation', async () => {
    const { service, repository, start } = createService();

    await expect(
      service.createPipelineAutopost('org', 'pipeline', body)
    ).resolves.toMatchObject({ id: 'feed' });

    expect(repository.getPipeline).toHaveBeenCalledWith('org', 'pipeline');
    expect(repository.createPipelineAutopost).toHaveBeenCalledWith(
      'org',
      'pipeline',
      body
    );
    expect(start).toHaveBeenCalledWith(
      'autoPostWorkflowV2',
      expect.objectContaining({
        workflowId: 'autopost-feed',
        taskQueue: 'main',
        args: [{ id: 'feed', immediately: true }],
      })
    );
  });

  it('keeps an active feed workflow running after an update', async () => {
    const { service, repository, temporal, start } = createService();
    repository.updatePipelineAutopost.mockResolvedValue({
      id: 'feed',
      active: true,
    });
    start.mockRejectedValue({
      name: 'WorkflowExecutionAlreadyStartedError',
    });

    await expect(
      service.updatePipelineAutopost('org', 'pipeline', 'feed', body)
    ).resolves.toMatchObject({ id: 'feed' });

    expect(start).toHaveBeenCalledWith(
      'autoPostWorkflowV2',
      expect.objectContaining({ workflowId: 'autopost-feed' })
    );
    expect(temporal.terminateWorkflow).not.toHaveBeenCalled();
  });

  it('does not expose feeds from another Pipeline', async () => {
    const { service, repository } = createService();
    repository.getPipeline.mockResolvedValue(null);

    await expect(
      service.getPipelineAutoposts('other-org', 'pipeline')
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.getPipelineAutoposts).not.toHaveBeenCalled();
  });

  it('terminates all feeds when a Pipeline is removed', async () => {
    const { service, temporal, repository } = createService();
    repository.disablePipelineAutoposts.mockResolvedValue([
      { id: 'feed-one' },
      { id: 'feed-two' },
    ]);

    await service.disablePipelineAutoposts('org', 'pipeline');

    expect(temporal.terminateWorkflow).toHaveBeenCalledWith(
      'autopost-feed-one'
    );
    expect(temporal.terminateWorkflow).toHaveBeenCalledWith(
      'autopost-feed-two'
    );
  });
});

import { BadRequestException } from '@nestjs/common';
import { UsersRepository } from './users.repository';

describe('UsersRepository follower board column preferences', () => {
  const createRepository = () => {
    const findManyPreferences = jest.fn();
    const findManyIntegrations = jest.fn();
    const deleteMany = jest.fn();
    const createMany = jest.fn();
    const transaction = jest.fn(async (callback: (tx: any) => Promise<void>) =>
      callback({
        followerBoardColumnPreference: {
          deleteMany,
          createMany,
        },
      })
    );

    const repository = Object.create(
      UsersRepository.prototype
    ) as UsersRepository;
    (repository as any)._followerBoardColumnPreference = {
      model: {
        followerBoardColumnPreference: {
          findMany: findManyPreferences,
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
    (repository as any)._transaction = {
      model: {
        $transaction: transaction,
      },
    };

    return {
      repository,
      findManyPreferences,
      findManyIntegrations,
      deleteMany,
      createMany,
      transaction,
    };
  };

  it('rejects preferences for integrations outside the organization', async () => {
    const { repository, findManyIntegrations } = createRepository();
    findManyIntegrations.mockResolvedValue([{ id: 'integration-1' }]);

    await expect(
      repository.saveFollowerBoardColumnPreferences('user-1', 'org-1', [
        {
          integrationId: 'integration-1',
          columnKey: 'segment:leads',
          position: 0,
        },
        {
          integrationId: 'missing',
          columnKey: 'list:abc',
          position: 1,
        },
      ])
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate column preferences', async () => {
    const { repository, findManyIntegrations } = createRepository();
    findManyIntegrations.mockResolvedValue([{ id: 'integration-1' }]);

    await expect(
      repository.saveFollowerBoardColumnPreferences('user-1', 'org-1', [
        {
          integrationId: 'integration-1',
          columnKey: 'segment:leads',
          position: 0,
        },
        {
          integrationId: 'integration-1',
          columnKey: 'segment:leads',
          position: 1,
        },
      ])
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replaces preferences for owned integrations', async () => {
    const {
      repository,
      findManyIntegrations,
      findManyPreferences,
      deleteMany,
      createMany,
      transaction,
    } = createRepository();
    findManyIntegrations.mockResolvedValue([{ id: 'integration-1' }]);
    findManyPreferences.mockResolvedValue([
      {
        integrationId: 'integration-1',
        columnKey: 'segment:leads',
        position: 0,
      },
    ]);

    await expect(
      repository.saveFollowerBoardColumnPreferences('user-1', 'org-1', [
        {
          integrationId: 'integration-1',
          columnKey: 'segment:leads',
          position: 0,
        },
        {
          integrationId: 'integration-1',
          columnKey: 'list:list-1',
          position: 1,
        },
      ])
    ).resolves.toEqual([
      {
        integrationId: 'integration-1',
        columnKey: 'segment:leads',
        position: 0,
      },
    ]);

    expect(transaction).toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        organizationId: 'org-1',
        integrationId: { in: ['integration-1'] },
      },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          organizationId: 'org-1',
          integrationId: 'integration-1',
          columnKey: 'segment:leads',
          position: 0,
        },
        {
          userId: 'user-1',
          organizationId: 'org-1',
          integrationId: 'integration-1',
          columnKey: 'list:list-1',
          position: 1,
        },
      ],
    });
  });
});

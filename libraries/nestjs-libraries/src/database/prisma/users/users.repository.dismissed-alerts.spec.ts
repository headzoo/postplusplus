import { UsersRepository } from './users.repository';

describe('UsersRepository dismissed alerts', () => {
  const createRepository = () => {
    const findMany = jest.fn();
    const upsert = jest.fn();

    const repository = Object.create(
      UsersRepository.prototype
    ) as UsersRepository;
    (repository as any)._userDismissedAlert = {
      model: {
        userDismissedAlert: {
          findMany,
          upsert,
        },
      },
    };

    return { repository, findMany, upsert };
  };

  it('returns dismissed alert keys for the user', async () => {
    const { repository, findMany } = createRepository();
    findMany.mockResolvedValue([
      { alertKey: 'followers.triage.hot' },
      { alertKey: 'followers.triage.leads' },
    ]);

    await expect(repository.getDismissedAlerts('user-1')).resolves.toEqual({
      keys: ['followers.triage.hot', 'followers.triage.leads'],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { alertKey: true },
      orderBy: { alertKey: 'asc' },
    });
  });

  it('upserts a dismissed alert and returns the updated keys', async () => {
    const { repository, findMany, upsert } = createRepository();
    upsert.mockResolvedValue({
      id: 'alert-1',
      userId: 'user-1',
      alertKey: 'followers.triage.hot',
    });
    findMany.mockResolvedValue([{ alertKey: 'followers.triage.hot' }]);

    await expect(
      repository.dismissAlert('user-1', 'followers.triage.hot')
    ).resolves.toEqual({ keys: ['followers.triage.hot'] });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        userId_alertKey: {
          userId: 'user-1',
          alertKey: 'followers.triage.hot',
        },
      },
      create: {
        userId: 'user-1',
        alertKey: 'followers.triage.hot',
      },
      update: {
        dismissedAt: expect.any(Date),
      },
    });
  });

  it('is idempotent when dismissing the same alert twice', async () => {
    const { repository, findMany, upsert } = createRepository();
    upsert.mockResolvedValue({});
    findMany.mockResolvedValue([{ alertKey: 'followers.triage.all' }]);

    await expect(
      repository.dismissAlert('user-1', 'followers.triage.all')
    ).resolves.toEqual({ keys: ['followers.triage.all'] });
    await expect(
      repository.dismissAlert('user-1', 'followers.triage.all')
    ).resolves.toEqual({ keys: ['followers.triage.all'] });

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

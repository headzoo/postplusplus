jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
  socialIntegrationList: [],
}));

jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue(['0', []]),
  },
}));

import { ChannelRelationshipGradeActivity } from './channel-relationship-grade.activity';

describe('ChannelRelationshipGradeActivity', () => {
  const candidate = { id: 'integration', organizationId: 'organization' };
  const cadence = { unit: 'day' as const, interval: 3, timeOfDay: '00:00' };
  const asOf = '2026-08-19T12:00:00.000Z';
  let repository: { listDueRelationshipGradeCandidates: jest.Mock };
  let service: { buildRelationshipGradeSnapshotBatch: jest.Mock };
  let logs: { append: jest.Mock };

  const createActivity = () =>
    new ChannelRelationshipGradeActivity(
      repository as any,
      service as any,
      logs as any
    );

  beforeEach(() => {
    repository = {
      listDueRelationshipGradeCandidates: jest
        .fn()
        .mockResolvedValue({ candidates: [] }),
    };
    service = { buildRelationshipGradeSnapshotBatch: jest.fn() };
    logs = { append: jest.fn().mockResolvedValue(undefined) };
  });

  it('passes the cadence through to strategy-aware candidate discovery', async () => {
    repository.listDueRelationshipGradeCandidates.mockResolvedValue({
      candidates: [{ ...candidate, extra: 'ignored' }],
    });

    await expect(
      createActivity().listDueCandidatesV2({ after: 'previous', asOf, cadence })
    ).resolves.toEqual({ asOf, candidates: [candidate] });
    expect(repository.listDueRelationshipGradeCandidates).toHaveBeenCalledWith(
      new Date(asOf),
      'previous',
      1,
      cadence
    );
    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleKey: 'relationship-grades',
        meta: { after: 'previous', candidateCount: 1 },
      })
    );
  });

  it('reports more pending work until every stale batch is drained', async () => {
    const activity = createActivity();
    service.buildRelationshipGradeSnapshotBatch
      .mockResolvedValueOnce({
        snapshotAt: new Date(asOf),
        processed: 100,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        snapshotAt: new Date(asOf),
        processed: 12,
        hasMore: false,
      });

    await expect(
      activity.snapshotNextBatchV2({ candidate, snapshotAt: asOf, cadence })
    ).resolves.toEqual({ snapshotAt: asOf, processed: 100, hasMore: true });
    await expect(
      activity.snapshotNextBatchV2({ candidate, snapshotAt: asOf, cadence })
    ).resolves.toEqual({ snapshotAt: asOf, processed: 12, hasMore: false });

    expect(service.buildRelationshipGradeSnapshotBatch).toHaveBeenNthCalledWith(
      1,
      candidate.organizationId,
      candidate.id,
      new Date(asOf),
      cadence
    );
  });

  it('logs and rethrows when a snapshot batch fails', async () => {
    service.buildRelationshipGradeSnapshotBatch.mockRejectedValue(
      new Error('strategy load failed')
    );

    await expect(
      createActivity().snapshotNextBatchV2({ candidate, snapshotAt: asOf })
    ).rejects.toThrow('strategy load failed');
    expect(logs.append).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        meta: expect.objectContaining({ error: 'strategy load failed' }),
      })
    );
  });

  it('rejects invalid timestamps before touching the database', async () => {
    const activity = createActivity();

    await expect(
      activity.listDueCandidatesV2({ asOf: 'not-a-date' })
    ).rejects.toThrow('asOf must be a valid timestamp');
    await expect(
      activity.snapshotNextBatchV2({ candidate, snapshotAt: 'not-a-date' })
    ).rejects.toThrow('snapshotAt must be a valid timestamp');
    expect(
      repository.listDueRelationshipGradeCandidates
    ).not.toHaveBeenCalled();
    expect(service.buildRelationshipGradeSnapshotBatch).not.toHaveBeenCalled();
  });
});

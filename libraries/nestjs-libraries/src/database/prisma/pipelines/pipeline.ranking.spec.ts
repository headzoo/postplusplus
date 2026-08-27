import { PipelineRepository } from './pipeline.repository';

const QUEUE_POSITION_INCREMENT = 1024;

type QueueItem = {
  id: string;
  position: number;
  status: string;
  deletedAt: Date | null;
};

function createRankingRepository(
  initialItems: Array<{ id: string; position: number }>
) {
  const items: QueueItem[] = initialItems.map((item) => ({
    ...item,
    status: 'QUEUED',
    deletedAt: null,
  }));

  const pipelineQueueItem = {
    findFirst: jest.fn(async ({ where }: any) => {
      const item = items.find((entry) => entry.id === where.id);
      if (!item || item.status !== 'QUEUED' || item.deletedAt) {
        return null;
      }
      return { id: item.id, position: item.position };
    }),
    findMany: jest.fn(async ({ where }: any) => {
      return items
        .filter(
          (item) =>
            item.status === 'QUEUED' &&
            !item.deletedAt &&
            (!where.id?.not || item.id !== where.id.not)
        )
        .sort((left, right) => left.position - right.position)
        .map(({ id, position }) => ({ id, position }));
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const item = items.find((entry) => entry.id === where.id);
      if (!item) {
        return null;
      }
      if (data.position !== undefined) {
        item.position = data.position;
      }
      return { id: item.id, position: item.position };
    }),
  };

  const transaction = {
    model: {
      $transaction: jest.fn(async (callback: any) =>
        callback({ pipelineQueueItem })
      ),
    },
  };

  const repository = new PipelineRepository(
    { model: {} } as any,
    { model: {} } as any,
    { model: {} } as any,
    { model: {} } as any,
    { model: {} } as any,
    transaction as any
  );

  return { repository, items, pipelineQueueItem };
}

function positionsOf(items: QueueItem[]) {
  return [...items]
    .sort((left, right) => left.position - right.position)
    .map((item) => ({ id: item.id, position: item.position }));
}

describe('Pipeline sparse ranking', () => {
  it('persists only a complete queued-item permutation with deterministic positions', async () => {
    const items: QueueItem[] = [
      { id: 'first', position: 1024, status: 'QUEUED', deletedAt: null },
      { id: 'second', position: 2048, status: 'QUEUED', deletedAt: null },
      { id: 'published', position: 512, status: 'PUBLISHED', deletedAt: null },
    ];
    const updateMany = jest.fn(async ({ where, data }: any) => {
      const item = items.find(
        (candidate) =>
          candidate.id === where.id &&
          candidate.status === where.status &&
          candidate.deletedAt === where.deletedAt
      );
      if (!item) return { count: 0 };
      item.position = data.position;
      return { count: 1 };
    });
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            pipeline: {
              findFirst: jest.fn().mockResolvedValue({ id: 'pipeline' }),
            },
            pipelineQueueItem: {
              findMany: jest
                .fn()
                .mockResolvedValue([{ id: 'first' }, { id: 'second' }]),
              updateMany,
            },
          })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await expect(
      repository.reorderQueuedItems('org', 'pipeline', ['second', 'first'])
    ).resolves.toEqual([
      { id: 'second', position: QUEUE_POSITION_INCREMENT },
      { id: 'first', position: 2 * QUEUE_POSITION_INCREMENT },
    ]);
    expect(positionsOf(items).map((item) => item.id)).toEqual([
      'published',
      'second',
      'first',
    ]);
    expect(updateMany).toHaveBeenCalledTimes(2);

    await expect(
      repository.reorderQueuedItems('org', 'pipeline', ['first', 'foreign'])
    ).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it('prepends below a zero-position head without duplicating ranks', async () => {
    const { repository, items } = createRankingRepository([
      { id: 'first', position: 0 },
      { id: 'second', position: QUEUE_POSITION_INCREMENT },
      { id: 'third', position: 2 * QUEUE_POSITION_INCREMENT },
    ]);

    await repository.repositionItem('org', 'second', 'pipeline', 'first');
    await repository.repositionItem('org', 'third', 'pipeline', 'second');

    expect(positionsOf(items)).toEqual([
      { id: 'third', position: -2 * QUEUE_POSITION_INCREMENT },
      { id: 'second', position: -QUEUE_POSITION_INCREMENT },
      { id: 'first', position: 0 },
    ]);
    expect(new Set(items.map((item) => item.position)).size).toBe(items.length);
  });

  it('keeps consecutive prepends strictly ordered with unique positions', async () => {
    const { repository, items } = createRankingRepository([
      { id: 'first', position: QUEUE_POSITION_INCREMENT },
      { id: 'second', position: 2 * QUEUE_POSITION_INCREMENT },
      { id: 'new-a', position: 3 * QUEUE_POSITION_INCREMENT },
      { id: 'new-b', position: 4 * QUEUE_POSITION_INCREMENT },
      { id: 'new-c', position: 5 * QUEUE_POSITION_INCREMENT },
    ]);

    await repository.repositionItem('org', 'new-a', 'pipeline', 'first');
    await repository.repositionItem('org', 'new-b', 'pipeline', 'new-a');
    await repository.repositionItem('org', 'new-c', 'pipeline', 'new-b');

    const ordered = positionsOf(items);
    expect(ordered.map((item) => item.id)).toEqual([
      'new-c',
      'new-b',
      'new-a',
      'first',
      'second',
    ]);
    for (let index = 1; index < ordered.length; index++) {
      expect(ordered[index].position).toBeGreaterThan(
        ordered[index - 1].position
      );
    }
    expect(new Set(ordered.map((item) => item.position)).size).toBe(
      ordered.length
    );
  });

  it('supports negative head positions for repeated prepends', async () => {
    const { repository, items } = createRankingRepository([
      { id: 'head', position: -QUEUE_POSITION_INCREMENT },
      { id: 'newer', position: 0 },
    ]);

    await repository.repositionItem('org', 'newer', 'pipeline', 'head');

    expect(positionsOf(items)).toEqual([
      { id: 'newer', position: -2 * QUEUE_POSITION_INCREMENT },
      { id: 'head', position: -QUEUE_POSITION_INCREMENT },
    ]);
  });

  it('rebalances when adjacent ranks have no integer gap', async () => {
    const { repository, items } = createRankingRepository([
      { id: 'first', position: 10 },
      { id: 'second', position: 11 },
      { id: 'middle', position: 99 },
    ]);

    await repository.repositionItem(
      'org',
      'middle',
      'pipeline',
      undefined,
      'first'
    );

    expect(positionsOf(items)).toEqual([
      { id: 'first', position: QUEUE_POSITION_INCREMENT },
      {
        id: 'middle',
        position: QUEUE_POSITION_INCREMENT + QUEUE_POSITION_INCREMENT / 2,
      },
      { id: 'second', position: 2 * QUEUE_POSITION_INCREMENT },
    ]);
    expect(new Set(items.map((item) => item.position)).size).toBe(items.length);
  });

  it('assigns unique positions when moving into another pipeline at the front', async () => {
    const items: QueueItem[] = [
      { id: 'moving', position: 5, status: 'QUEUED', deletedAt: null },
      {
        id: 'destination-head',
        position: 0,
        status: 'QUEUED',
        deletedAt: null,
      },
    ];
    const pipelineQueueItem = {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id === 'moving') {
          return {
            id: 'moving',
            posts: [{ integrationId: 'channel' }],
          };
        }
        return null;
      }),
      findMany: jest.fn(async () =>
        items
          .filter((item) => item.id === 'destination-head')
          .map(({ id, position }) => ({ id, position }))
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const item = items.find((entry) => entry.id === where.id);
        if (!item) {
          return null;
        }
        Object.assign(item, data);
        return item;
      }),
    };
    const pipeline = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'destination',
        integrations: [{ integrationId: 'channel' }],
      }),
    };
    const transaction = {
      model: {
        $transaction: jest.fn(async (callback: any) =>
          callback({ pipelineQueueItem, pipeline })
        ),
      },
    };
    const repository = new PipelineRepository(
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      { model: {} } as any,
      transaction as any
    );

    await repository.moveItem(
      'org',
      'moving',
      'destination',
      'destination-head'
    );

    expect(items.find((item) => item.id === 'moving')?.position).toBe(
      -QUEUE_POSITION_INCREMENT
    );
    expect(new Set(items.map((item) => item.position)).size).toBe(items.length);
  });
});

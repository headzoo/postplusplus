import {
  applyFollowerBoardColumnPreferences,
  buildFollowerBoardColumnPreferences,
  columnKeyForList,
  columnKeyForSegment,
  reorderVisibleKeys,
} from './follower.board.layout';

describe('columnKey helpers', () => {
  it('builds segment and list keys', () => {
    expect(columnKeyForSegment('leads')).toBe('segment:leads');
    expect(columnKeyForList('list-1')).toBe('list:list-1');
  });
});

describe('applyFollowerBoardColumnPreferences', () => {
  const columns = [
    { kind: 'segment' as const, columnKey: 'segment:leads', id: 'leads' },
    { kind: 'segment' as const, columnKey: 'segment:hot', id: 'hot' },
    { kind: 'list' as const, columnKey: 'list:a', id: 'a' },
    { kind: 'list' as const, columnKey: 'list:b', id: 'b' },
  ];

  it('keeps default order when preferences are empty', () => {
    expect(
      applyFollowerBoardColumnPreferences(columns, [], 'integration-1').map(
        (column) => column.id
      )
    ).toEqual(['leads', 'hot', 'a', 'b']);
  });

  it('interleaves segment and list columns by saved position', () => {
    expect(
      applyFollowerBoardColumnPreferences(
        columns,
        [
          {
            integrationId: 'integration-1',
            columnKey: 'list:a',
            position: 0,
          },
          {
            integrationId: 'integration-1',
            columnKey: 'segment:leads',
            position: 1,
          },
          {
            integrationId: 'integration-1',
            columnKey: 'list:b',
            position: 2,
          },
          {
            integrationId: 'integration-1',
            columnKey: 'segment:hot',
            position: 3,
          },
        ],
        'integration-1'
      ).map((column) => column.id)
    ).toEqual(['a', 'leads', 'b', 'hot']);
  });

  it('ignores preferences for other integrations', () => {
    expect(
      applyFollowerBoardColumnPreferences(
        columns,
        [
          {
            integrationId: 'other',
            columnKey: 'list:a',
            position: 0,
          },
        ],
        'integration-1'
      ).map((column) => column.id)
    ).toEqual(['leads', 'hot', 'a', 'b']);
  });

  it('places columns with preferences before unpositioned ones', () => {
    expect(
      applyFollowerBoardColumnPreferences(
        columns,
        [
          {
            integrationId: 'integration-1',
            columnKey: 'list:b',
            position: 0,
          },
        ],
        'integration-1'
      ).map((column) => column.id)
    ).toEqual(['b', 'leads', 'hot', 'a']);
  });
});

describe('buildFollowerBoardColumnPreferences', () => {
  it('assigns sequential positions', () => {
    expect(
      buildFollowerBoardColumnPreferences('integration-1', [
        'segment:leads',
        'list:a',
        'segment:hot',
      ])
    ).toEqual([
      {
        integrationId: 'integration-1',
        columnKey: 'segment:leads',
        position: 0,
      },
      {
        integrationId: 'integration-1',
        columnKey: 'list:a',
        position: 1,
      },
      {
        integrationId: 'integration-1',
        columnKey: 'segment:hot',
        position: 2,
      },
    ]);
  });
});

describe('reorderVisibleKeys', () => {
  it('moves keys within bounds', () => {
    expect(reorderVisibleKeys(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });
});

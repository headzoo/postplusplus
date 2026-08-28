import { reorderVisibleKeys } from '@gitroom/frontend/components/dashboard/dashboard.analytics.layout';

export type FollowerBoardColumnPreference = {
  integrationId: string;
  columnKey: string;
  position: number;
};

export type FollowerBoardColumnKind = 'segment' | 'list';

export type FollowerBoardColumnDescriptor = {
  kind: FollowerBoardColumnKind;
  columnKey: string;
};

export const columnKeyForSegment = (slug: string) => `segment:${slug}`;

export const columnKeyForList = (listId: string) => `list:${listId}`;

export const applyFollowerBoardColumnPreferences = <
  T extends FollowerBoardColumnDescriptor
>(
  columns: T[],
  preferences: FollowerBoardColumnPreference[],
  integrationId: string
): T[] => {
  const prefs = preferences.filter(
    (preference) => preference.integrationId === integrationId
  );
  const prefByKey = new Map(
    prefs.map((preference) => [preference.columnKey, preference])
  );

  const withKeys = columns.map((column, index) => ({
    column,
    key: column.columnKey,
    defaultIndex: index,
  }));

  return withKeys
    .sort((a, b) => {
      const preferenceA = prefByKey.get(a.key);
      const preferenceB = prefByKey.get(b.key);
      if (preferenceA && preferenceB) {
        return preferenceA.position - preferenceB.position;
      }
      if (preferenceA) {
        return -1;
      }
      if (preferenceB) {
        return 1;
      }
      return a.defaultIndex - b.defaultIndex;
    })
    .map(({ column }) => column);
};

export const buildFollowerBoardColumnPreferences = (
  integrationId: string,
  orderedKeys: string[]
): FollowerBoardColumnPreference[] =>
  orderedKeys.map((columnKey, position) => ({
    integrationId,
    columnKey,
    position,
  }));

export { reorderVisibleKeys };

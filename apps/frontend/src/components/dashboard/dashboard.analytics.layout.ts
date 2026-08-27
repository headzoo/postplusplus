export type DashboardAnalyticsPreference = {
  integrationId: string;
  metricKey: string;
  position: number;
  hidden: boolean;
};

export type DashboardAnalyticsMetricLike = {
  metricKey?: string;
  label: string;
};

export const dashboardMetricIdentity = (metric: DashboardAnalyticsMetricLike) =>
  metric.metricKey || metric.label;

export const applyDashboardAnalyticsPreferences = <
  T extends DashboardAnalyticsMetricLike
>(
  metrics: T[],
  preferences: DashboardAnalyticsPreference[],
  integrationId: string
): { visible: T[]; hidden: T[] } => {
  const prefs = preferences.filter(
    (preference) => preference.integrationId === integrationId
  );
  const prefByKey = new Map(
    prefs.map((preference) => [preference.metricKey, preference])
  );

  const withKeys = metrics.map((metric, index) => ({
    metric,
    key: dashboardMetricIdentity(metric),
    defaultIndex: index,
  }));

  const visible = withKeys
    .filter(({ key }) => !prefByKey.get(key)?.hidden)
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
    .map(({ metric }) => metric);

  const hidden = withKeys
    .filter(({ key }) => !!prefByKey.get(key)?.hidden)
    .sort((a, b) => a.defaultIndex - b.defaultIndex)
    .map(({ metric }) => metric);

  return { visible, hidden };
};

export const buildDashboardAnalyticsPreferences = (
  integrationId: string,
  visibleKeys: string[],
  hiddenKeys: string[]
): DashboardAnalyticsPreference[] => [
  ...visibleKeys.map((metricKey, position) => ({
    integrationId,
    metricKey,
    position,
    hidden: false,
  })),
  ...hiddenKeys.map((metricKey, index) => ({
    integrationId,
    metricKey,
    position: visibleKeys.length + index,
    hidden: true,
  })),
];

export const reorderVisibleKeys = (
  keys: string[],
  from: number,
  to: number
): string[] => {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= keys.length ||
    to >= keys.length
  ) {
    return keys;
  }
  const next = [...keys];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

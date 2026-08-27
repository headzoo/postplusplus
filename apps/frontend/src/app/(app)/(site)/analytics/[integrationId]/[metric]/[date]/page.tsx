export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { MetricDayAnalyticsComponent } from '@gitroom/frontend/components/analytics/metric-day/metric-day-analytics.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${
    isGeneralServerSide() ? 'Metric day : Post++' : 'Gitroom Metric day'
  }`,
  description: '',
};

export default async function MetricDayPage() {
  return <MetricDayAnalyticsComponent />;
}

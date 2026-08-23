import { Metadata } from 'next';
import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';

export const metadata: Metadata = {
  title: 'Agent : Post++',
  description: '',
};

export default async function Page() {
  return <AgentChat />;
}

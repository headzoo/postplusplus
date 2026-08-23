import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';

export const metadata: Metadata = {
  title: 'Agent : Post++',
  description: '',
};

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (id === 'new') {
    redirect('/agents');
  }

  return <AgentChat />;
}

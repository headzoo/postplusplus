import { Suspense } from 'react';
import { LayoutComponent } from '@gitroom/frontend/components/new-layout/layout.component';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <LayoutComponent>{children}</LayoutComponent>
    </Suspense>
  );
}

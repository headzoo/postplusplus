export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-[#0E0E0E] flex flex-1 items-center justify-center p-[12px] min-h-screen w-screen text-white">
      <ReturnUrlComponent />
      <div className="flex flex-col py-[40px] px-[20px] w-full max-w-[600px] rounded-[12px] text-white bg-[#1A1919]">
        <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] flex flex-col text-white">
          <LogoTextComponent
            src="/logo-180.png"
            className="h-[180px] mx-auto"
          />
          <div className="flex">{children}</div>
        </div>
      </div>
    </div>
  );
}

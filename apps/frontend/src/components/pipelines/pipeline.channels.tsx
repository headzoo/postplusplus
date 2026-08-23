'use client';

import { FC } from 'react';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';

export const PipelineChannels: FC<{
  channels: Integrations[];
  compact?: boolean;
  stacked?: boolean;
}> = ({ channels, compact, stacked }) => {
  if (!channels?.length) {
    return <span className="text-[13px] opacity-60">No channels</span>;
  }

  if (stacked) {
    const visible = channels.slice(0, 5);
    const overflow = channels.length - visible.length;

    return (
      <div className="flex items-center">
        {visible.map((channel, index) => (
          <div
            key={channel.id}
            className={clsx(
              'relative rounded-full border-2 border-newTableHeader bg-newTableHeader',
              index > 0 && '-ms-[8px]'
            )}
            style={{ zIndex: visible.length - index }}
            title={channel.name}
          >
            <SafeImage
              src={channel.picture}
              alt={channel.name}
              width={24}
              height={24}
              className="rounded-full"
            />
          </div>
        ))}
        {overflow > 0 && (
          <span className="ms-[6px] text-[12px] text-textItemBlur">+{overflow}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      {channels.map((channel) => (
        <div
          key={channel.id}
          className={clsx(
            'flex items-center gap-[6px] rounded-[8px] border border-newBorder bg-newBgColor px-[8px]',
            compact ? 'h-[28px]' : 'h-[32px]'
          )}
          title={channel.name}
        >
          <SafeImage
            src={channel.picture}
            alt={channel.name}
            width={compact ? 18 : 20}
            height={compact ? 18 : 20}
            className="rounded-full"
          />
          {!compact && (
            <span className="text-[12px] text-textColor truncate max-w-[120px]">
              {channel.name}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

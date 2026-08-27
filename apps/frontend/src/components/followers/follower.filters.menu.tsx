'use client';

import { FC, useState } from 'react';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Select } from '@gitroom/react/form/select';
import { FilterFunnelIcon } from '@gitroom/frontend/components/ui/icons';
import {
  ChannelInteractionWindow,
  FOLLOWER_INTERACTION_WINDOWS,
  FollowerChannel,
  FollowerSortDirection,
} from '@gitroom/frontend/components/followers/use.followers';

const PAGE_SIZE_OPTIONS = [12, 24, 48] as const;

export const FollowerFiltersMenu: FC<{
  sorts?: FollowerChannel['sorts'];
  sort?: string;
  direction?: FollowerSortDirection;
  window: ChannelInteractionWindow;
  limit: number;
  showSort: boolean;
  showDirection: boolean;
  showWindow: boolean;
  onSortChange: (value: string) => void;
  onDirectionChange: (value: FollowerSortDirection) => void;
  onWindowChange: (value: ChannelInteractionWindow) => void;
  onLimitChange: (value: number) => void;
}> = ({
  sorts,
  sort,
  direction,
  window,
  limit,
  showSort,
  showDirection,
  showWindow,
  onSortChange,
  onDirectionChange,
  onWindowChange,
  onLimitChange,
}) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const activeSort = sorts?.find((option) => option.key === sort);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          'inline-flex h-[42px] items-center gap-[8px] rounded-[10px] border border-newBorder bg-newBgColorInner px-[14px] text-[13px] text-textItemBlur transition-colors hover:bg-newTableHeader hover:text-newTextColor',
          open && 'border-newTextColor/40 text-newTextColor'
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="followers-filters-button"
      >
        <FilterFunnelIcon size={15} />
        {t('followers_filters', 'Filters')}
      </button>
      {open && (
        <div
          className="absolute end-0 z-20 mt-[8px] w-[min(320px,calc(100vw-40px))] rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[14px] shadow-lg"
          role="dialog"
          aria-label={t('followers_filters', 'Filters')}
          data-testid="followers-filters-menu"
        >
          <div className="flex flex-col gap-[12px]">
            {showSort && !!sorts?.length && (
              <Select
                label={t('followers_sort_by', 'Sort by')}
                name="followers-sort"
                disableForm={true}
                hideErrors={true}
                value={sort ?? ''}
                onChange={(event) => onSortChange(event.target.value)}
              >
                {sorts.map((sortOption) => (
                  <option key={sortOption.key} value={sortOption.key}>
                    {sortOption.label}
                  </option>
                ))}
              </Select>
            )}
            {showWindow && (
              <Select
                label={t('followers_time_window', 'Time window')}
                name="followers-window"
                disableForm={true}
                hideErrors={true}
                value={window}
                onChange={(event) =>
                  onWindowChange(event.target.value as ChannelInteractionWindow)
                }
              >
                {FOLLOWER_INTERACTION_WINDOWS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey, option.defaultLabel)}
                  </option>
                ))}
              </Select>
            )}
            {showDirection && !!activeSort?.directions.length && (
              <Select
                label={t('followers_direction', 'Direction')}
                name="followers-direction"
                disableForm={true}
                hideErrors={true}
                value={direction ?? 'desc'}
                onChange={(event) =>
                  onDirectionChange(event.target.value as FollowerSortDirection)
                }
              >
                {activeSort.directions.map((sortDirection) => (
                  <option key={sortDirection} value={sortDirection}>
                    {sortDirection === 'asc'
                      ? t('followers_direction_asc', 'Ascending')
                      : t('followers_direction_desc', 'Descending')}
                  </option>
                ))}
              </Select>
            )}
            <Select
              label={t('followers_page_size', 'Per page')}
              name="followers-limit"
              disableForm={true}
              hideErrors={true}
              value={String(limit)}
              onChange={(event) => onLimitChange(Number(event.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}
    </div>
  );
};

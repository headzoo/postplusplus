'use client';

import { FC, useCallback } from 'react';
import clsx from 'clsx';
export const Slider: FC<{
  value: 'on' | 'off';
  fill?: boolean;
  disabled?: boolean;
  onChange: (value: 'on' | 'off') => void;
}> = (props) => {
  const { value, onChange, fill, disabled } = props;
  const change = useCallback(() => {
    if (disabled) {
      return;
    }
    onChange(value === 'on' ? 'off' : 'on');
  }, [disabled, onChange, value]);
  return (
    <div
      className={clsx(
        'w-[57px] h-[34px] p-[4px] border-fifth border rounded-[100px]',
        value === 'on' && fill && 'bg-forth',
        disabled && 'opacity-50 pointer-events-none'
      )}
      onClick={change}
    >
      <div className="w-full h-full relative rounded-[100px]">
        <div
          className={clsx(
            'absolute left-0 top-0 w-[24px] h-[24px] bg-customColor5 rounded-full transition-all cursor-pointer',
            value === 'on' ? 'left-[100%] -translate-x-[100%]' : 'left-0'
          )}
        />
      </div>
    </div>
  );
};

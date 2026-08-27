'use client';

import { FC } from 'react';
import clsx from 'clsx';

export const RelationshipStars: FC<{
  grade: number | null;
  interactive?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onSelect?: (grade: number) => void;
}> = ({
  grade,
  interactive = false,
  disabled = false,
  compact = false,
  onSelect,
}) => {
  const stars = Array.from({ length: 5 }, (_, index) => {
    if (grade == null) {
      return 0;
    }
    return Math.min(1, Math.max(0, grade - index));
  });
  const sizeClass = compact ? 'h-[16px] w-[16px]' : 'h-[20px] w-[20px]';

  return (
    <div
      className="flex items-center gap-[4px]"
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={
        interactive
          ? undefined
          : grade == null
          ? 'No grade yet'
          : `${grade} out of 5`
      }
    >
      {stars.map((fill, index) => (
        <span key={index} className={clsx('relative inline-block', sizeClass)}>
          <svg
            viewBox="0 0 24 24"
            className={clsx('absolute inset-0 text-newTableBorder', sizeClass)}
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"
            />
          </svg>
          {fill > 0 && (
            <span
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${fill * 100}%` }}
            >
              <svg
                viewBox="0 0 24 24"
                className={clsx('text-amber-400', sizeClass)}
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"
                />
              </svg>
            </span>
          )}
          {interactive && (
            <>
              <button
                type="button"
                className="absolute inset-y-0 start-0 z-[1] w-1/2"
                disabled={disabled}
                aria-label={`${index + 0.5} out of 5`}
                aria-checked={grade === index + 0.5}
                role="radio"
                onClick={() => onSelect?.(index + 0.5)}
              />
              <button
                type="button"
                className="absolute inset-y-0 end-0 z-[1] w-1/2"
                disabled={disabled}
                aria-label={`${index + 1} out of 5`}
                aria-checked={grade === index + 1}
                role="radio"
                onClick={() => onSelect?.(index + 1)}
              />
            </>
          )}
        </span>
      ))}
    </div>
  );
};

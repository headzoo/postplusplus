import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import {
  MAX_CONVERSION_ID_LENGTH,
  MAX_CONVERSION_QUERY_RANGE_DAYS,
} from './conversion.shared';

const IsUtcCalendarDay =
  (validationOptions?: ValidationOptions) =>
  (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isUtcCalendarDay',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
          }
          const date = new Date(`${value}T00:00:00.000Z`);
          return (
            !Number.isNaN(date.getTime()) &&
            date.toISOString().slice(0, 10) === value
          );
        },
        defaultMessage() {
          return 'must be an ISO UTC calendar day (YYYY-MM-DD)';
        },
      },
    });

export class ListConversionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take = 50;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @IsUtcCalendarDay()
  from?: string;

  @IsOptional()
  @IsUtcCalendarDay()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  conversionType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CONVERSION_ID_LENGTH)
  strategyId?: string;
}

export class SummarizeConversionsQueryDto {
  @IsUtcCalendarDay()
  from: string;

  @IsUtcCalendarDay()
  to: string;
}

export const assertListDateRange = (query: ListConversionsQueryDto) => {
  if (!query.from && !query.to) {
    return undefined;
  }
  if (!query.from || !query.to) {
    throw new Error('from and to must be provided together');
  }
  const fromDate = new Date(`${query.from}T00:00:00.000Z`);
  const toDate = new Date(`${query.to}T00:00:00.000Z`);
  if (toDate <= fromDate) {
    throw new Error('to must be after from');
  }
  const spanDays =
    (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000);
  if (spanDays > MAX_CONVERSION_QUERY_RANGE_DAYS) {
    throw new Error(
      `Date range cannot exceed ${MAX_CONVERSION_QUERY_RANGE_DAYS} UTC days`
    );
  }
  return { from: fromDate, to: toDate };
};

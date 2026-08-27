import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export const ANALYTICS_METRIC_SLUGS = {
  impressions: 'impression_count',
  bookmarks: 'bookmark_count',
  likes: 'like_count',
  quotes: 'quote_count',
  replies: 'reply_count',
  retweets: 'retweet_count',
} as const;

export type AnalyticsMetricSlug = keyof typeof ANALYTICS_METRIC_SLUGS;

export const isAnalyticsMetricSlug = (
  value: string
): value is AnalyticsMetricSlug => value in ANALYTICS_METRIC_SLUGS;

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
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be an ISO UTC calendar day`;
        },
      },
    });

export class MetricDayAnalyticsParamsDto {
  @IsString()
  @IsNotEmpty()
  integration: string;

  @IsIn(Object.keys(ANALYTICS_METRIC_SLUGS))
  metric: AnalyticsMetricSlug;

  @IsUtcCalendarDay()
  date: string;
}

export class MetricDayAnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

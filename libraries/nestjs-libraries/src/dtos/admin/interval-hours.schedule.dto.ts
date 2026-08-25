import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import {
  HOT_MATERIALIZATION_SCHEDULE_MAX_HOURS,
  HOT_MATERIALIZATION_SCHEDULE_MIN_HOURS,
} from '@gitroom/nestjs-libraries/temporal/hot-triage.schedule';

export class IntervalHoursScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(HOT_MATERIALIZATION_SCHEDULE_MIN_HOURS)
  @Max(HOT_MATERIALIZATION_SCHEDULE_MAX_HOURS)
  intervalHours!: number;
}

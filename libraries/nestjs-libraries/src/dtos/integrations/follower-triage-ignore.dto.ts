import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { LEAD_FIT_DISMISS_REASONS } from '@gitroom/nestjs-libraries/dtos/integrations/lead-fit-feedback.types';

export class IgnoreFollowerTriageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  externalId!: string;

  @IsString()
  @IsIn([
    'hot_lead',
    'mutual',
    'over_invested',
    'quiet',
    'lead',
    'engaged_not_yet',
  ])
  triage!:
    | 'hot_lead'
    | 'mutual'
    | 'over_invested'
    | 'quiet'
    | 'lead'
    | 'engaged_not_yet';

  @ValidateIf(
    (body: IgnoreFollowerTriageDto) =>
      body.triage === 'lead' && body.snooze !== true
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn([...LEAD_FIT_DISMISS_REASONS], { each: true })
  reasons?: (typeof LEAD_FIT_DISMISS_REASONS)[number][];

  @IsOptional()
  @IsBoolean()
  snooze?: boolean;
}

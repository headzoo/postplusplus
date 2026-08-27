import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  MAX_CONVERSION_GOAL_LENGTH,
  MAX_CONVERSION_ID_LENGTH,
  STANDARD_UTM_FIELDS,
} from './conversion.shared';

@ValidatorConstraint({ name: 'goalAttributionShape', async: false })
class GoalAttributionShapeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const object = args.object as IngestGoalDto;
    const attribution = object.attribution;
    if (!attribution) {
      return false;
    }
    const hasClickId = !!attribution.ppClickId?.trim();
    const hasUtm = STANDARD_UTM_FIELDS.some((field) =>
      attribution[field]?.trim()
    );
    return hasClickId || hasUtm;
  }

  defaultMessage() {
    return 'attribution must include ppClickId or at least one UTM field';
  }
}

export class GoalAttributionDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CONVERSION_ID_LENGTH)
  ppClickId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_medium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_campaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_term?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utm_content?: string;
}

export class IngestGoalDto {
  @IsString()
  @MaxLength(MAX_CONVERSION_ID_LENGTH)
  eventId: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CONVERSION_ID_LENGTH)
  integrationId?: string;

  @IsString()
  @MaxLength(MAX_CONVERSION_GOAL_LENGTH)
  goal: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  occurredAt?: string;

  @ValidateNested()
  @Type(() => GoalAttributionDto)
  @Validate(GoalAttributionShapeConstraint)
  attribution: GoalAttributionDto;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CONVERSION_ID_LENGTH)
  actorExternalId?: string;

  @IsOptional()
  userProperties?: Record<string, unknown>;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

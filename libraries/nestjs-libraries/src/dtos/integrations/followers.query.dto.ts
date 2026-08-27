import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  FOLLOWER_AUDIENCES,
  FOLLOWER_INTERACTION_WINDOWS,
  FOLLOWER_SORT_DIRECTIONS,
  FOLLOWER_TRIAGE_FILTERS,
  normalizeFollowerSearch,
} from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';

@ValidatorConstraint({ name: 'exclusiveAudienceTriage', async: false })
class ExclusiveAudienceTriageConstraint
  implements ValidatorConstraintInterface
{
  validate(_: unknown, args: ValidationArguments) {
    const object = args.object as FollowersQueryDto;
    const selected = [object.audience, object.triage, object.listId].filter(
      Boolean
    );
    return selected.length <= 1;
  }

  defaultMessage() {
    return 'audience, triage, and listId cannot be combined';
  }
}

export class FollowersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 24;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sort?: string;

  @IsOptional()
  @IsIn(FOLLOWER_SORT_DIRECTIONS)
  direction?: (typeof FOLLOWER_SORT_DIRECTIONS)[number];

  @IsOptional()
  @IsIn(FOLLOWER_INTERACTION_WINDOWS)
  window?: (typeof FOLLOWER_INTERACTION_WINDOWS)[number];

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeFollowerSearch(value) : value
  )
  @IsString()
  @MaxLength(64)
  search?: string;

  @IsOptional()
  @IsIn(FOLLOWER_TRIAGE_FILTERS)
  @Validate(ExclusiveAudienceTriageConstraint)
  triage?: (typeof FOLLOWER_TRIAGE_FILTERS)[number];

  @IsOptional()
  @IsIn(FOLLOWER_AUDIENCES)
  @Validate(ExclusiveAudienceTriageConstraint)
  audience?: (typeof FOLLOWER_AUDIENCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Validate(ExclusiveAudienceTriageConstraint)
  listId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (value === true || value === 'true' || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === '0') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  isBot?: boolean;
}

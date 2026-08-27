import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { normalizeFollowerSearch } from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';

@ValidatorConstraint({ name: 'exclusiveFollowerMemberIdentity', async: false })
class ExclusiveFollowerMemberIdentityConstraint
  implements ValidatorConstraintInterface
{
  validate(_: unknown, args: ValidationArguments) {
    const object = args.object as FollowerMemberTimelineQueryDto;
    return [object.externalId, object.username].filter(Boolean).length === 1;
  }

  defaultMessage() {
    return 'Provide either externalId or username';
  }
}

export class FollowerMemberTimelineQueryDto {
  @Validate(ExclusiveFollowerMemberIdentityConstraint)
  identity = true;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  externalId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeFollowerSearch(value) : value
  )
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  username?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}

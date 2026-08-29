import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  FOLLOWER_BOARD_MOVE_ALLOWED_SEGMENTS,
  FOLLOWER_BOARD_MOVE_FORBIDDEN_SEGMENTS,
} from '@gitroom/nestjs-libraries/database/prisma/channel-interactions/follower-column-pin';

const MOVE_SOURCE_SEGMENTS = [
  ...FOLLOWER_BOARD_MOVE_ALLOWED_SEGMENTS,
  ...FOLLOWER_BOARD_MOVE_FORBIDDEN_SEGMENTS,
] as const;

@ValidatorConstraint({ name: 'FollowerMoveColumnRef', async: false })
class FollowerMoveColumnRefConstraint implements ValidatorConstraintInterface {
  validate(value: FollowerMoveColumnRefDto) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    if (value.kind === 'list') {
      return typeof value.listId === 'string' && value.listId.length > 0;
    }
    if (value.kind === 'segment') {
      return typeof value.slug === 'string' && value.slug.length > 0;
    }
    return false;
  }

  defaultMessage(args?: ValidationArguments) {
    return `${args?.property ?? 'column'} must be a segment or list reference`;
  }
}

export class FollowerMoveColumnRefDto {
  @IsIn(['segment', 'list'])
  kind!: 'segment' | 'list';

  @IsOptional()
  @IsString()
  @IsIn([...MOVE_SOURCE_SEGMENTS, ...FOLLOWER_BOARD_MOVE_ALLOWED_SEGMENTS])
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  listId?: string;
}

export class MoveFollowerColumnDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  externalId!: string;

  @ValidateNested()
  @Type(() => FollowerMoveColumnRefDto)
  @Validate(FollowerMoveColumnRefConstraint)
  from!: FollowerMoveColumnRefDto;

  @ValidateNested()
  @Type(() => FollowerMoveColumnRefDto)
  @Validate(FollowerMoveColumnRefConstraint)
  to!: FollowerMoveColumnRefDto;
}

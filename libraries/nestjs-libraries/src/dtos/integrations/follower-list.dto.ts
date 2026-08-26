import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FOLLOWER_SEGMENT_COLORS } from '@gitroom/nestjs-libraries/integrations/social/follower.sorts';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateFollowerListDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsIn(FOLLOWER_SEGMENT_COLORS)
  color?: string;
}

export class UpdateFollowerListDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsIn(FOLLOWER_SEGMENT_COLORS)
  color?: string;
}

export class FollowerListMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  externalId!: string;
}

export class ImportFollowerListMemberDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url!: string;
}

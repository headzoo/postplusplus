import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class FollowerBoardColumnPreferenceItemDto {
  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(128)
  integrationId: string;

  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(256)
  columnKey: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  position: number;
}

export class SaveFollowerBoardColumnPreferencesDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FollowerBoardColumnPreferenceItemDto)
  preferences: FollowerBoardColumnPreferenceItemDto[];
}

export class GetFollowerBoardColumnPreferencesQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  integrationId?: string;
}

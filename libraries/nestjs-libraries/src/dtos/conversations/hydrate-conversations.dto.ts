import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

export class HydrateConversationsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => String)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  eventIds: string[];
}

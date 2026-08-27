import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateFollowerGradeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  externalId!: string;

  @Type(() => Number)
  @IsNumber()
  @IsIn([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])
  grade!: number;
}

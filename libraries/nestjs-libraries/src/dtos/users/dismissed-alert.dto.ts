import {
  IsDefined,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class DismissAlertDto {
  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(128)
  @Matches(/^[a-z0-9._-]+$/)
  alertKey: string;
}

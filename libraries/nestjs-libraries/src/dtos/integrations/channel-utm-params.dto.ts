import {
  IsString,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidUtmParamsString } from '@gitroom/helpers/utils/utm.params';

@ValidatorConstraint({ name: 'validUtmParams', async: false })
class ValidUtmParamsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string') {
      return false;
    }
    return isValidUtmParamsString(value);
  }

  defaultMessage(_: unknown, args?: ValidationArguments) {
    const value = args?.value;
    if (typeof value !== 'string') {
      return 'utmParams must be a string';
    }
    if (value.includes('#')) {
      return 'utmParams cannot contain #';
    }
    return 'utmParams must be a valid query string such as utm_campaign=spring&utm_medium=social';
  }
}

export class UpdateChannelUtmParamsDto {
  @IsString()
  @MaxLength(1024)
  @Validate(ValidUtmParamsConstraint)
  utmParams!: string;
}

import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { MAX_CONVERSION_ID_LENGTH } from './conversion.shared';

@ValidatorConstraint({ name: 'exclusiveSupportCaseReference', async: false })
class ExclusiveSupportCaseReferenceConstraint
  implements ValidatorConstraintInterface
{
  validate(_: unknown, args: ValidationArguments) {
    const object = args.object as ResolveSupportConversionDto;
    return !!object.caseId !== !!object.externalCaseKey;
  }

  defaultMessage() {
    return 'Provide exactly one of caseId or externalCaseKey';
  }
}

export class ResolveSupportConversionDto {
  @IsString()
  @MaxLength(MAX_CONVERSION_ID_LENGTH)
  eventId: string;

  @IsString()
  @MaxLength(MAX_CONVERSION_ID_LENGTH)
  integrationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CONVERSION_ID_LENGTH)
  @Validate(ExclusiveSupportCaseReferenceConstraint)
  caseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CONVERSION_ID_LENGTH)
  externalCaseKey?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  occurredAt?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

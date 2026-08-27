import {
  ValidationArguments,
  ValidatorConstraintInterface,
  ValidatorConstraint,
} from 'class-validator';
import striptags from 'striptags';

@ValidatorConstraint({ name: 'validateContent', async: false })
export class ValidContent implements ValidatorConstraintInterface {
  validate(contentRaw: string, args: ValidationArguments) {
    const content = striptags(contentRaw || '');
    const object = args.object as { image?: unknown[] };
    if (
      (!object.image ||
        !Array.isArray(object.image) ||
        !object.image.length) &&
      (!content || typeof content !== 'string' || content?.trim() === '')
    ) {
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    // here you can provide default error message if validation failed
    return ' If images do not exist, content must be a non-empty string.';
  }
}

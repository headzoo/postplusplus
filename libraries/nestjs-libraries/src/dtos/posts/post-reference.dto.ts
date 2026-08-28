import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
} from 'class-validator';

export class PostReferenceDto {
  @IsIn(['quote'])
  type: 'quote';

  @IsString()
  @Length(1, 64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  providerIdentifier: string;

  @IsString()
  @Length(1, 128)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  externalId: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @Length(1, 2048)
  url?: string;
}

import { IsString, MaxLength, MinLength } from 'class-validator';

export class FollowFollowerMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  externalId!: string;
}

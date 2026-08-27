import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OmitType } from '@nestjs/swagger';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';

export class PipelineIntegrationDto {
  @IsString()
  @IsDefined()
  id: string;
}

const pipelineHexColorPattern = /^#[0-9A-Fa-f]{6}$/;

export class PipelineScheduleSlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  minuteOfDay: number;
}

export class CreatePipelineDto {
  @IsString()
  @IsDefined()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsDefined()
  @MaxLength(100)
  timezone: string;

  @IsArray()
  @ArrayMinSize(1)
  @Type(() => PipelineIntegrationDto)
  @ValidateNested({ each: true })
  integrations: PipelineIntegrationDto[];

  @IsOptional()
  @IsString()
  @Matches(pipelineHexColorPattern, {
    message: 'Pipeline color must be a six-digit hex value (#RRGGBB)',
  })
  color?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contextDocumentIds?: string[];
}

export class UpdatePipelineDto extends CreatePipelineDto {}

export class UpdatePipelineScheduleDto {
  @IsArray()
  @IsDefined()
  @Type(() => PipelineScheduleSlotDto)
  @ValidateNested({ each: true })
  scheduleSlots: PipelineScheduleSlotDto[];
}

export class GetPipelineScheduleDto {
  @IsDateString()
  @IsDefined()
  startDate: string;

  @IsDateString()
  @IsDefined()
  endDate: string;
}

export class DeletePipelineScheduleSlotDto extends PipelineScheduleSlotDto {}

export class MovePipelineScheduleSlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  sourceDayOfWeek: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  sourceMinuteOfDay: number;

  @IsInt()
  @Min(0)
  @Max(6)
  targetDayOfWeek: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  targetMinuteOfDay: number;

  @IsInt()
  @Min(1)
  expectedScheduleRevision: number;
}

export class ReorderPipelineQueueDto {
  @IsArray()
  @IsDefined()
  @ArrayMinSize(2)
  @IsString({ each: true })
  itemIds: string[];
}

export class PipelineStatusDto {
  @IsBoolean()
  @IsDefined()
  active: boolean;
}

export class PipelinePostDto extends OmitType(CreatePostDto, [
  'date',
] as const) {}

export class EnqueuePipelinePostDto {
  @IsString()
  @IsDefined()
  pipelineId: string;

  @Type(() => PipelinePostDto)
  @ValidateNested()
  post: PipelinePostDto;
}

export class ReorderPipelineQueueItemDto {
  @IsOptional()
  @IsString()
  beforeItemId?: string;

  @IsOptional()
  @IsString()
  afterItemId?: string;
}

export class MovePipelineQueueItemDto {
  @IsString()
  @IsDefined()
  destinationPipelineId: string;

  @IsOptional()
  @IsString()
  beforeItemId?: string;

  @IsOptional()
  @IsString()
  afterItemId?: string;
}

export class DeletePipelineDto {
  @IsBoolean()
  @IsDefined()
  confirmDetach: boolean;
}

export class ManualSchedulePipelineItemDto {
  @IsDateString()
  @IsDefined()
  date: string;
}

export class PipelineItemActionDto {
  @IsIn(['remove', 'delete', 'publish-now'])
  @IsDefined()
  action: 'remove' | 'delete' | 'publish-now';
}

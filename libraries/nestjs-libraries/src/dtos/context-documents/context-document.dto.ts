import {
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export type ContextDocumentMetadataDto = {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  fileSize: number;
  createdAt: Date;
  updatedAt: Date;
  isLarge: boolean;
  warning?: string;
  skill?: {
    slug: string;
    command: string;
    conflict: boolean;
  };
};

export type ContextDocumentContentDto = {
  id: string;
  name: string;
  description?: string | null;
  content: string;
  fileSize: number;
  updatedAt: Date;
  isLarge: boolean;
  warning?: string;
};

export type ContextDocumentUploadResponseDto = ContextDocumentMetadataDto;

export type SkillMetadataDto = {
  slug: string;
  command: string;
  id: string;
  name: string;
  fileSize: number;
  updatedAt: Date;
  isLarge: boolean;
  warning?: string;
};

export type SkillContentDto = SkillMetadataDto & {
  content: string;
};

export class CreateContextDocumentDto {
  @IsString()
  @IsDefined()
  name: string;

  @IsOptional()
  @IsString()
  content?: string;
}

export class UpdateContextDocumentDto {
  @IsOptional()
  @IsString()
  content?: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string | null;
}

export class RenameContextDocumentDto {
  @IsString()
  @IsDefined()
  name: string;
}

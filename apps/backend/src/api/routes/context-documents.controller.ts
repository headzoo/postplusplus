import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags } from '@nestjs/swagger';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ContextDocumentService } from '@gitroom/nestjs-libraries/database/prisma/context-documents/context-document.service';
import { CONTEXT_DOCUMENT_MAX_BYTES } from '@gitroom/nestjs-libraries/upload/context-document.upload.validation';
import {
  CreateContextDocumentDto,
  RenameContextDocumentDto,
  UpdateContextDocumentDto,
} from '@gitroom/nestjs-libraries/dtos/context-documents/context-document.dto';

@ApiTags('Context Documents')
@Controller('/context-documents')
export class ContextDocumentsController {
  constructor(private _contextDocumentService: ContextDocumentService) { }

  @Get('/')
  listDocuments(@GetOrgFromRequest() org: Organization) {
    return this._contextDocumentService.listDocuments(org.id);
  }

  @Post('/')
  createDocument(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateContextDocumentDto
  ) {
    return this._contextDocumentService.createDocument(org.id, body);
  }

  @Post('/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: CONTEXT_DOCUMENT_MAX_BYTES,
      },
    })
  )
  uploadDocument(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile() file: Express.Multer.File
  ) {
    return this._contextDocumentService.uploadDocument(org.id, file);
  }

  @Get('/skills')
  listSkills(@GetOrgFromRequest() org: Organization) {
    return this._contextDocumentService.listSkills(org.id);
  }

  @Get('/skills/:slug')
  getSkill(
    @GetOrgFromRequest() org: Organization,
    @Param('slug') slug: string
  ) {
    return this._contextDocumentService.getSkillBySlug(org.id, slug);
  }

  @Get('/:id')
  getDocument(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._contextDocumentService.getDocumentById(org.id, id);
  }

  @Put('/:id')
  updateDocument(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateContextDocumentDto
  ) {
    return this._contextDocumentService.updateDocument(org.id, id, body);
  }

  @Put('/:id/rename')
  renameDocument(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: RenameContextDocumentDto
  ) {
    return this._contextDocumentService.renameDocument(org.id, id, body.name);
  }

  @Delete('/:id')
  deleteDocument(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._contextDocumentService.deleteDocument(org.id, id);
  }
}

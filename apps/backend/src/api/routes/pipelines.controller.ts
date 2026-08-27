import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { PipelineService } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.service';
import {
  CreatePipelineDto,
  DeletePipelineDto,
  DeletePipelineScheduleSlotDto,
  GetPipelineScheduleDto,
  ManualSchedulePipelineItemDto,
  MovePipelineQueueItemDto,
  MovePipelineScheduleSlotDto,
  PipelineItemActionDto,
  PipelineStatusDto,
  ReorderPipelineQueueDto,
  ReorderPipelineQueueItemDto,
  UpdatePipelineScheduleDto,
  UpdatePipelineDto,
} from '@gitroom/nestjs-libraries/dtos/pipelines/pipeline.dto';

@ApiTags('Pipelines')
@Controller('/pipelines')
export class PipelinesController {
  constructor(private _pipelineService: PipelineService) {}

  @Get('/')
  getPipelines(@GetOrgFromRequest() org: Organization) {
    return this._pipelineService.getPipelines(org.id);
  }

  @Get('/calendar')
  getCalendarPosts(
    @GetOrgFromRequest() org: Organization,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('customer') customer?: string
  ) {
    return this._pipelineService.getCalendarPosts(
      org.id,
      startDate,
      endDate,
      customer
    );
  }

  @Get('/schedule')
  getSchedule(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetPipelineScheduleDto
  ) {
    return this._pipelineService.getPipelineSchedule(org.id, query);
  }

  @Post('/')
  createPipeline(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreatePipelineDto
  ) {
    return this._pipelineService.createPipeline(org.id, body);
  }

  @Post('/enqueue')
  enqueue(@GetOrgFromRequest() org: Organization, @Body() rawBody: any) {
    // Match /posts: validate in the service layer after mapTypeToPost adds
    // settings.__type from the integration — not via controller DTO validation.
    return this._pipelineService.enqueue(org.id, rawBody);
  }

  @Post('/items/:itemId/move')
  moveItem(
    @GetOrgFromRequest() org: Organization,
    @Param('itemId') itemId: string,
    @Body() body: MovePipelineQueueItemDto
  ) {
    return this._pipelineService.moveItem(org.id, itemId, body);
  }

  @Post('/items/:itemId/action')
  itemAction(
    @GetOrgFromRequest() org: Organization,
    @Param('itemId') itemId: string,
    @Body() body: PipelineItemActionDto
  ) {
    if (body.action === 'publish-now') {
      return this._pipelineService.publishNow(org.id, itemId);
    }
    if (body.action === 'delete') {
      return this._pipelineService.deleteItem(org.id, itemId);
    }
    return this._pipelineService.detachItem(org.id, itemId);
  }

  @Post('/items/:itemId/schedule')
  manuallyScheduleItem(
    @GetOrgFromRequest() org: Organization,
    @Param('itemId') itemId: string,
    @Body() body: ManualSchedulePipelineItemDto
  ) {
    return this._pipelineService.scheduleItem(org.id, itemId, body.date);
  }

  @Get('/:id')
  getPipeline(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._pipelineService.getPipeline(org.id, id);
  }

  @Put('/:id')
  updatePipeline(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdatePipelineDto
  ) {
    return this._pipelineService.updatePipeline(org.id, id, body);
  }

  @Put('/:id/schedule')
  updatePipelineSchedule(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdatePipelineScheduleDto
  ) {
    return this._pipelineService.updatePipelineSchedule(org.id, id, body);
  }

  @Delete('/:id/schedule')
  deletePipelineScheduleSlot(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: DeletePipelineScheduleSlotDto
  ) {
    return this._pipelineService.deletePipelineScheduleSlot(org.id, id, body);
  }

  @Patch('/:id/schedule/slot')
  movePipelineScheduleSlot(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: MovePipelineScheduleSlotDto
  ) {
    return this._pipelineService.movePipelineScheduleSlot(org.id, id, body);
  }

  @Post('/:id/items/reorder')
  reorderQueue(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: ReorderPipelineQueueDto
  ) {
    return this._pipelineService.reorderQueue(org.id, id, body);
  }

  @Post('/:id/status')
  setStatus(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: PipelineStatusDto
  ) {
    return this._pipelineService.setActive(org.id, id, body.active);
  }

  @Delete('/:id')
  deletePipeline(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: DeletePipelineDto
  ) {
    if (!body.confirmDetach) {
      throw new BadRequestException(
        'Pipeline deletion requires confirmDetach: true'
      );
    }
    return this._pipelineService.deletePipeline(org.id, id);
  }

  @Post('/:pipelineId/items/:itemId/reorder')
  reorderItem(
    @GetOrgFromRequest() org: Organization,
    @Param('pipelineId') pipelineId: string,
    @Param('itemId') itemId: string,
    @Body() body: ReorderPipelineQueueItemDto
  ) {
    return this._pipelineService.reorderItem(org.id, pipelineId, itemId, body);
  }
}

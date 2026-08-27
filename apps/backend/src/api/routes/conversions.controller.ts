import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConversionSource } from '@prisma/client';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ConversionService } from '@gitroom/nestjs-libraries/database/prisma/conversions/conversion.service';
import { IngestGoalDto } from '@gitroom/nestjs-libraries/dtos/conversions/ingest-goal.dto';
import { ResolveSupportConversionDto } from '@gitroom/nestjs-libraries/dtos/conversions/resolve-support.dto';
import {
  assertListDateRange,
  ListConversionsQueryDto,
  SummarizeConversionsQueryDto,
} from '@gitroom/nestjs-libraries/dtos/conversions/list-conversions.query.dto';
import { STANDARD_UTM_FIELDS } from '@gitroom/nestjs-libraries/dtos/conversions/conversion.shared';

const mapIngestGoalBody = (body: IngestGoalDto) => ({
  eventId: body.eventId,
  goal: body.goal,
  occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
  ppClickId: body.attribution.ppClickId,
  utm: Object.fromEntries(
    STANDARD_UTM_FIELDS.map((field) => [field, body.attribution[field]])
  ),
  actorExternalId: body.actorExternalId,
  userProperties: body.userProperties,
  metadata: body.metadata,
});

const mapHttpError = (error: unknown): never => {
  const message =
    error instanceof Error ? error.message : 'Conversion request failed';
  throw new HttpException({ msg: message }, 400);
};

@ApiTags('Conversions')
@Controller('/conversions')
export class ConversionsController {
  constructor(private _conversionService: ConversionService) {}

  @Get('/:integrationId')
  async listConversions(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Query() query: ListConversionsQueryDto
  ) {
    try {
      assertListDateRange(query);
      return await this._conversionService.listConversions(
        org.id,
        integrationId,
        {
          take: query.take,
          cursor: query.cursor,
          from: query.from,
          to: query.to,
          conversionType: query.conversionType,
          strategyId: query.strategyId,
        }
      );
    } catch (error) {
      mapHttpError(error);
    }
  }

  @Get('/:integrationId/summary')
  async summarizeConversions(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Query() query: SummarizeConversionsQueryDto
  ) {
    try {
      return await this._conversionService.summarizeConversions(
        org.id,
        integrationId,
        query.from,
        query.to
      );
    } catch (error) {
      mapHttpError(error);
    }
  }

  @Post('/:integrationId/goals')
  async ingestGoal(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body() body: IngestGoalDto
  ) {
    try {
      return await this._conversionService.ingestGoal({
        ...mapIngestGoalBody(body),
        organizationId: org.id,
        source: ConversionSource.API,
        integrationId: body.integrationId || integrationId,
      });
    } catch (error) {
      mapHttpError(error);
    }
  }

  @Post('/:integrationId/support-resolution')
  async resolveSupportCase(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body() body: ResolveSupportConversionDto
  ) {
    if (body.integrationId !== integrationId) {
      throw new HttpException(
        { msg: 'integrationId must match the route integration' },
        400
      );
    }
    try {
      return await this._conversionService.resolveSupportCasePublic({
        organizationId: org.id,
        integrationId,
        caseId: body.caseId,
        externalCaseKey: body.externalCaseKey,
        eventId: body.eventId,
        resolvedAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
        metadata: body.metadata,
      });
    } catch (error) {
      mapHttpError(error);
    }
  }
}

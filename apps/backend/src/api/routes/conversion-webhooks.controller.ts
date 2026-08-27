import {
  Body,
  Controller,
  Headers,
  HttpException,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConversionSource } from '@prisma/client';
import { ConversionService } from '@gitroom/nestjs-libraries/database/prisma/conversions/conversion.service';
import { IngestGoalDto } from '@gitroom/nestjs-libraries/dtos/conversions/ingest-goal.dto';
import { STANDARD_UTM_FIELDS } from '@gitroom/nestjs-libraries/dtos/conversions/conversion.shared';

const parseBearerToken = (authorization?: string) => {
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  const token = authorization.slice('Bearer '.length).trim();
  return token.length ? token : null;
};

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

@ApiTags('Conversion webhooks')
@Controller('/conversion-webhooks')
export class ConversionWebhooksController {
  constructor(private _conversionService: ConversionService) {}

  @Post('/:integrationId')
  async ingestGoal(
    @Param('integrationId') integrationId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: IngestGoalDto
  ) {
    const bearerToken = parseBearerToken(authorization);
    if (!bearerToken) {
      throw new UnauthorizedException();
    }

    const integration =
      await this._conversionService.findIntegrationForConversionWebhook(
        integrationId
      );
    if (!integration) {
      throw new UnauthorizedException();
    }

    const authorized =
      await this._conversionService.verifyConversionWebhookCredential(
        integration.organizationId,
        integrationId,
        bearerToken
      );
    if (!authorized) {
      throw new UnauthorizedException();
    }

    if (body.integrationId && body.integrationId !== integrationId) {
      throw new HttpException(
        { msg: 'integrationId must match the route integration' },
        400
      );
    }

    try {
      return await this._conversionService.ingestGoal({
        ...mapIngestGoalBody(body),
        organizationId: integration.organizationId,
        source: ConversionSource.WEBHOOK,
        integrationId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Conversion request failed';
      throw new HttpException({ msg: message }, 400);
    }
  }
}

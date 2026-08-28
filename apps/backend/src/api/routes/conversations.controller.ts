import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { ConversationService } from '@gitroom/nestjs-libraries/database/prisma/conversations/conversation.service';
import { HydrateConversationsDto } from '@gitroom/nestjs-libraries/dtos/conversations/hydrate-conversations.dto';
import { ListConversationsQueryDto } from '@gitroom/nestjs-libraries/dtos/conversations/list-conversations.query.dto';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';

@ApiTags('Conversations')
@Controller('/conversations')
export class ConversationsController {
  constructor(private _conversationService: ConversationService) {}

  @Get()
  list(
    @GetOrgFromRequest() org: Organization,
    @Query() query: ListConversationsQueryDto
  ) {
    return this._conversationService.list(org.id, query);
  }

  @Post('/hydrate')
  hydrate(
    @GetOrgFromRequest() org: Organization,
    @Body() body: HydrateConversationsDto
  ) {
    return this._conversationService.hydrate(org.id, body.eventIds);
  }

  @Post('/:eventId/repost')
  repost(
    @GetOrgFromRequest() org: Organization,
    @Param('eventId') eventId: string
  ) {
    return this._conversationService.repost(org.id, eventId);
  }
}

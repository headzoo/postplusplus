import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { FollowerMemberQueryDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-member.query.dto';
import { FollowerMemberTimelineQueryDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-member-timeline.query.dto';
import { UpdateFollowerGradeDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-grade.dto';
import { RefreshFollowerRelationshipScoreDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-relationship-score.dto';
import {
  CreateFollowerNoteDto,
  UpdateFollowerNoteDto,
} from '@gitroom/nestjs-libraries/dtos/integrations/follower-note.dto';
import {
  CreateFollowerListDto,
  FollowerListMemberDto,
  ImportFollowerListMemberDto,
  UpdateFollowerListDto,
} from '@gitroom/nestjs-libraries/dtos/integrations/follower-list.dto';
import { IgnoreFollowerTriageDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-triage-ignore.dto';
import { FollowFollowerMemberDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-follow.dto';
import { UnfollowFollowerMemberDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-unfollow.dto';
import { IgnoreFollowerDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-ignore.dto';
import { MoveFollowerColumnDto } from '@gitroom/nestjs-libraries/dtos/integrations/follower-move-column.dto';
import { FollowersQueryDto } from '@gitroom/nestjs-libraries/dtos/integrations/followers.query.dto';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';

@ApiTags('Followers')
@Controller('/followers')
export class FollowersController {
  constructor(private _integrationService: IntegrationService) {}

  @Get('/channels')
  getChannels(@GetOrgFromRequest() org: Organization) {
    return this._integrationService.getFollowerChannels(org);
  }

  @Get('/:integrationId/member')
  getFollowerMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string,
    @Query() query: FollowerMemberQueryDto
  ) {
    return this._integrationService.getFollowerMemberDetails(
      org,
      user,
      integrationId,
      query.externalId,
      query.username
    );
  }

  @Get('/:integrationId/member/timeline')
  getFollowerMemberTimeline(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Query() query: FollowerMemberTimelineQueryDto
  ) {
    return this._integrationService.getFollowerMemberTimeline(
      org,
      integrationId,
      query.externalId,
      query.username,
      query.limit,
      query.cursor
    );
  }

  @Post('/:integrationId/member/relationship-score')
  refreshFollowerMemberRelationshipScore(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body() body: RefreshFollowerRelationshipScoreDto
  ) {
    return this._integrationService.refreshFollowerMemberRelationshipScore(
      org,
      integrationId,
      body.externalId,
      body.direction
    );
  }

  @Post('/:integrationId/member/triage-ignore')
  ignoreFollowerMemberTriage(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string,
    @Body() body: IgnoreFollowerTriageDto
  ) {
    return this._integrationService.ignoreFollowerMemberTriage(
      org,
      user,
      integrationId,
      body.externalId,
      body.triage,
      body.reasons,
      body.snooze
    );
  }

  @Post('/:integrationId/member/follow')
  followFollowerMember(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body() body: FollowFollowerMemberDto
  ) {
    return this._integrationService.followFollowerMember(
      org,
      integrationId,
      body.externalId
    );
  }

  @Post('/:integrationId/member/unfollow')
  unfollowFollowerMember(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body() body: UnfollowFollowerMemberDto
  ) {
    return this._integrationService.unfollowFollowerMember(
      org,
      integrationId,
      body.externalId
    );
  }

  @Post('/:integrationId/member/ignore')
  ignoreFollowerMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string,
    @Body() body: IgnoreFollowerDto
  ) {
    return this._integrationService.ignoreFollowerMember(
      org,
      user,
      integrationId,
      body.externalId
    );
  }

  @Post('/:integrationId/member/move-column')
  moveFollowerMemberColumn(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string,
    @Body() body: MoveFollowerColumnDto
  ) {
    return this._integrationService.moveFollowerMemberColumn(
      org,
      user,
      integrationId,
      body.externalId,
      body.from,
      body.to
    );
  }

  @Delete('/:integrationId/member/ignore')
  unignoreFollowerMember(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body() body: IgnoreFollowerDto
  ) {
    return this._integrationService.unignoreFollowerMember(
      org,
      integrationId,
      body.externalId
    );
  }

  @Put('/:integrationId/member/my-grade')
  updateFollowerMemberGrade(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string,
    @Body() body: UpdateFollowerGradeDto
  ) {
    return this._integrationService.updateFollowerMemberGrade(
      org,
      user,
      integrationId,
      body.externalId,
      body.grade
    );
  }

  @Post('/:integrationId/member/notes')
  createFollowerMemberNote(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string,
    @Body() body: CreateFollowerNoteDto
  ) {
    return this._integrationService.createFollowerMemberNote(
      org,
      user,
      integrationId,
      body.externalId,
      body.content
    );
  }

  @Put('/:integrationId/member/notes/:noteId')
  updateFollowerMemberNote(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Param('noteId') noteId: string,
    @Body() body: UpdateFollowerNoteDto
  ) {
    return this._integrationService.updateFollowerMemberNote(
      org,
      integrationId,
      noteId,
      body.content
    );
  }

  @Delete('/:integrationId/member/notes/:noteId')
  deleteFollowerMemberNote(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Param('noteId') noteId: string
  ) {
    return this._integrationService.deleteFollowerMemberNote(
      org,
      integrationId,
      noteId
    );
  }

  @Get('/:integrationId/audience')
  getFollowerAudienceSummary(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string
  ) {
    return this._integrationService.getFollowerAudienceSummary(
      org,
      user,
      integrationId
    );
  }

  @Get('/:integrationId/lists')
  listFollowerLists(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string
  ) {
    return this._integrationService.listFollowerLists(org, integrationId);
  }

  @Post('/:integrationId/lists')
  createFollowerList(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string,
    @Body() body: CreateFollowerListDto
  ) {
    return this._integrationService.createFollowerList(
      org,
      user,
      integrationId,
      body.name,
      body.color
    );
  }

  @Put('/:integrationId/lists/:listId')
  updateFollowerList(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Param('listId') listId: string,
    @Body() body: UpdateFollowerListDto
  ) {
    return this._integrationService.updateFollowerList(
      org,
      integrationId,
      listId,
      body.name,
      body.color
    );
  }

  @Delete('/:integrationId/lists/:listId')
  deleteFollowerList(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Param('listId') listId: string
  ) {
    return this._integrationService.deleteFollowerList(
      org,
      integrationId,
      listId
    );
  }

  @Post('/:integrationId/lists/:listId/members')
  addFollowerListMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string,
    @Param('listId') listId: string,
    @Body() body: FollowerListMemberDto
  ) {
    return this._integrationService.addFollowerListMember(
      org,
      user,
      integrationId,
      listId,
      body.externalId
    );
  }

  @Post('/:integrationId/lists/:listId/members/import')
  importFollowerListMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string,
    @Param('listId') listId: string,
    @Body() body: ImportFollowerListMemberDto
  ) {
    return this._integrationService.importFollowerListMemberFromUrl(
      org,
      user,
      integrationId,
      listId,
      body.url
    );
  }

  @Post('/:integrationId/leads/import')
  importLead(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string,
    @Body() body: ImportFollowerListMemberDto
  ) {
    return this._integrationService.importLeadFromUrl(
      org,
      user,
      integrationId,
      body.url
    );
  }

  @Delete('/:integrationId/lists/:listId/members')
  removeFollowerListMember(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Param('listId') listId: string,
    @Body() body: FollowerListMemberDto
  ) {
    return this._integrationService.removeFollowerListMember(
      org,
      integrationId,
      listId,
      body.externalId
    );
  }

  @Get('/:integrationId')
  getFollowers(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('integrationId') integrationId: string,
    @Query() query: FollowersQueryDto
  ) {
    return this._integrationService.getFollowers(
      org,
      user,
      integrationId,
      query
    );
  }
}

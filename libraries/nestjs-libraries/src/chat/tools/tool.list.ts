import { IntegrationValidationTool } from '@gitroom/nestjs-libraries/chat/tools/integration.validation.tool';
import { IntegrationTriggerTool } from '@gitroom/nestjs-libraries/chat/tools/integration.trigger.tool';
import { IntegrationSchedulePostTool } from './integration.schedule.post';
import { GenerateVideoOptionsTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.options.tool';
import { VideoFunctionTool } from '@gitroom/nestjs-libraries/chat/tools/video.function.tool';
import { GenerateVideoTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.tool';
import { GenerateImageTool } from '@gitroom/nestjs-libraries/chat/tools/generate.image.tool';
import { IntegrationListTool } from '@gitroom/nestjs-libraries/chat/tools/integration.list.tool';
import { GroupListTool } from '@gitroom/nestjs-libraries/chat/tools/group.list.tool';
import { UploadFromUrlTool } from '@gitroom/nestjs-libraries/chat/tools/upload.from.url.tool';
import { PostsListTool } from '@gitroom/nestjs-libraries/chat/tools/posts.list.tool';
import { PipelinesListTool } from '@gitroom/nestjs-libraries/chat/tools/pipelines.list.tool';
import { PipelinePostsListTool } from '@gitroom/nestjs-libraries/chat/tools/pipeline.posts.list.tool';
import { PipelineEnqueuePostTool } from '@gitroom/nestjs-libraries/chat/tools/pipeline.enqueue.post.tool';
import { PipelineContextDocumentReadTool } from '@gitroom/nestjs-libraries/chat/tools/pipeline.context-document.read.tool';
import { ContextDocumentsListTool } from '@gitroom/nestjs-libraries/chat/tools/context-documents.list.tool';
import { ContextDocumentReadTool } from '@gitroom/nestjs-libraries/chat/tools/context-documents.read.tool';
import { FollowerChannelsTool } from '@gitroom/nestjs-libraries/chat/tools/follower.channels.tool';
import { FollowersListTool } from '@gitroom/nestjs-libraries/chat/tools/followers.list.tool';
import { FollowerDetailTool } from '@gitroom/nestjs-libraries/chat/tools/follower.detail.tool';
import { FollowerTimelineTool } from '@gitroom/nestjs-libraries/chat/tools/follower.timeline.tool';
import { FollowerListsTool } from '@gitroom/nestjs-libraries/chat/tools/follower.lists.tool';
import { FollowerStatisticsTool } from '@gitroom/nestjs-libraries/chat/tools/follower.statistics.tool';
import { ChannelFollowerTotalsTool } from '@gitroom/nestjs-libraries/chat/tools/channel.follower.totals.tool';
import { FollowerListRemoveMembersTool } from '@gitroom/nestjs-libraries/chat/tools/follower.list.remove.members.tool';
import { FollowerListAddMemberTool } from '@gitroom/nestjs-libraries/chat/tools/follower.list.add.member.tool';
import { FollowerIgnoreTool } from '@gitroom/nestjs-libraries/chat/tools/follower.ignore.tool';
import { FollowerUnignoreTool } from '@gitroom/nestjs-libraries/chat/tools/follower.unignore.tool';
import { FollowerTriageIgnoreTool } from '@gitroom/nestjs-libraries/chat/tools/follower.triage.ignore.tool';
import { AgentSkillsListTool } from '@gitroom/nestjs-libraries/chat/tools/agent-skills.list.tool';
import { AgentSkillLoadTool } from '@gitroom/nestjs-libraries/chat/tools/agent-skill.load.tool';

export const toolList = [
  IntegrationListTool,
  GroupListTool,
  PostsListTool,
  FollowerChannelsTool,
  FollowersListTool,
  FollowerDetailTool,
  FollowerTimelineTool,
  FollowerListsTool,
  FollowerStatisticsTool,
  ChannelFollowerTotalsTool,
  FollowerListRemoveMembersTool,
  FollowerListAddMemberTool,
  FollowerIgnoreTool,
  FollowerUnignoreTool,
  FollowerTriageIgnoreTool,
  PipelinesListTool,
  PipelinePostsListTool,
  PipelineEnqueuePostTool,
  PipelineContextDocumentReadTool,
  ContextDocumentsListTool,
  ContextDocumentReadTool,
  AgentSkillsListTool,
  AgentSkillLoadTool,
  IntegrationValidationTool,
  IntegrationTriggerTool,
  IntegrationSchedulePostTool,
  GenerateVideoOptionsTool,
  VideoFunctionTool,
  GenerateVideoTool,
  GenerateImageTool,
  UploadFromUrlTool,
];

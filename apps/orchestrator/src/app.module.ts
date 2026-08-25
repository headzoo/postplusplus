import { Module } from '@nestjs/common';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import { getTemporalModule } from '@gitroom/nestjs-libraries/temporal/temporal.module';
import { DatabaseModule } from '@gitroom/nestjs-libraries/database/prisma/database.module';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';
import { EmailActivity } from '@gitroom/orchestrator/activities/email.activity';
import { IntegrationsActivity } from '@gitroom/orchestrator/activities/integrations.activity';
import { HealthController } from '@gitroom/orchestrator/health.controller';
import { PipelineActivity } from '@gitroom/orchestrator/activities/pipeline.activity';
import { ChannelInteractionActivity } from '@gitroom/orchestrator/activities/channel-interaction.activity';
import { ChannelRelationshipGradeActivity } from '@gitroom/orchestrator/activities/channel-relationship-grade.activity';
import { ChannelFollowerBotScoreActivity } from '@gitroom/orchestrator/activities/channel-follower-bot-score.activity';
import { ChannelLeadBridgeActivity } from '@gitroom/orchestrator/activities/channel-lead-bridge.activity';
import { ChannelCultivateActivity } from '@gitroom/orchestrator/activities/channel-cultivate.activity';
import { ChannelHotMaterializationActivity } from '@gitroom/orchestrator/activities/channel-hot-materialization.activity';
import { ChannelAnalyticsSnapshotActivity } from '@gitroom/orchestrator/activities/channel-analytics-snapshot.activity';
import { AutopostActivity } from '@gitroom/orchestrator/activities/autopost.activity';

const activities = [
  PostActivity,
  AutopostActivity,
  EmailActivity,
  IntegrationsActivity,
  PipelineActivity,
  ChannelInteractionActivity,
  ChannelRelationshipGradeActivity,
  ChannelFollowerBotScoreActivity,
  ChannelLeadBridgeActivity,
  ChannelCultivateActivity,
  ChannelHotMaterializationActivity,
  ChannelAnalyticsSnapshotActivity,
];
@Module({
  imports: [
    DatabaseModule,
    getTemporalModule(true, require.resolve('./workflows'), activities),
  ],
  controllers: [HealthController],
  providers: [...activities],
  get exports() {
    return [...this.providers, ...this.imports];
  },
})
export class AppModule { }

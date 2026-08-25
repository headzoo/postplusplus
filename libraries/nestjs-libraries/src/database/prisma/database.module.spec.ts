jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager { },
}));

import { Test } from '@nestjs/testing';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { TemporalService } from 'nestjs-temporal-core';
import { IntegrationService } from './integrations/integration.service';
import { IntegrationRepository } from './integrations/integration.repository';
import { AutopostRepository } from './autopost/autopost.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { NotificationService } from './notifications/notification.service';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { PipelinePlugService } from './pipelines/pipeline.plug.service';
import { ChannelInteractionService } from './channel-interactions/channel-interaction.service';
import { ChannelInteractionRepository } from './channel-interactions/channel-interaction.repository';
import { ChannelAnalyticsService } from './channel-analytics/channel-analytics.service';
import { ChannelAnalyticsRepository } from './channel-analytics/channel-analytics.repository';
import { AdminScheduleLogService } from './admin-schedule-logs/admin-schedule-log.service';
import { RelationshipGradeScheduleService } from '@gitroom/nestjs-libraries/temporal/relationship-grade.schedule.service';
import { HotMaterializationScheduleService } from '@gitroom/nestjs-libraries/temporal/hot-triage.schedule.service';
import { CultivateMaterializationScheduleService } from '@gitroom/nestjs-libraries/temporal/cultivate.schedule.service';
import { InfiniteWorkflowRegisterModule } from '@gitroom/nestjs-libraries/temporal/infinite.workflow.register';

const moduleProviders = (module: object) =>
  (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) ?? []) as unknown[];

describe('DatabaseModule dependency wiring', () => {
  it('does not register RelationshipGradeScheduleService in InfiniteWorkflowRegisterModule', () => {
    expect(moduleProviders(InfiniteWorkflowRegisterModule)).not.toContain(
      RelationshipGradeScheduleService
    );
  });

  it('registers HotMaterializationScheduleService in InfiniteWorkflowRegisterModule', () => {
    expect(moduleProviders(InfiniteWorkflowRegisterModule)).toContain(
      HotMaterializationScheduleService
    );
  });

  it('registers CultivateMaterializationScheduleService in InfiniteWorkflowRegisterModule', () => {
    expect(moduleProviders(InfiniteWorkflowRegisterModule)).toContain(
      CultivateMaterializationScheduleService
    );
  });

  it('resolves IntegrationService without InfiniteWorkflowRegisterModule when RelationshipGradeScheduleService is provided', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        IntegrationService,
        RelationshipGradeScheduleService,
        { provide: IntegrationRepository, useValue: {} },
        { provide: AutopostRepository, useValue: {} },
        { provide: IntegrationManager, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: RefreshIntegrationService, useValue: {} },
        { provide: TemporalService, useValue: { client: null } },
        { provide: PipelinePlugService, useValue: {} },
        { provide: ChannelInteractionService, useValue: {} },
        { provide: ChannelInteractionRepository, useValue: {} },
        { provide: ChannelAnalyticsService, useValue: {} },
        { provide: ChannelAnalyticsRepository, useValue: {} },
        { provide: AdminScheduleLogService, useValue: { append: jest.fn() } },
      ],
    }).compile();

    expect(moduleRef.get(IntegrationService)).toBeInstanceOf(IntegrationService);
    expect(
      moduleRef.get(RelationshipGradeScheduleService)
    ).toBeInstanceOf(RelationshipGradeScheduleService);

    await moduleRef.close();
  });
});

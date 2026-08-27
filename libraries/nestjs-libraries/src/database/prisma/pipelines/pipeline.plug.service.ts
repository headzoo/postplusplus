import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { PipelinePlugRepository } from './pipeline.plug.repository';

export type GlobalPlugWorkItem = {
  type: 'global';
  source: 'channel' | 'pipeline';
  plugId: string;
  delay: number;
  totalRuns: number;
};

@Injectable()
export class PipelinePlugService {
  constructor(
    private _pipelinePlugRepository: PipelinePlugRepository,
    private _integrationRepository: IntegrationRepository,
    private _integrationManager: IntegrationManager
  ) {}

  async list(orgId: string, pipelineId: string, integrationId: string) {
    await this.getAssignedIntegration(orgId, pipelineId, integrationId);
    return this._pipelinePlugRepository.list(orgId, pipelineId, integrationId);
  }

  async upsert(
    orgId: string,
    pipelineId: string,
    integrationId: string,
    body: PlugDto
  ) {
    const integration = await this.getAssignedIntegration(
      orgId,
      pipelineId,
      integrationId
    );
    this.validatePlug(integration.providerIdentifier, body);
    const plug = await this._pipelinePlugRepository.upsert(
      orgId,
      pipelineId,
      integrationId,
      body
    );
    if (!plug) {
      throw new NotFoundException('Pipeline integration not found');
    }
    return plug;
  }

  async activate(
    orgId: string,
    pipelineId: string,
    plugId: string,
    activated: boolean
  ) {
    const result = await this._pipelinePlugRepository.activate(
      orgId,
      pipelineId,
      plugId,
      activated
    );
    if (!result.count) {
      throw new NotFoundException('Pipeline plug not found');
    }
    return { id: plugId, activated };
  }

  async resolveGlobalPlugs(
    postId: string,
    integrationId: string,
    providerIdentifier: string
  ): Promise<GlobalPlugWorkItem[]> {
    const post = await this._pipelinePlugRepository.getPostPipelineScope(
      postId,
      integrationId
    );
    if (!post) {
      return [];
    }
    const source = post.pipelineQueueItem ? 'pipeline' : 'channel';
    const plugs = post.pipelineQueueItem
      ? await this._pipelinePlugRepository.getActiveForExecution(
          post.pipelineQueueItem.pipelineId,
          integrationId
        )
      : await this._integrationRepository.getPlugs(
          post.organizationId,
          integrationId
        );

    return this.toWorkItems(providerIdentifier, plugs, source);
  }

  getForExecution(source: 'channel' | 'pipeline', plugId: string) {
    if (source === 'pipeline') {
      return this._pipelinePlugRepository.getForExecution(plugId);
    }
    return this._integrationRepository.getPlug(plugId);
  }

  private async getAssignedIntegration(
    orgId: string,
    pipelineId: string,
    integrationId: string
  ) {
    const pipeline = await this._pipelinePlugRepository.getPipelineIntegration(
      orgId,
      pipelineId,
      integrationId
    );
    const integration = pipeline?.integrations[0]?.integration;
    if (!integration) {
      throw new NotFoundException('Pipeline integration not found');
    }
    return integration;
  }

  private validatePlug(providerIdentifier: string, body: PlugDto) {
    if (!Array.isArray(body.fields)) {
      throw new BadRequestException('Plug fields must be an array');
    }
    const provider = this._integrationManager
      .getAllPlugs()
      .find((entry) => entry.identifier === providerIdentifier);
    const plug = provider?.plugs.find(
      (entry: any) => entry.methodName === body.func
    );
    if (!plug) {
      throw new BadRequestException('Unsupported plug function');
    }
    const expectedFields = plug.fields.map((field: any) => field.name).sort();
    const submittedFields = body.fields.map((field) => field.name);
    if (
      new Set(submittedFields).size !== submittedFields.length ||
      submittedFields.length !== expectedFields.length ||
      [...submittedFields]
        .sort()
        .some((field, index) => field !== expectedFields[index])
    ) {
      throw new BadRequestException(
        'Plug fields do not match the provider definition'
      );
    }
  }

  private toWorkItems(
    providerIdentifier: string,
    records: Array<{ id: string; plugFunction: string }>,
    source: 'channel' | 'pipeline'
  ): GlobalPlugWorkItem[] {
    const provider = this._integrationManager
      .getAllPlugs()
      .find((entry) => entry.identifier === providerIdentifier);
    return records.flatMap((record) => {
      const metadata = provider?.plugs.find(
        (plug: any) => plug.methodName === record.plugFunction
      );
      if (!metadata) {
        return [];
      }
      return [
        {
          type: 'global' as const,
          source,
          plugId: record.id,
          delay: metadata.runEveryMilliseconds,
          totalRuns: metadata.totalRuns,
        },
      ];
    });
  }
}

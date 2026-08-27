import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import {
  isActivePipelineIntegration,
  PipelineRepository,
} from './pipeline.repository';
import { EnqueuePipelinePostDto } from '@gitroom/nestjs-libraries/dtos/pipelines/pipeline.dto';

@Injectable()
export class PipelineManager {
  constructor(
    private _pipelineRepository: PipelineRepository,
    private _postsService: PostsService
  ) {}

  async enqueue(
    orgId: string,
    body: EnqueuePipelinePostDto,
    createdBy: 'API' | 'AUTOPOST' = 'API',
    idempotencyKey?: string
  ) {
    const pipeline = await this._pipelineRepository.getPipeline(
      orgId,
      body.pipelineId
    );
    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }
    if (idempotencyKey) {
      const existing =
        await this._pipelineRepository.getQueueItemByIdempotencyKey(
          orgId,
          pipeline.id,
          idempotencyKey
        );
      if (existing) {
        return { id: existing.id, group: existing.group };
      }
    }
    const pipelineChannels = pipeline.integrations
      .filter((item) => isActivePipelineIntegration(item.integration))
      .map((item) => item.integrationId)
      .sort();
    const postChannels = body.post.posts
      .map((item) => item.integration.id)
      .sort();
    if (
      pipelineChannels.length !== postChannels.length ||
      pipelineChannels.some((id, index) => id !== postChannels[index])
    ) {
      throw new BadRequestException(
        'Pipeline content must contain exactly the Pipeline integrations'
      );
    }

    const validations = await this._postsService.validatePosts(
      orgId,
      body.post.posts
    );
    const invalid = validations.find(
      (validation: any) =>
        !validation.valid ||
        validation.errors !== true ||
        validation.emptyContent ||
        validation.tooLong
    );
    if (invalid) {
      throw new BadRequestException(
        `${invalid.name}: ${
          invalid.settingsError || invalid.errors || 'Invalid post'
        }`
      );
    }

    const group = makeId(10);
    const draft = await this._postsService.mapTypeToPost(
      {
        ...body.post,
        type: 'draft',
        date: new Date().toISOString(),
        posts: body.post.posts.map((post) => ({ ...post, group })),
      },
      orgId
    );

    try {
      await this._postsService.createPost(orgId, draft, createdBy, true);
      const queueItem = idempotencyKey
        ? await this._pipelineRepository.publishQueueItem(
            orgId,
            pipeline.id,
            group,
            idempotencyKey
          )
        : await this._pipelineRepository.publishQueueItem(
            orgId,
            pipeline.id,
            group
          );
      if (queueItem === false) {
        throw new BadRequestException(
          'Pipeline content no longer matches its configured integrations'
        );
      }
      if (!queueItem) {
        throw new NotFoundException('Pipeline not found');
      }
      return { id: queueItem.id, group };
    } catch (error) {
      await this._pipelineRepository
        .discardUnlinkedDraftPosts(orgId, group)
        .catch(() => undefined);
      if ((error as { code?: string })?.code === 'P2002' && idempotencyKey) {
        const existing =
          await this._pipelineRepository.getQueueItemByIdempotencyKey(
            orgId,
            pipeline.id,
            idempotencyKey
          );
        if (existing) {
          return { id: existing.id, group: existing.group };
        }
      }
      throw error;
    }
  }

  schedulePosts(orgId: string, postIds: string[], date: string) {
    return Promise.all(
      postIds.map((id) =>
        this._postsService.changeDate(orgId, id, date, 'schedule')
      )
    );
  }

  async startScheduledPosts(
    orgId: string,
    posts: Array<{ id: string; providerIdentifier: string }>
  ) {
    const results = await Promise.allSettled(
      posts.map((post) =>
        this._postsService.startWorkflow(
          post.providerIdentifier.split('-')[0].toLowerCase(),
          post.id,
          orgId,
          'QUEUE',
          true
        )
      )
    );
    const failedPostIds = results.flatMap((result, index) =>
      result.status === 'rejected' ? [posts[index].id] : []
    );
    if (failedPostIds.length) {
      throw new ServiceUnavailableException({
        message:
          'Some scheduled posts could not start their publishing workflow',
        failedPostIds,
      });
    }
  }
}

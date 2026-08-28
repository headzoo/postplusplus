import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Post as PostBody } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import {
  APPROVED_SUBMIT_FOR_ORDER,
  CreationMethod,
  Prisma,
  Post,
  State,
} from '@prisma/client';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { GetPostsListDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.list.dto';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import utc from 'dayjs/plugin/utc';
import { v4 as uuidv4 } from 'uuid';
import { CreateTagDto } from '@gitroom/nestjs-libraries/dtos/posts/create.tag.dto';

dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);
dayjs.extend(utc);

@Injectable()
export class PostsRepository {
  constructor(
    private _post: PrismaRepository<'post'>,
    private _popularPosts: PrismaRepository<'popularPosts'>,
    private _comments: PrismaRepository<'comments'>,
    private _tags: PrismaRepository<'tags'>,
    private _tagsPosts: PrismaRepository<'tagsPosts'>,
    private _errors: PrismaRepository<'errors'>
  ) {}

  searchForMissingThreeHoursPosts() {
    return this._post.model.post.findMany({
      where: {
        integration: {
          refreshNeeded: false,
          inBetweenSteps: false,
          disabled: false,
          deletedAt: null,
        },
        publishDate: {
          gte: dayjs.utc().subtract(2, 'day').toDate(),
          lt: dayjs.utc().toDate(),
        },
        state: 'QUEUE',
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        organizationId: true,
        integration: {
          select: {
            providerIdentifier: true,
          },
        },
        publishDate: true,
      },
    });
  }

  private titleContentSearchFilter(search?: string) {
    const trimmedSearch = search?.trim();
    if (!trimmedSearch) {
      return null;
    }
    return {
      OR: [
        {
          title: {
            contains: trimmedSearch,
            mode: 'insensitive' as const,
          },
        },
        {
          content: {
            contains: trimmedSearch,
            mode: 'insensitive' as const,
          },
        },
      ],
    };
  }

  getOldPosts(orgId: string, date: string) {
    return this._post.model.post.findMany({
      where: {
        integration: {
          refreshNeeded: false,
          inBetweenSteps: false,
          disabled: false,
        },
        organizationId: orgId,
        publishDate: {
          lte: dayjs(date).toDate(),
        },
        deletedAt: null,
        parentPostId: null,
      },
      orderBy: {
        publishDate: 'desc',
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        state: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            picture: true,
            type: true,
          },
        },
      },
    });
  }

  updateImages(id: string, images: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        image: images,
      },
    });
  }

  getPostUrls(orgId: string, ids: string[]) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        id: {
          in: ids,
        },
      },
      select: {
        id: true,
        releaseURL: true,
      },
    });
  }

  async getPosts(orgId: string, query: GetPostsDto) {
    // Use the provided start and end dates directly
    const startDate = dayjs.utc(query.startDate).toDate();
    const endDate = dayjs.utc(query.endDate).toDate();
    const searchFilter = this.titleContentSearchFilter(query.search);

    const list = await this._post.model.post.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                organizationId: orgId,
              },
            ],
          },
          {
            OR: [
              {
                publishDate: {
                  gte: startDate,
                  lte: endDate,
                },
              },
              {
                intervalInDays: {
                  not: null,
                },
                publishDate: {
                  lte: endDate,
                },
              },
            ],
          },
          ...(searchFilter ? [searchFilter] : []),
        ],
        integration: {
          deletedAt: null,
          organizationId: orgId,
          ...(query.customer
            ? {
                customerId: query.customer,
              }
            : {}),
        },
        deletedAt: null,
        parentPostId: null,
        NOT: {
          state: State.DRAFT,
          pipelineQueueItemId: { not: null },
        },
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        releaseId: true,
        likesCount: true,
        likesSyncedAt: true,
        state: true,
        intervalInDays: true,
        group: true,
        creationMethod: true,
        platformDeletedAt: true,
        tags: {
          select: {
            tag: true,
          },
        },
        integration: {
          select: {
            id: true,
            providerIdentifier: true,
            name: true,
            picture: true,
          },
        },
      },
    });

    const startBound = dayjs.utc(startDate);
    const endBound = dayjs.utc(endDate);

    const expanded = list.reduce((all, post) => {
      if (!post.intervalInDays) {
        return [...all, post];
      }

      // Jump to the first occurrence on/after the window start instead of
      // walking every interval from the original publishDate.
      let occurrence = dayjs.utc(post.publishDate);
      if (occurrence.isBefore(startBound)) {
        const steps = Math.ceil(
          startBound.diff(occurrence, 'day') / post.intervalInDays
        );
        occurrence = occurrence.add(steps * post.intervalInDays, 'day');
        while (occurrence.isBefore(startBound)) {
          occurrence = occurrence.add(post.intervalInDays, 'day');
        }
      }

      const addMorePosts = [];
      while (!occurrence.isAfter(endBound)) {
        addMorePosts.push({
          ...post,
          publishDate: occurrence.toDate(),
          actualDate: post.publishDate,
        });
        occurrence = occurrence.add(post.intervalInDays, 'day');
      }

      return [...all, ...addMorePosts];
    }, [] as any[]);

    return expanded;
  }

  async getPostsList(orgId: string, query: GetPostsListDto) {
    const page = query.page || 0;
    const limit = query.limit || 20;
    const skip = page * limit;

    const stateFilter = query.state || 'all';
    const stateAndDate =
      stateFilter === 'scheduled'
        ? {
            state: State.QUEUE,
          }
        : stateFilter === 'draft'
        ? { state: State.DRAFT }
        : stateFilter === 'published'
        ? { state: State.PUBLISHED }
        : {
            state: {
              in: [State.QUEUE, State.DRAFT, State.PUBLISHED, State.ERROR],
            },
          };

    const searchFilter = this.titleContentSearchFilter(query.search);

    const orderDirection: 'asc' | 'desc' =
      stateFilter === 'published' || !!searchFilter ? 'desc' : 'asc';

    const where = {
      AND: [
        {
          OR: [
            {
              organizationId: orgId,
            },
          ],
        },
        ...(searchFilter ? [searchFilter] : []),
      ],
      ...stateAndDate,
      // Published posts were already posted (publishDate in the past), so fetch
      // all of them; everything else stays upcoming. Ordering handles the rest.
      // Search across all states should include past published / drafts too.
      ...(stateFilter === 'published' || searchFilter
        ? {}
        : { publishDate: { gte: dayjs.utc().toDate() } }),
      deletedAt: null as Date | null,
      parentPostId: null as string | null,
      intervalInDays: null as number | null,
      NOT: {
        state: State.DRAFT,
        pipelineQueueItemId: { not: null },
      },

      integration: {
        deletedAt: null as any,
        organizationId: orgId,
        ...(query.customer
          ? {
              customerId: query.customer,
            }
          : {}),
      },
    };

    const [posts, total] = await Promise.all([
      this._post.model.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          publishDate: orderDirection,
        },
        select: {
          id: true,
          content: true,
          publishDate: true,
          releaseURL: true,
          releaseId: true,
          likesCount: true,
          likesSyncedAt: true,
          state: true,
          intervalInDays: true,
          group: true,
          creationMethod: true,
          platformDeletedAt: true,
          tags: {
            select: {
              tag: true,
            },
          },
          integration: {
            select: {
              id: true,
              providerIdentifier: true,
              name: true,
              picture: true,
            },
          },
        },
      }),
      this._post.model.post.count({ where }),
    ]);

    return {
      posts,
      total,
      page,
      limit,
      hasMore: skip + posts.length < total,
    };
  }

  async deletePost(orgId: string, group: string) {
    await this._post.model.post.updateMany({
      where: {
        organizationId: orgId,
        group,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return this._post.model.post.findFirst({
      where: {
        organizationId: orgId,
        group,
        parentPostId: null,
      },
      select: {
        id: true,
      },
    });
  }

  getPipelineQueueItemForGroup(orgId: string, group: string) {
    return this._post.model.post.findFirst({
      where: {
        organizationId: orgId,
        group,
        deletedAt: null,
        pipelineQueueItemId: { not: null },
      },
      select: {
        pipelineQueueItem: {
          select: { id: true, status: true, deletedAt: true },
        },
      },
    });
  }

  getPostsByGroup(orgId: string, group: string) {
    return this._post.model.post.findMany({
      where: {
        group,
        ...(orgId ? { organizationId: orgId } : {}),
        deletedAt: null,
      },
      include: {
        integration: true,
        tags: {
          select: {
            tag: true,
          },
        },
      },
    });
  }

  getPost(
    id: string,
    includeIntegration = false,
    orgId?: string,
    isFirst?: boolean
  ) {
    return this._post.model.post.findUnique({
      where: {
        id,
        ...(orgId ? { organizationId: orgId } : {}),
        deletedAt: null,
      },
      include: {
        ...(includeIntegration
          ? {
              integration: true,
              tags: {
                select: {
                  tag: true,
                },
              },
            }
          : {}),
        childrenPost: true,
      },
    });
  }

  async updatePost(id: string, postId: string, releaseURL: string) {
    const updated = await this._post.model.post.update({
      where: {
        id,
      },
      data: {
        state: 'PUBLISHED',
        releaseURL,
        releaseId: postId,
      },
    });
    await this._post.model.post.updateMany({
      where: {
        organizationId: updated.organizationId,
        integrationId: updated.integrationId,
        releaseId: String(postId),
        creationMethod: CreationMethod.PLATFORM,
        id: { not: id },
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
    return updated;
  }

  async importPlatformPost(input: {
    organizationId: string;
    integrationId: string;
    providerIdentifier: string;
    externalId: string;
    url: string;
    content: string;
    publishedAt: Date;
  }) {
    const existing = await this._post.model.post.findFirst({
      where: {
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        releaseId: input.externalId,
      },
      select: { id: true },
    });
    if (existing) {
      return { created: false };
    }
    await this._post.model.post.create({
      data: {
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        content: input.content,
        publishDate: input.publishedAt,
        state: State.PUBLISHED,
        creationMethod: CreationMethod.PLATFORM,
        releaseId: input.externalId,
        releaseURL: input.url,
        group: uuidv4(),
        settings: JSON.stringify({ __type: input.providerIdentifier }),
        image: JSON.stringify([]),
      },
    });
    return { created: true };
  }

  async markPlatformDeleted(
    organizationId: string,
    integrationId: string,
    externalId: string,
    deletedAt: Date
  ) {
    const result = await this._post.model.post.updateMany({
      where: {
        organizationId,
        integrationId,
        releaseId: externalId,
        deletedAt: null,
        platformDeletedAt: null,
      },
      data: {
        platformDeletedAt: deletedAt,
      },
    });
    return { updated: result.count > 0 };
  }

  updateReleaseId(id: string, orgId: string, releaseId: string) {
    return this._post.model.post.update({
      where: {
        id,
        organizationId: orgId,
        releaseId: 'missing',
      },
      data: {
        releaseId: String(releaseId),
      },
    });
  }

  updateLikesCount(
    integrationId: string,
    releaseId: string,
    likesCount: number,
    syncedAt: Date = new Date()
  ) {
    return this._post.model.post.updateMany({
      where: {
        integrationId,
        releaseId,
        deletedAt: null,
        state: 'PUBLISHED',
      },
      data: {
        likesCount,
        likesSyncedAt: syncedAt,
      },
    });
  }

  updateLikesCountByPostId(
    postId: string,
    orgId: string,
    likesCount: number,
    syncedAt: Date = new Date()
  ) {
    return this._post.model.post.updateMany({
      where: {
        id: postId,
        organizationId: orgId,
        deletedAt: null,
        state: 'PUBLISHED',
      },
      data: {
        likesCount,
        likesSyncedAt: syncedAt,
      },
    });
  }

  async changeState(id: string, state: State, err?: any, body?: any) {
    const update = await this._post.model.post.update({
      where: {
        id,
      },
      data: {
        state,
        ...(err
          ? { error: typeof err === 'string' ? err : JSON.stringify(err) }
          : {}),
      },
      include: {
        integration: {
          select: {
            providerIdentifier: true,
          },
        },
      },
    });

    if (state === 'ERROR' && err && body) {
      try {
        await this._errors.model.errors.create({
          data: {
            message: typeof err === 'string' ? err : JSON.stringify(err),
            organizationId: update.organizationId,
            platform: update.integration.providerIdentifier,
            postId: update.id,
            body: typeof body === 'string' ? body : JSON.stringify(body),
          },
        });
      } catch (err) {}
    }

    return update;
  }

  getErrorsByPostIds(postIds: string[]) {
    return this._errors.model.errors.findMany({
      where: {
        postId: { in: postIds },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async changeDate(
    orgId: string,
    id: string,
    date: string,
    isDraft: boolean,
    action: 'schedule' | 'update' = 'schedule'
  ) {
    return this._post.model.post.update({
      where: {
        organizationId: orgId,
        id,
      },
      data: {
        publishDate: dayjs(date).toDate(),
        // schedule: set state to QUEUE (or DRAFT if it was a draft)
        // update: don't change the state
        ...(action === 'schedule'
          ? {
              state: isDraft ? 'DRAFT' : 'QUEUE',
              releaseId: null,
              releaseURL: null,
            }
          : {}),
      },
    });
  }

  countPostsFromDay(orgId: string, date: Date) {
    return this._post.model.post.count({
      where: {
        organizationId: orgId,
        publishDate: {
          gte: date,
        },
        OR: [
          {
            deletedAt: null,
            state: {
              in: ['QUEUE'],
            },
          },
          {
            state: 'PUBLISHED',
          },
        ],
      },
    });
  }

  async createOrUpdatePost(
    state: 'draft' | 'schedule' | 'now' | 'update',
    orgId: string,
    date: string,
    body: PostBody,
    tags: { value: string; label: string }[],
    creationMethod: CreationMethod,
    inter?: number,
    // Keep the existing group instead of rotating it, so open clients
    // (calendar) holding the group stay valid. Used by out-of-band updates
    // (agent / MCP / public API); the dashboard keeps the rotate-and-sweep.
    keepGroup = false,
    pipelineQueueItemId?: string
  ) {
    const posts: Post[] = [];
    const uuid = uuidv4();
    const group = keepGroup && body.group ? body.group : uuid;

    for (const value of body.value) {
      const updateData = (type: 'create' | 'update') => ({
        publishDate: dayjs(date).toDate(),
        integration: {
          connect: {
            id: body.integration.id,
            organizationId: orgId,
          },
        },
        ...(posts?.[posts.length - 1]?.id
          ? {
              parentPost: {
                connect: {
                  id: posts[posts.length - 1]?.id,
                },
              },
            }
          : type === 'update'
          ? {
              parentPost: {
                disconnect: true,
              },
            }
          : {}),
        content: value.content,
        delay: value.delay || 0,
        group,
        intervalInDays: inter ? +inter : null,
        approvedSubmitForOrder: APPROVED_SUBMIT_FOR_ORDER.NO,
        ...(type === 'create' ? { creationMethod } : {}),
        ...(state === 'update'
          ? {}
          : {
              state:
                state === 'draft' ? ('DRAFT' as const) : ('QUEUE' as const),
            }),
        image: JSON.stringify(value.image),
        settings: JSON.stringify(body.settings),
        ...(posts.length === 0 &&
        (type === 'create' || value.reference !== undefined)
          ? {
              reference: value.reference
                ? (value.reference as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            }
          : {}),
        organization: {
          connect: {
            id: orgId,
          },
        },
        ...(pipelineQueueItemId
          ? {
              pipelineQueueItem: {
                connect: { id: pipelineQueueItemId },
              },
            }
          : {}),
      });

      posts.push(
        await this._post.model.post.upsert({
          where: {
            id: value.id || uuidv4(),
          },
          create: { ...updateData('create') },
          update: {
            ...updateData('update'),
            lastMessage: {
              disconnect: true,
            },
            submittedForOrder: {
              disconnect: true,
            },
          },
        })
      );

      if (posts.length === 1) {
        await this._tagsPosts.model.tagsPosts.deleteMany({
          where: {
            post: {
              id: posts[0].id,
            },
          },
        });

        if (tags.length) {
          const tagsList = await this._tags.model.tags.findMany({
            where: {
              orgId: orgId,
              name: {
                in: tags.map((tag) => tag.label).filter((f) => f),
              },
            },
          });

          if (tagsList.length) {
            await this._post.model.post.update({
              where: {
                id: posts[posts.length - 1].id,
              },
              data: {
                tags: {
                  createMany: {
                    data: tagsList.map((tag) => ({
                      tagId: tag.id,
                    })),
                  },
                },
              },
            });
          }
        }
      }
    }

    const previousPost = body.group
      ? (
          await this._post.model.post.findFirst({
            where: {
              group: body.group,
              deletedAt: null,
              parentPostId: null,
            },
            select: {
              id: true,
            },
          })
        )?.id!
      : undefined;

    if (body.group && !keepGroup) {
      await this._post.model.post.updateMany({
        where: {
          group: body.group,
          deletedAt: null,
        },
        data: {
          parentPostId: null,
          deletedAt: new Date(),
        },
      });
    }

    // keepGroup: the updated rows still carry the old group, so sweep only the
    // rows dropped from it (removed comments) by id instead of by group. Scope
    // to this integration so sibling channels sharing the group (e.g. a Pipeline
    // enqueue that creates one draft per channel before the queue item exists)
    // are never swept away.
    if (body.group && keepGroup) {
      await this._post.model.post.updateMany({
        where: {
          group: body.group,
          deletedAt: null,
          integrationId: body.integration.id,
          ...(pipelineQueueItemId ? { pipelineQueueItemId } : {}),
          id: {
            notIn: posts.map((p) => p.id),
          },
        },
        data: {
          parentPostId: null,
          deletedAt: new Date(),
        },
      });
    }

    return { previousPost, posts };
  }

  async submit(id: string, order: string, buyerOrganizationId: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        submittedForOrderId: order,
        approvedSubmitForOrder: 'WAITING_CONFIRMATION',
        submittedForOrganizationId: buyerOrganizationId,
      },
      select: {
        id: true,
        description: true,
        submittedForOrder: {
          select: {
            messageGroupId: true,
          },
        },
      },
    });
  }

  updateMessage(id: string, messageId: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        lastMessageId: messageId,
      },
    });
  }

  getPostById(id: string, org?: string) {
    return this._post.model.post.findUnique({
      where: {
        id,
        ...(org ? { organizationId: org } : {}),
      },
      include: {
        integration: true,
        submittedForOrder: {
          include: {
            posts: {
              where: {
                state: 'PUBLISHED',
              },
            },
            ordersItems: true,
            seller: {
              select: {
                id: true,
                account: true,
              },
            },
          },
        },
      },
    });
  }

  findAllExistingCategories() {
    return this._popularPosts.model.popularPosts.findMany({
      select: {
        category: true,
      },
      distinct: ['category'],
    });
  }

  findAllExistingTopicsOfCategory(category: string) {
    return this._popularPosts.model.popularPosts.findMany({
      where: {
        category,
      },
      select: {
        topic: true,
      },
      distinct: ['topic'],
    });
  }

  findPopularPosts(category: string, topic?: string) {
    return this._popularPosts.model.popularPosts.findMany({
      where: {
        category,
        ...(topic ? { topic } : {}),
      },
      select: {
        content: true,
        hook: true,
      },
    });
  }

  createPopularPosts(post: {
    category: string;
    topic: string;
    content: string;
    hook: string;
  }) {
    return this._popularPosts.model.popularPosts.create({
      data: {
        category: 'category',
        topic: 'topic',
        content: 'content',
        hook: 'hook',
      },
    });
  }

  async getPostsCountsByDates(
    orgId: string,
    times: number[],
    date: dayjs.Dayjs
  ) {
    const dates = await this._post.model.post.findMany({
      where: {
        deletedAt: null,
        organizationId: orgId,
        publishDate: {
          in: times.map((time) => {
            return date.clone().add(time, 'minutes').toDate();
          }),
        },
      },
    });

    return times.filter(
      (time) =>
        date.clone().add(time, 'minutes').isAfter(dayjs.utc()) &&
        !dates.find((dateFind) => {
          return (
            dayjs
              .utc(dateFind.publishDate)
              .diff(date.clone().startOf('day'), 'minutes') == time
          );
        })
    );
  }

  async getComments(postId: string) {
    return this._comments.model.comments.findMany({
      where: {
        postId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async getTags(orgId: string) {
    return this._tags.model.tags.findMany({
      where: {
        orgId,
        deletedAt: null,
      },
    });
  }

  createTag(orgId: string, body: CreateTagDto) {
    return this._tags.model.tags.create({
      data: {
        orgId,
        name: body.name,
        color: body.color,
      },
    });
  }

  editTag(id: string, orgId: string, body: CreateTagDto) {
    return this._tags.model.tags.update({
      where: {
        id,
      },
      data: {
        name: body.name,
        color: body.color,
      },
    });
  }

  deleteTag(id: string, orgId: string) {
    return this._tags.model.tags.update({
      where: {
        id,
        orgId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  createComment(
    orgId: string,
    userId: string,
    postId: string,
    content: string
  ) {
    return this._comments.model.comments.create({
      data: {
        organizationId: orgId,
        userId,
        postId,
        content,
      },
    });
  }

  async getPostByForWebhookId(postId: string) {
    return this._post.model.post.findMany({
      where: {
        id: postId,
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        state: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            picture: true,
            type: true,
          },
        },
      },
    });
  }

  async getPostsSince(orgId: string, since: string) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        publishDate: {
          gte: new Date(since),
        },
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        state: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            picture: true,
            type: true,
          },
        },
      },
    });
  }
}

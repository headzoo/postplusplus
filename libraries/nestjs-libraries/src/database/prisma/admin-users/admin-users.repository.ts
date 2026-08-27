import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

interface ListUserOrganizationsParams {
  page?: number;
  limit?: number;
  search?: string;
}

@Injectable()
export class AdminUsersRepository {
  constructor(private _userOrg: PrismaRepository<'userOrganization'>) {}

  private buildWhere(search?: string): Prisma.UserOrganizationWhereInput {
    const term = search?.trim();
    if (!term) {
      return {};
    }

    return {
      OR: [
        {
          organizationId: {
            contains: term,
          },
        },
        {
          organization: {
            name: {
              contains: term,
              mode: 'insensitive',
            },
          },
        },
        {
          user: {
            OR: [
              {
                name: {
                  contains: term,
                  mode: 'insensitive',
                },
              },
              {
                email: {
                  contains: term,
                  mode: 'insensitive',
                },
              },
              {
                id: {
                  contains: term,
                },
              },
            ],
          },
        },
      ],
    };
  }

  async listUserOrganizations(params: ListUserOrganizationsParams) {
    const page = Math.max(0, params.page || 0);
    const limit = Math.min(Math.max(1, params.limit || 20), 100);
    const skip = page * limit;
    const where = this.buildWhere(params.search);

    const [items, total] = await Promise.all([
      this._userOrg.model.userOrganization.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          user: {
            createdAt: 'desc',
          },
        },
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              activated: true,
              isSuperAdmin: true,
              createdAt: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
              subscription: {
                select: {
                  subscriptionTier: true,
                },
              },
            },
          },
        },
      }),
      this._userOrg.model.userOrganization.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      hasMore: skip + items.length < total,
    };
  }
}

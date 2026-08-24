import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Provider, Role } from '@prisma/client';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { UserDetailDto } from '@gitroom/nestjs-libraries/dtos/users/user.details.dto';
import { EmailNotificationsDto } from '@gitroom/nestjs-libraries/dtos/users/email-notifications.dto';
import { DashboardAnalyticsPreferenceItemDto } from '@gitroom/nestjs-libraries/dtos/users/dashboard-analytics-preferences.dto';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

@Injectable()
export class UsersRepository {
  constructor(
    private _user: PrismaRepository<'user'>,
    private _dashboardAnalyticsPreference: PrismaRepository<'dashboardAnalyticsPreference'>,
    private _userDismissedAlert: PrismaRepository<'userDismissedAlert'>,
    private _integration: PrismaRepository<'integration'>,
    private _transaction: PrismaTransaction
  ) { }

  async switchUserCredentials(currentUserId: string, targetUserId: string) {
    const current = await this._user.model.user.findUnique({
      where: { id: currentUserId },
    });
    const target = await this._user.model.user.findUnique({
      where: { id: targetUserId },
    });

    if (!current || !target) {
      throw new Error('User not found');
    }

    const currentCredentials = {
      email: current.email,
      password: current.password,
      providerName: current.providerName,
      providerId: current.providerId,
      account: current.account,
      connectedAccount: current.connectedAccount,
      activated: current.activated,
    };
    const targetCredentials = {
      email: target.email,
      password: target.password,
      providerName: target.providerName,
      providerId: target.providerId,
      account: target.account,
      connectedAccount: target.connectedAccount,
      activated: target.activated,
    };

    // (email, providerName) is unique and checked per-statement, so park the
    // current user on a throwaway email first, then fill each freed slot
    await this._transaction.model.$transaction([
      this._user.model.user.update({
        where: { id: current.id },
        data: { email: `switch-${makeId(10)}-${current.email}` },
      }),
      this._user.model.user.update({
        where: { id: target.id },
        data: currentCredentials,
      }),
      this._user.model.user.update({
        where: { id: current.id },
        data: targetCredentials,
      }),
    ]);

    return {
      kept: { id: current.id, email: targetCredentials.email },
      switched: { id: target.id, email: currentCredentials.email },
    };
  }

  getImpersonateUser(name: string) {
    return this._user.model.user.findMany({
      where: {
        OR: [
          {
            name: {
              contains: name,
            },
          },
          {
            email: {
              contains: name,
            },
          },
          {
            id: {
              contains: name,
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      take: 10,
    });
  }

  getUserById(id: string) {
    return this._user.model.user.findFirst({
      where: {
        id,
      },
    });
  }

  listUsers() {
    return this._user.model.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        isSuperAdmin: true,
        activated: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  setSuperAdmin(userId: string, isSuperAdmin: boolean) {
    return this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        isSuperAdmin,
      },
      select: {
        id: true,
        email: true,
        isSuperAdmin: true,
      },
    });
  }

  getUserByEmail(email: string) {
    return this._user.model.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
        providerName: Provider.LOCAL,
      },
      include: {
        picture: {
          select: {
            id: true,
            path: true,
          },
        },
      },
    });
  }

  getUserWithActiveSubscriptionByEmail(email: string, excludeUserId: string) {
    return this._user.model.user.findFirst({
      where: {
        email,
        id: { not: excludeUserId },
        organizations: {
          some: {
            role: Role.SUPERADMIN,
            organization: {
              subscription: { is: { deletedAt: null } },
            },
          },
        },
      },
      select: { id: true, email: true, providerName: true },
    });
  }

  activateUser(id: string) {
    return this._user.model.user.update({
      where: {
        id,
      },
      data: {
        activated: true,
      },
    });
  }

  getUserByProvider(providerId: string, provider: Provider) {
    return this._user.model.user.findFirst({
      where: {
        providerId,
        providerName: provider,
      },
    });
  }

  updatePassword(id: string, password: string) {
    return this._user.model.user.update({
      where: {
        id,
        providerName: Provider.LOCAL,
      },
      data: {
        password: AuthService.hashPassword(password),
      },
    });
  }

  changeAudienceSize(userId: string, audience: number) {
    return this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        audience,
      },
    });
  }

  async getPersonal(userId: string) {
    const user = await this._user.model.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        bio: true,
        picture: {
          select: {
            id: true,
            path: true,
          },
        },
      },
    });

    return user;
  }

  async changePersonal(userId: string, body: UserDetailDto) {
    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        name: body.fullname,
        bio: body.bio,
        picture: body.picture
          ? {
            connect: {
              id: body.picture.id,
            },
          }
          : {
            disconnect: true,
          },
      },
    });
  }

  async getEmailNotifications(userId: string) {
    return this._user.model.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        sendSuccessEmails: true,
        sendFailureEmails: true,
        sendStreakEmails: true,
      },
    });
  }

  async updateEmailNotifications(userId: string, body: EmailNotificationsDto) {
    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        sendSuccessEmails: body.sendSuccessEmails,
        sendFailureEmails: body.sendFailureEmails,
        sendStreakEmails: body.sendStreakEmails,
      },
    });
  }

  getDashboardAnalyticsPreferences(
    userId: string,
    organizationId: string,
    integrationId?: string
  ) {
    return this._dashboardAnalyticsPreference.model.dashboardAnalyticsPreference.findMany(
      {
        where: {
          userId,
          organizationId,
          ...(integrationId ? { integrationId } : {}),
        },
        select: {
          integrationId: true,
          metricKey: true,
          position: true,
          hidden: true,
        },
        orderBy: [{ integrationId: 'asc' }, { position: 'asc' }],
      }
    );
  }

  async saveDashboardAnalyticsPreferences(
    userId: string,
    organizationId: string,
    preferences: DashboardAnalyticsPreferenceItemDto[]
  ) {
    const integrationIds = [
      ...new Set(preferences.map((preference) => preference.integrationId)),
    ];
    if (!integrationIds.length) {
      return [];
    }

    const ownedIntegrations = await this._integration.model.integration.findMany(
      {
        where: {
          organizationId,
          deletedAt: null,
          id: { in: integrationIds },
        },
        select: { id: true },
      }
    );
    if (ownedIntegrations.length !== integrationIds.length) {
      throw new BadRequestException('Invalid integration');
    }

    const seen = new Set<string>();
    for (const preference of preferences) {
      const key = `${preference.integrationId}:${preference.metricKey}`;
      if (seen.has(key)) {
        throw new BadRequestException('Duplicate metric preference');
      }
      seen.add(key);
    }

    await this._transaction.model.$transaction(async (tx) => {
      await tx.dashboardAnalyticsPreference.deleteMany({
        where: {
          userId,
          organizationId,
          integrationId: { in: integrationIds },
        },
      });

      if (!preferences.length) {
        return;
      }

      await tx.dashboardAnalyticsPreference.createMany({
        data: preferences.map((preference) => ({
          userId,
          organizationId,
          integrationId: preference.integrationId,
          metricKey: preference.metricKey,
          position: preference.position,
          hidden: preference.hidden,
        })),
      });
    });

    return this.getDashboardAnalyticsPreferences(
      userId,
      organizationId,
      integrationIds.length === 1 ? integrationIds[0] : undefined
    );
  }

  async getDismissedAlerts(userId: string) {
    const rows = await this._userDismissedAlert.model.userDismissedAlert.findMany(
      {
        where: { userId },
        select: { alertKey: true },
        orderBy: { alertKey: 'asc' },
      }
    );
    return { keys: rows.map((row) => row.alertKey) };
  }

  async dismissAlert(userId: string, alertKey: string) {
    await this._userDismissedAlert.model.userDismissedAlert.upsert({
      where: {
        userId_alertKey: { userId, alertKey },
      },
      create: {
        userId,
        alertKey,
      },
      update: {
        dismissedAt: new Date(),
      },
    });
    return this.getDismissedAlerts(userId);
  }
}

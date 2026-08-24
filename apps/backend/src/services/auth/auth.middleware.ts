import { HttpException, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { User } from '@prisma/client';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';
import { setSentryUserContext } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
import { ORIGINAL_OPERATOR_REQUEST_KEY } from '@gitroom/nestjs-libraries/user/original.operator.from.request';
import { clearAdminAuthCookie } from '@gitroom/backend/services/auth/admin-auth.cookie';
import { clearPasskeyAuthCookie, readPasskeyAuthToken } from '@gitroom/backend/services/auth/passkey-auth.cookie';
import { AdminPasskeyService } from '@gitroom/nestjs-libraries/database/prisma/admin-passkeys/admin-passkey.service';

export const removeAuth = (res: Response) => {
  res.cookie('auth', '', {
    domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
    ...(!process.env.NOT_SECURED
      ? {
          secure: true,
          httpOnly: true,
          sameSite: 'none',
        }
      : {}),
    expires: new Date(0),
    maxAge: -1,
  });
  clearAdminAuthCookie(res);
  clearPasskeyAuthCookie(res);
  res.header('logout', 'true');
};

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private _organizationService: OrganizationService,
    private _userService: UsersService,
    private _adminPasskeyService: AdminPasskeyService
  ) {}
  async use(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.auth || req.cookies.auth;
    if (!auth) {
      throw new HttpForbiddenException();
    }
    try {
      // Verify the JWT signature only. Never trust authorization-relevant
      // claims (id, isSuperAdmin, activated) from the token body — always
      // re-resolve the user from the database using the id.
      const payload = AuthService.verifyJWT(auth) as User | null;
      const orgHeader = req.cookies.showorg || req.headers.showorg;

      if (!payload?.id) {
        throw new HttpForbiddenException();
      }

      let user = (await this._userService.getUserById(payload.id)) as User | null;

      if (!user) {
        throw new HttpForbiddenException();
      }

      if (!user.activated) {
        throw new HttpForbiddenException();
      }

      delete user.password;

      // Preserve the normal-login principal before impersonation can replace
      // `req.user`, so admin step-up always belongs to the original operator.
      req[ORIGINAL_OPERATOR_REQUEST_KEY] = user;

      const impersonate = req.cookies.impersonate || req.headers.impersonate;
      if (user?.isSuperAdmin && impersonate) {
        const loadImpersonate = await this._organizationService.getUserOrg(
          impersonate
        );

        if (loadImpersonate) {
          user = loadImpersonate.user;
          user.isSuperAdmin = true;
          delete user.password;

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          req.user = user;

          // @ts-ignore
          loadImpersonate.organization.users =
            loadImpersonate.organization.users.filter(
              (f) => f.userId === user.id
            );
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          req.org = loadImpersonate.organization;

          setSentryUserContext({
            userId: user.id,
            email: user.email,
            orgId: loadImpersonate.organization.id,
            paymentId: loadImpersonate.organization.paymentId,
          });

      // Account passkey gate: enrolled users must present passkey_auth.
      // Uses the original operator so impersonation cannot bypass MFA.
      const originalOperator = req[ORIGINAL_OPERATOR_REQUEST_KEY] as User;
      if (
        originalOperator?.id &&
        !this.isAccountPasskeyAllowlisted(req) &&
        (await this._adminPasskeyService.hasEnrolledPasskey(originalOperator.id)) &&
        !(await this._adminPasskeyService.hasValidAccountSession(
          originalOperator.id,
          readPasskeyAuthToken(req)
        ))
      ) {
        throw new HttpException(
          {
            statusCode: 428,
            code: 'ACCOUNT_PASSKEY_REQUIRED',
            message: 'Account passkey verification is required',
          },
          428
        );
      }

          next();
          return;
        }
      }

      delete user.password;
      const organization = (
        await this._organizationService.getOrgsByUserId(user.id)
      ).filter((f) => !f.users[0].disabled);
      const setOrg =
        organization.find((org) => org.id === orgHeader) || organization[0];

      if (!organization) {
        throw new HttpForbiddenException();
      }

      if (!setOrg.apiKey) {
        await this._organizationService.updateApiKey(setOrg.id);
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      req.user = user;

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      req.org = setOrg;

      setSentryUserContext({
        userId: user.id,
        email: user.email,
        orgId: setOrg.id,
        paymentId: setOrg.paymentId,
      });

      // Account passkey gate: enrolled users must present passkey_auth.
      // Uses the original operator so impersonation cannot bypass MFA.
      const originalOperator = req[ORIGINAL_OPERATOR_REQUEST_KEY] as User;
      if (
        originalOperator?.id &&
        !this.isAccountPasskeyAllowlisted(req) &&
        (await this._adminPasskeyService.hasEnrolledPasskey(originalOperator.id)) &&
        !(await this._adminPasskeyService.hasValidAccountSession(
          originalOperator.id,
          readPasskeyAuthToken(req)
        ))
      ) {
        throw new HttpException(
          {
            statusCode: 428,
            code: 'ACCOUNT_PASSKEY_REQUIRED',
            message: 'Account passkey verification is required',
          },
          428
        );
      }

    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpForbiddenException();
    }
    next();
  }

  private isAccountPasskeyAllowlisted(req: Request) {
    const path = (req.originalUrl || req.url || '').split('?')[0];
    return (
      path === '/user/self' ||
      path === '/user/logout' ||
      path.startsWith('/user/passkey/') ||
      path.startsWith('/admin-auth/')
    );
  }
}

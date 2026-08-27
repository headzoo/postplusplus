import { Request, Response } from 'express';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';

export const ADMIN_AUTH_COOKIE = 'admin_auth';
export const ADMIN_AUTH_HEADER = 'admin-auth';

const cookieOptions = () => ({
  domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
  path: '/',
  ...(!process.env.NOT_SECURED
    ? {
        secure: true,
        httpOnly: true,
        sameSite: 'none' as const,
      }
    : {}),
});

export const setAdminAuthCookie = (
  response: Response,
  token: string,
  expiresAt: Date
) => {
  response.cookie(ADMIN_AUTH_COOKIE, token, {
    ...cookieOptions(),
    expires: expiresAt,
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });

  if (process.env.NOT_SECURED) {
    response.header(ADMIN_AUTH_HEADER, token);
  }
};

export const clearAdminAuthCookie = (response: Response) => {
  response.cookie(ADMIN_AUTH_COOKIE, '', {
    ...cookieOptions(),
    expires: new Date(0),
    maxAge: -1,
  });
};

/**
 * The mirrored `admin-auth` header exists only for local `NOT_SECURED`
 * development, where cross-origin cookies are not available.
 */
export const readAdminAuthToken = (request: Request) => {
  const cookieToken = request.cookies?.[ADMIN_AUTH_COOKIE];
  if (cookieToken) {
    return cookieToken as string;
  }

  if (!process.env.NOT_SECURED) {
    return undefined;
  }

  const headerToken = request.headers?.[ADMIN_AUTH_HEADER];
  return typeof headerToken === 'string' && headerToken
    ? headerToken
    : undefined;
};

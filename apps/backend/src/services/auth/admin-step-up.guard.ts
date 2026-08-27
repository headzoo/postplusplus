import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  AdminOperator,
  AdminPasskeyService,
  AdminVerificationCheck,
  AdminVerificationPolicy,
} from '@gitroom/nestjs-libraries/database/prisma/admin-passkeys/admin-passkey.service';
import { ORIGINAL_OPERATOR_REQUEST_KEY } from '@gitroom/nestjs-libraries/user/original.operator.from.request';
import { ADMIN_STEP_UP_KEY } from '@gitroom/backend/services/auth/admin-step-up.decorator';
import { readAdminAuthToken } from '@gitroom/backend/services/auth/admin-auth.cookie';
import { readPasskeyAuthToken } from '@gitroom/backend/services/auth/passkey-auth.cookie';

export const ADMIN_STEP_UP_REQUIRED = 'ADMIN_STEP_UP_REQUIRED';
export const ADMIN_STEP_UP_FRESH_REQUIRED = 'ADMIN_STEP_UP_FRESH_REQUIRED';

@Injectable()
export class AdminStepUpGuard implements CanActivate {
  constructor(
    private _reflector: Reflector,
    private _adminPasskeyService: AdminPasskeyService
  ) {}

  async canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') {
      return true;
    }

    const policy = this._reflector.getAllAndOverride<AdminVerificationPolicy>(
      ADMIN_STEP_UP_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!policy) {
      return true;
    }

    const request: Request = context.switchToHttp().getRequest();

    // Never `request.user`: an impersonated principal carries a synthetic
    // `isSuperAdmin` and must not be able to stand in for the operator.
    const operator = request[ORIGINAL_OPERATOR_REQUEST_KEY] as
      | AdminOperator
      | undefined;

    // Throws a plain 403 for a missing/non-super-admin operator, which leaves
    // the normal login intact instead of triggering the logout filter.
    const check = await this._adminPasskeyService.validateVerification(
      operator,
      readAdminAuthToken(request),
      policy,
      readPasskeyAuthToken(request)
    );

    if (check.valid) {
      return true;
    }

    // `strictNullChecks` is off repository-wide, so the discriminated union
    // does not narrow on `valid` by itself.
    const { reason } = check as Extract<
      AdminVerificationCheck,
      { valid: false }
    >;

    throw new HttpException(
      {
        statusCode: 428,
        code:
          reason === 'stale'
            ? ADMIN_STEP_UP_FRESH_REQUIRED
            : ADMIN_STEP_UP_REQUIRED,
        policy,
        reason,
        message: 'Admin passkey verification is required',
      },
      428
    );
  }
}

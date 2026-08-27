import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { GetOriginalOperatorFromRequest } from '@gitroom/nestjs-libraries/user/original.operator.from.request';
import {
  AdminOperator,
  AdminPasskeyService,
  AdminVerificationIssue,
} from '@gitroom/nestjs-libraries/database/prisma/admin-passkeys/admin-passkey.service';
import {
  AdminPasskeyAssertionDto,
  AdminPasskeyRegistrationDto,
} from '@gitroom/nestjs-libraries/dtos/admin/admin-passkey.dto';
import {
  readAdminAuthToken,
  setAdminAuthCookie,
} from '@gitroom/backend/services/auth/admin-auth.cookie';
import {
  readPasskeyAuthToken,
  setPasskeyAuthCookie,
} from '@gitroom/backend/services/auth/passkey-auth.cookie';

@ApiTags('Admin Auth')
@Controller('/admin-auth')
export class AdminAuthController {
  constructor(private _adminPasskeyService: AdminPasskeyService) {}

  @Get('/status')
  status(
    @GetOriginalOperatorFromRequest() operator: AdminOperator,
    @Req() request: Request
  ) {
    this._adminPasskeyService.assertOperator(operator);
    return this._adminPasskeyService.getStatus(
      operator,
      readAdminAuthToken(request),
      readPasskeyAuthToken(request)
    );
  }

  @Post('/register-options')
  registerOptions(@GetOriginalOperatorFromRequest() operator: AdminOperator) {
    this._adminPasskeyService.assertOperator(operator);
    return this._adminPasskeyService.createRegistrationOptions(operator);
  }

  @Post('/register-verify')
  async registerVerify(
    @GetOriginalOperatorFromRequest() operator: AdminOperator,
    @Body() body: AdminPasskeyRegistrationDto,
    @Res({ passthrough: true }) response: Response
  ) {
    this._adminPasskeyService.assertOperator(operator);
    const account = await this._adminPasskeyService.verifyRegistration(
      operator,
      body as unknown as RegistrationResponseJSON,
      'account'
    );
    const admin =
      await this._adminPasskeyService.issueCompanionAdminSessionForUser(
        operator.id
      );

    return this.issueSessions(response, account, admin);
  }

  @Post('/challenge')
  challenge(@GetOriginalOperatorFromRequest() operator: AdminOperator) {
    this._adminPasskeyService.assertOperator(operator);
    return this._adminPasskeyService.createAssertionOptions(operator);
  }

  @Post('/verify')
  async verify(
    @GetOriginalOperatorFromRequest() operator: AdminOperator,
    @Body() body: AdminPasskeyAssertionDto,
    @Res({ passthrough: true }) response: Response
  ) {
    this._adminPasskeyService.assertOperator(operator);
    const account = await this._adminPasskeyService.verifyAssertion(
      operator,
      body as unknown as AuthenticationResponseJSON,
      'account'
    );
    const admin =
      await this._adminPasskeyService.issueCompanionAdminSessionForUser(
        operator.id
      );

    return this.issueSessions(response, account, admin);
  }

  private issueSessions(
    response: Response,
    account: AdminVerificationIssue,
    admin: AdminVerificationIssue
  ) {
    setPasskeyAuthCookie(response, account.token, account.expiresAt);
    setAdminAuthCookie(response, admin.token, admin.expiresAt);

    return {
      enrolled: true,
      verified: true,
      fresh: true,
      expiresAt: admin.expiresAt.toISOString(),
      freshUntil: admin.freshUntil.toISOString(),
    };
  }
}

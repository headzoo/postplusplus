import { Injectable } from '@nestjs/common';
import { AdminUsersRepository } from '@gitroom/nestjs-libraries/database/prisma/admin-users/admin-users.repository';

@Injectable()
export class AdminUsersService {
  constructor(private _adminUsersRepository: AdminUsersRepository) {}

  listUserOrganizations(params: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    return this._adminUsersRepository.listUserOrganizations(params);
  }
}

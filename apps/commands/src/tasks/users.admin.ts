import { Command, Option, Positional } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';

@Injectable()
export class UsersAdminTask {
  constructor(private _usersService: UsersService) {}

  @Command({
    command: 'users:list',
    describe: 'List all registered users with their IDs.',
  })
  async listUsers() {
    const users = await this._usersService.listUsers();

    if (!users.length) {
      console.log('No users found.');
      return true;
    }

    const rows = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name || '-',
      isSuperAdmin: String(user.isSuperAdmin),
      activated: String(user.activated),
      createdAt: user.createdAt.toISOString(),
    }));

    const headers = {
      id: 'id',
      email: 'email',
      name: 'name',
      isSuperAdmin: 'isSuperAdmin',
      activated: 'activated',
      createdAt: 'createdAt',
    };

    const columns = Object.keys(headers) as Array<keyof typeof headers>;
    const widths = Object.fromEntries(
      columns.map((column) => [
        column,
        Math.max(
          headers[column].length,
          ...rows.map((row) => row[column].length)
        ),
      ])
    ) as Record<keyof typeof headers, number>;

    const formatRow = (row: Record<keyof typeof headers, string>) =>
      columns.map((column) => row[column].padEnd(widths[column])).join('  ');

    console.log(formatRow(headers));
    console.log(columns.map((column) => '-'.repeat(widths[column])).join('  '));
    for (const row of rows) {
      console.log(formatRow(row));
    }

    return true;
  }

  @Command({
    command: 'users:set-super-admin <userId>',
    describe: 'Grant or revoke platform super admin by user ID.',
  })
  async setSuperAdmin(
    @Positional({
      name: 'userId',
      describe: 'the user ID',
      type: 'string',
    })
    userId: string,
    @Option({
      name: 'unset',
      describe: 'revoke super admin instead of granting it',
      type: 'boolean',
      default: false,
    })
    unset: boolean
  ) {
    const user = await this._usersService.setSuperAdmin(userId, !unset);

    console.log(
      `Updated ${user.email} (${user.id}): isSuperAdmin=${user.isSuperAdmin}`
    );

    return true;
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  UsersService,
  type CreateUserInput,
  type UpdateUserInput,
} from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@Headers('authorization') authHeader?: string) {
    return this.usersService.getMe(authHeader);
  }

  @Post('users')
  createUser(@Body() body: CreateUserInput) {
    return this.usersService.createUser(body);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserInput,
  ) {
    return this.usersService.updateUser(id, body);
  }

  @Delete('users/:id')
  deleteUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.softDeleteUser(id);
  }
}

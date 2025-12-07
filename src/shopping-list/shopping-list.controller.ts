import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthHeader } from '../common/auth-header.decorator';
import {
  type CreateShoppingListItemInput,
  ShoppingListService,
  type UpdateShoppingListItemInput,
} from './shopping-list.service';

@Controller('shopping-list')
export class ShoppingListController {
  constructor(private readonly shoppingListService: ShoppingListService) {}

  @Get()
  getMine(@AuthHeader() authHeader?: string) {
    return this.shoppingListService.getAll(authHeader);
  }

  @Post()
  create(
    @AuthHeader() authHeader: string | undefined,
    @Body() body: CreateShoppingListItemInput,
  ) {
    return this.shoppingListService.create(authHeader, body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @AuthHeader() authHeader: string | undefined,
    @Body() body: UpdateShoppingListItemInput,
  ) {
    return this.shoppingListService.update(id, authHeader, body);
  }

  @Delete('items')
  deletePurchased(
    @Query('status') status: 'purchased' | undefined,
    @AuthHeader() authHeader?: string,
  ) {
    return this.shoppingListService.deleteByStatus(authHeader, status);
  }

  @Delete(':id')
  deleteOne(
    @Param('id', ParseIntPipe) id: number,
    @AuthHeader() authHeader: string | undefined,
  ) {
    return this.shoppingListService.deleteOne(id, authHeader);
  }
}

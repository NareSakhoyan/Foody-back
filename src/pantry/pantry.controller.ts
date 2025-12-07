import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AuthHeader } from '../common/auth-header.decorator';
import { PantryService, type UpsertPantryItemInput } from './pantry.service';

@Controller('pantry')
export class PantryController {
  constructor(private readonly pantryService: PantryService) {}

  @Get()
  getMine(@AuthHeader() authHeader?: string) {
    return this.pantryService.getAll(authHeader);
  }

  @Delete('items')
  deleteByStatus(
    @Query('status') status: 'active' | 'finished' | undefined,
    @AuthHeader() authHeader?: string,
  ) {
    return this.pantryService.deleteByStatus(authHeader, status);
  }

  @Post()
  upsert(
    @AuthHeader() authHeader: string | undefined,
    @Body() body: UpsertPantryItemInput,
  ) {
    return this.pantryService.upsert(authHeader, body);
  }

  @Delete(':id')
  deleteOrFinish(
    @Param('id', ParseIntPipe) id: number,
    @AuthHeader() authHeader: string | undefined,
    @Query('hard') hard?: string,
  ) {
    return this.pantryService.finishOrDelete(id, authHeader, hard === 'true');
  }
}

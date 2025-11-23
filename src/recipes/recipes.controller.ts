import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthHeader } from '../common/auth-header.decorator';
import {
  RecipesService,
  type CreateRecipeInput,
  type UpdateRecipeInput,
} from './recipes.service';

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  getAll(@AuthHeader() authHeader?: string) {
    return this.recipesService.getAll(authHeader);
  }

  @Get('mine')
  getMine(@AuthHeader() authHeader?: string) {
    return this.recipesService.getMine(authHeader);
  }

  @Get('favorites')
  getFavorites(@AuthHeader() authHeader?: string) {
    return this.recipesService.getFavorites(authHeader);
  }

  @Get(':id')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthHeader() authHeader?: string,
  ) {
    return this.recipesService.getOne(id, authHeader);
  }

  @Post(':id/favorite')
  addFavorite(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthHeader() authHeader: string | undefined,
  ) {
    return this.recipesService.addFavorite(id, authHeader);
  }

  @Post()
  create(
    @AuthHeader() authHeader: string | undefined,
    @Body() body: CreateRecipeInput,
  ) {
    return this.recipesService.create(authHeader, body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthHeader() authHeader: string | undefined,
    @Body() body: UpdateRecipeInput,
  ) {
    return this.recipesService.update(id, authHeader, body);
  }

  @Delete(':id/favorite')
  removeFavorite(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthHeader() authHeader: string | undefined,
  ) {
    return this.recipesService.removeFavorite(id, authHeader);
  }

  @Delete(':id')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthHeader() authHeader: string | undefined,
  ) {
    return this.recipesService.delete(id, authHeader);
  }
}

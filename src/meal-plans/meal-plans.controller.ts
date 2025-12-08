import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AuthHeader } from '../common/auth-header.decorator';
import { MealPlansService } from './meal-plans.service';
import type {
  CreateMealPlanInput,
  UpsertMealPlanEntryInput,
  UpdateMealPlanInput,
} from './meal-plans.service';

@Controller('meal-plans')
export class MealPlansController {
  constructor(private readonly mealPlansService: MealPlansService) {}

  @Get('current')
  getCurrent(
    @Query('start') start: string | undefined,
    @Query('end') end: string | undefined,
    @AuthHeader() authHeader?: string,
  ) {
    return this.mealPlansService.getCurrent(authHeader, start, end);
  }

  @Post()
  createPlan(
    @AuthHeader() authHeader: string | undefined,
    @Body() body: CreateMealPlanInput,
  ) {
    return this.mealPlansService.create(authHeader, body);
  }

  @Put(':id')
  updatePlan(
    @Param('id') id: string,
    @AuthHeader() authHeader: string | undefined,
    @Body() body: UpdateMealPlanInput,
  ) {
    return this.mealPlansService.update(id, authHeader, body);
  }

  @Put(':id/entries')
  upsertEntries(
    @Param('id') id: string,
    @AuthHeader() authHeader: string | undefined,
    @Body()
    body: { entries: UpsertMealPlanEntryInput[] } | UpsertMealPlanEntryInput[],
  ) {
    return this.mealPlansService.upsertEntries(id, authHeader, body);
  }

  @Delete(':id/entries/:entryId')
  deleteEntry(
    @Param('id') planId: string,
    @Param('entryId') entryId: string,
    @AuthHeader() authHeader: string | undefined,
  ) {
    return this.mealPlansService.deleteEntry(planId, entryId, authHeader);
  }

  @Post(':id/add-missing-to-shopping-list')
  addMissingToShoppingList(
    @Param('id') id: string,
    @AuthHeader() authHeader: string | undefined,
  ) {
    return this.mealPlansService.addMissingIngredientsToShoppingList(
      id,
      authHeader,
    );
  }
}

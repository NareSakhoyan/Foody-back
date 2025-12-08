import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/db.module';
import { ShoppingListModule } from '../shopping-list/shopping-list.module';
import { MealPlansController } from './meal-plans.controller';
import { MealPlansService } from './meal-plans.service';

@Module({
  imports: [DatabaseModule, ShoppingListModule],
  controllers: [MealPlansController],
  providers: [MealPlansService],
  exports: [MealPlansService],
})
export class MealPlansModule {}

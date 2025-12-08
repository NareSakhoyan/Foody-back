import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './db/db.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { RecipesModule } from './recipes/recipes.module';
import { TagsModule } from './tags/tags.module';
import { PantryModule } from './pantry/pantry.module';
import { ShoppingListModule } from './shopping-list/shopping-list.module';
import { MealPlansModule } from './meal-plans/meal-plans.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    UsersModule,
    RecipesModule,
    TagsModule,
    PantryModule,
    ShoppingListModule,
    MealPlansModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

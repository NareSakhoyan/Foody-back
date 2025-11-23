import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/db.module';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RecipesController],
  providers: [RecipesService],
})
export class RecipesModule {}

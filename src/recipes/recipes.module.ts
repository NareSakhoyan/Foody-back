import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/db.module';
import { TagsModule } from '../tags/tags.module';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';

@Module({
  imports: [DatabaseModule, TagsModule],
  controllers: [RecipesController],
  providers: [RecipesService],
})
export class RecipesModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/db.module';
import { PantryController } from './pantry.controller';
import { PantryService } from './pantry.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PantryController],
  providers: [PantryService],
  exports: [PantryService],
})
export class PantryModule {}

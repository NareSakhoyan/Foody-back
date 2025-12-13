import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/db.module';
import { SearchHistoryController } from './search-history.controller';
import { SearchHistoryService } from './search-history.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SearchHistoryController],
  providers: [SearchHistoryService],
})
export class SearchHistoryModule {}

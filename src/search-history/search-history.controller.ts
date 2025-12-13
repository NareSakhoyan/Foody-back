import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { AuthHeader } from '../common/auth-header.decorator';
import {
  SearchHistoryService,
  type PaginatedSearchHistory,
} from './search-history.service';

type HistoryQuery = {
  page?: string;
  pageSize?: string;
};

@Controller('search-history')
export class SearchHistoryController {
  constructor(private readonly searchHistoryService: SearchHistoryService) {}

  @Get()
  getHistory(
    @AuthHeader() authHeader: string | undefined,
    @Query() query: HistoryQuery,
  ): Promise<PaginatedSearchHistory> {
    return this.searchHistoryService.getHistory(authHeader, query);
  }

  @Delete()
  deleteHistory(@AuthHeader() authHeader: string | undefined) {
    return this.searchHistoryService.deleteHistory(authHeader);
  }

  @Delete(':id')
  deleteHistoryEntry(
    @AuthHeader() authHeader: string | undefined,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.searchHistoryService.deleteHistoryEntry(authHeader, id);
  }
}

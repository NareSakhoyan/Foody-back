import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, schema } from '../db/db.module';
import type { DrizzleDb } from '../db/db.module';
import type { SearchFilters } from '../db/schema';

type HistoryRow = typeof schema.searchHistory.$inferSelect;

type HistoryQuery = {
  page?: string | number;
  pageSize?: string | number;
};

export type SearchHistoryEntry = {
  id: number;
  query: string;
  filters: SearchFilters;
  createdAt: Date;
};

export type PaginatedSearchHistory = {
  items: SearchHistoryEntry[];
  page: number;
  pageSize: number;
  total: number;
};

@Injectable()
export class SearchHistoryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getHistory(
    authHeader: string | undefined,
    params?: HistoryQuery,
  ): Promise<PaginatedSearchHistory> {
    const user = await this.getUserFromAuth(authHeader);
    const { page, pageSize } = this.normalizePagination(params);

    const rows = await this.db
      .select()
      .from(schema.searchHistory)
      .where(and(eq(schema.searchHistory.userId, user.id)))
      .orderBy(desc(schema.searchHistory.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.searchHistory)
      .where(and(eq(schema.searchHistory.userId, user.id)));

    return {
      items: rows as HistoryRow[],
      page,
      pageSize,
      total: Number(count),
    };
  }

  async deleteHistory(
    authHeader: string | undefined,
  ): Promise<{ deletedCount: number }> {
    const user = await this.getUserFromAuth(authHeader);
    const deleted = await this.db
      .delete(schema.searchHistory)
      .where(eq(schema.searchHistory.userId, user.id))
      .returning({ id: schema.searchHistory.id });

    return { deletedCount: deleted.length };
  }

  async deleteHistoryEntry(
    authHeader: string | undefined,
    id: number,
  ): Promise<{ deleted: boolean }> {
    const user = await this.getUserFromAuth(authHeader);
    const deleted = await this.db
      .delete(schema.searchHistory)
      .where(
        and(
          eq(schema.searchHistory.userId, user.id),
          eq(schema.searchHistory.id, id),
        ),
      )
      .returning({ id: schema.searchHistory.id });

    return { deleted: deleted.length > 0 };
  }

  private normalizePagination(params?: HistoryQuery) {
    const pageNum = Number(params?.page) || 1;
    const pageSizeNum = Number(params?.pageSize) || 20;

    return {
      page: pageNum < 1 ? 1 : pageNum,
      pageSize: pageSizeNum < 1 ? 20 : Math.min(pageSizeNum, 100),
    };
  }

  private async getUserFromAuth(authHeader?: string) {
    const clerkId = this.parseClerkIdFromAuth(authHeader);

    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.clerkId, clerkId),
          eq(schema.users.isDeleted, false),
        ),
      );

    if (!user) {
      throw new UnauthorizedException('User not found for token');
    }

    return user;
  }

  private parseClerkIdFromAuth(authHeader?: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) {
      throw new UnauthorizedException(
        'Authorization header must be a Bearer token',
      );
    }

    const token = match[1];
    const parts = token.split('.');
    if (parts.length < 2) {
      throw new UnauthorizedException('Invalid bearer token format');
    }

    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      );
      const clerkId = payload.sub as string | undefined;
      if (!clerkId) {
        throw new Error('Missing sub');
      }
      return clerkId;
    } catch {
      throw new UnauthorizedException('Invalid bearer token payload');
    }
  }
}

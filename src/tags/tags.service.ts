import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import type { NodePgTransaction } from 'drizzle-orm/node-postgres';
import { DRIZZLE, schema } from '../db/db.module';
import type { DrizzleDb } from '../db/db.module';

export type TagInfo = Pick<typeof schema.tags.$inferSelect, 'id' | 'name'>;
type DbOrTx = DrizzleDb | NodePgTransaction<any, any>;

@Injectable()
export class TagsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getAll() {
    return this.db.select().from(schema.tags).orderBy(asc(schema.tags.name));
  }

  async getTagsForRecipeIds(recipeIds: string[]) {
    if (!recipeIds || recipeIds.length === 0) {
      return new Map<string, TagInfo[]>();
    }

    const rows = await this.db
      .select({
        recipeId: schema.recipeTags.recipeId,
        id: schema.tags.id,
        name: schema.tags.name,
      })
      .from(schema.recipeTags)
      .innerJoin(schema.tags, eq(schema.tags.id, schema.recipeTags.tagId))
      .where(inArray(schema.recipeTags.recipeId, recipeIds));

    const map = new Map<string, TagInfo[]>();
    for (const row of rows) {
      const list = map.get(row.recipeId) ?? [];
      list.push({ id: row.id, name: row.name });
      map.set(row.recipeId, list);
    }

    for (const [key, list] of map) {
      list.sort((a, b) => a.name.localeCompare(b.name));
      map.set(key, list);
    }

    return map;
  }

  async upsert(names: string[], db: DbOrTx = this.db) {
    const uniqueNames = Array.from(
      new Set(
        names
          .map((n) => n.trim())
          .filter(Boolean),
      ),
    );

    if (uniqueNames.length === 0) {
      return;
    }

    await db
      .insert(schema.tags)
      .values(uniqueNames.map((name) => ({ name })))
      .onConflictDoNothing({ target: schema.tags.name });
  }

  async findByNames(names: string[], db: DbOrTx = this.db) {
    if (!names || names.length === 0) {
      return [];
    }

    return db
      .select()
      .from(schema.tags)
      .where(inArray(schema.tags.name, names));
  }
}

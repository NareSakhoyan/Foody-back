import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { DRIZZLE, schema } from '../db/db.module';
import type { DrizzleDb } from '../db/db.module';
import type { Ingredient } from '../db/schema';
import { TagsService, type TagInfo } from '../tags/tags.service';
import { buildRecommendationScoreQuery } from './sql/recommendations';

type RecipeRow = typeof schema.recipes.$inferSelect;
type AuthorInfo = Pick<
  typeof schema.users.$inferSelect,
  'id' | 'name' | 'imageUrl'
>;
type RecipeWithAuthor = Omit<RecipeRow, 'tags'> & {
  tags: TagInfo[];
  tagIds: number[];
  author: AuthorInfo;
};
type PaginatedRecipes = {
  items: RecipeWithAuthor[];
  page: number;
  pageSize: number;
  total: number;
};
type RecommendedRecipe = RecipeWithAuthor & {
  matchCount: number;
  matchRatio: number;
  matchedIngredients: string[];
  missingIngredients: string[];
};
type ScoreRow = {
  id: string;
  match_count: number | null;
  total_ingredients: number | null;
  match_ratio: string | number | null;
  matched_ingredients: string[] | null;
  missing_ingredients: string[] | null;
};

export type CreateRecipeInput = {
  name: string;
  slug: string;
  shortDescription?: string | null;
  imageUrl?: string | null;
  prepDescription?: string | null;
  cookDescription?: string | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  servings?: number | null;
  ingredients: Ingredient[];
  spices?: string[];
  tags?: string[];
  isPublic?: boolean;
  status?: 'draft' | 'published' | 'archived';
};

export type UpdateRecipeInput = Partial<
  Omit<CreateRecipeInput, 'slug' | 'ingredients' | 'name'> & {
    name?: string;
    slug?: string;
    ingredients?: Ingredient[];
  }
>;

@Injectable()
export class RecipesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly tagsService: TagsService,
  ) {}

  private pgTrgmEnsured = false;

  async getAll(
    authHeader: string | undefined,
    params?: {
      page?: string | number;
      pageSize?: string | number;
      q?: string;
      tag?: string;
      status?: string;
      authorId?: string | number;
    },
  ): Promise<PaginatedRecipes> {
    const user = await this.getUserFromOptionalAuth(authHeader);
    const { page, pageSize } = this.normalizePagination(params);
    const filters = this.buildRecipeFilters(params, user?.id);
    const visibility = user
      ? or(
          eq(schema.recipes.isPublic, true),
          eq(schema.recipes.authorId, user.id),
        )
      : eq(schema.recipes.isPublic, true);

    const whereClause =
      filters.length > 0 ? and(visibility, ...filters) : visibility;

    const rows = await this.db
      .select({
        recipe: schema.recipes,
        author: {
          id: schema.users.id,
          name: schema.users.name,
          imageUrl: schema.users.imageUrl,
        },
      })
      .from(schema.recipes)
      .innerJoin(schema.users, eq(schema.users.id, schema.recipes.authorId))
      .where(and(eq(schema.users.isDeleted, false), whereClause))
      .orderBy(desc(schema.recipes.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const tagsMap = await this.tagsService.getTagsForRecipeIds(
      rows.map((r) => r.recipe.id),
    );

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.recipes)
      .innerJoin(schema.users, eq(schema.users.id, schema.recipes.authorId))
      .where(and(eq(schema.users.isDeleted, false), whereClause));

    return {
      items: rows.map((row) => this.mapRecipeWithAuthor(row, tagsMap)),
      page,
      pageSize,
      total: Number(count),
    };
  }

  async getFavorites(
    authHeader?: string,
    params?: {
      page?: string | number;
      pageSize?: string | number;
      q?: string;
      tag?: string;
      status?: string;
    },
  ): Promise<PaginatedRecipes> {
    const user = await this.getUserFromAuth(authHeader);
    const { page, pageSize } = this.normalizePagination(params);
    const filters = this.buildRecipeFilters(params, undefined);
    const whereClause =
      filters.length > 0
        ? and(eq(schema.recipeFavorites.userId, user.id), ...filters)
        : eq(schema.recipeFavorites.userId, user.id);

    const rows = await this.db
      .select({
        recipe: schema.recipes,
        author: {
          id: schema.users.id,
          name: schema.users.name,
          imageUrl: schema.users.imageUrl,
        },
      })
      .from(schema.recipeFavorites)
      .innerJoin(
        schema.recipes,
        eq(schema.recipes.id, schema.recipeFavorites.recipeId),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.recipes.authorId))
      .where(and(eq(schema.users.isDeleted, false), whereClause))
      .orderBy(desc(schema.recipes.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const tagsMap = await this.tagsService.getTagsForRecipeIds(
      rows.map((r) => r.recipe.id),
    );

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.recipeFavorites)
      .innerJoin(
        schema.recipes,
        eq(schema.recipes.id, schema.recipeFavorites.recipeId),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.recipes.authorId))
      .where(and(eq(schema.users.isDeleted, false), whereClause));

    return {
      items: rows.map((row) => this.mapRecipeWithAuthor(row, tagsMap)),
      page,
      pageSize,
      total: Number(count),
    };
  }

  async getRecommendations(
    authHeader: string | undefined,
    params?: {
      limit?: string | number;
      q?: string;
      tag?: string;
      status?: string;
    },
  ): Promise<RecommendedRecipe[]> {
    const user = await this.getUserFromAuth(authHeader);
    const limit = this.normalizeLimit(params?.limit);
    const conditions = this.buildRecommendationConditions(user.id, params);
    await this.ensurePgTrgmExtension();
    const whereClause =
      conditions.length > 0
        ? sql`where ${sql.join(conditions, sql` and `)}`
        : sql``;

    const recommendationQuery = buildRecommendationScoreQuery({
      userId: user.id,
      limit,
      whereClause,
    });

    const { rows: scoredRows } = (await this.db.execute(
      recommendationQuery,
    )) as { rows: ScoreRow[] };

    const scoreRows = scoredRows ?? [];
    if (scoreRows.length === 0) {
      const fallbackFilters = this.buildRecipeFilters(
        params
          ? {
              q: params.q,
              tag: params.tag,
              status: params.status,
            }
          : undefined,
        undefined,
        false,
      );
      const visibility = or(
        eq(schema.recipes.isPublic, true),
        eq(schema.recipes.authorId, user.id),
      );
      const ingredientCount = sql<number>`jsonb_array_length(${schema.recipes.ingredients})`;

      const fallbackRows = await this.db
        .select({
          recipe: schema.recipes,
          author: {
            id: schema.users.id,
            name: schema.users.name,
            imageUrl: schema.users.imageUrl,
          },
          ingredientCount,
        })
        .from(schema.recipes)
        .innerJoin(schema.users, eq(schema.users.id, schema.recipes.authorId))
        .where(
          and(eq(schema.users.isDeleted, false), visibility, ...fallbackFilters),
        )
        .orderBy(ingredientCount, desc(schema.recipes.updatedAt))
        .limit(limit);

      if (fallbackRows.length === 0) {
        return [];
      }

      const recipeIds = fallbackRows.map((row) => row.recipe.id);
      const tagsMap = await this.tagsService.getTagsForRecipeIds(recipeIds);

      return fallbackRows.map((row) => ({
        ...this.mapRecipeWithAuthor(row, tagsMap),
        matchCount: 0,
        matchRatio: 0,
        matchedIngredients: [],
        missingIngredients: [],
      }));
    }

    const recipeIds = scoreRows.map((row) => row.id as string);

    const recipes = await this.db
      .select({
        recipe: schema.recipes,
        author: {
          id: schema.users.id,
          name: schema.users.name,
          imageUrl: schema.users.imageUrl,
        },
      })
      .from(schema.recipes)
      .innerJoin(schema.users, eq(schema.users.id, schema.recipes.authorId))
      .where(inArray(schema.recipes.id, recipeIds));

    const tagsMap = await this.tagsService.getTagsForRecipeIds(recipeIds);
    const recipeMap = new Map(
      recipes.map((row) => [row.recipe.id, row] as const),
    );

    return scoreRows
      .map((row) => {
        const data = recipeMap.get(row.id);
        if (!data) {
          return null;
        }
        const matchCount = Number(row.match_count ?? 0);
        const matchRatio = Number(row.match_ratio ?? 0);
        const matchedIngredients = (row.matched_ingredients as string[]) ?? [];
        const missingIngredients = (row.missing_ingredients as string[]) ?? [];

        return {
          ...this.mapRecipeWithAuthor(data, tagsMap),
          matchCount,
          matchRatio,
          matchedIngredients,
          missingIngredients,
        };
      })
      .filter(Boolean) as RecommendedRecipe[];
  }

  async addFavorite(
    recipeId: string,
    authHeader: string | undefined,
  ): Promise<{ favorited: boolean }> {
    const user = await this.getUserFromAuth(authHeader);
    const recipe = await this.findRecipeOrThrow(recipeId);

    await this.db
      .insert(schema.recipeFavorites)
      .values({ userId: user.id, recipeId: recipe.id })
      .onConflictDoNothing({
        target: [
          schema.recipeFavorites.userId,
          schema.recipeFavorites.recipeId,
        ],
      });

    return { favorited: true };
  }

  async removeFavorite(
    recipeId: string,
    authHeader: string | undefined,
  ): Promise<{ favorited: boolean }> {
    const user = await this.getUserFromAuth(authHeader);

    await this.db
      .delete(schema.recipeFavorites)
      .where(
        and(
          eq(schema.recipeFavorites.userId, user.id),
          eq(schema.recipeFavorites.recipeId, recipeId),
        ),
      );

    return { favorited: false };
  }

  async getMine(
    authHeader?: string,
    params?: {
      page?: string | number;
      pageSize?: string | number;
      q?: string;
      tag?: string;
      status?: string;
    },
  ): Promise<PaginatedRecipes> {
    const user = await this.getUserFromAuth(authHeader);
    const { page, pageSize } = this.normalizePagination(params);
    const filters = this.buildRecipeFilters(params, user.id, true);

    const rows = await this.db
      .select({
        recipe: schema.recipes,
        author: {
          id: schema.users.id,
          name: schema.users.name,
          imageUrl: schema.users.imageUrl,
        },
      })
      .from(schema.recipes)
      .innerJoin(schema.users, eq(schema.users.id, schema.recipes.authorId))
      .where(and(eq(schema.users.isDeleted, false), ...filters))
      .orderBy(desc(schema.recipes.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const tagsMap = await this.tagsService.getTagsForRecipeIds(
      rows.map((r) => r.recipe.id),
    );

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.recipes)
      .innerJoin(schema.users, eq(schema.users.id, schema.recipes.authorId))
      .where(and(eq(schema.users.isDeleted, false), ...filters));

    return {
      items: rows.map((row) => this.mapRecipeWithAuthor(row, tagsMap)),
      page,
      pageSize,
      total: Number(count),
    };
  }

  async getOne(id: string, authHeader?: string) {
    const user = authHeader ? await this.getUserFromAuth(authHeader) : null;

    const [row] = await this.db
      .select({
        recipe: schema.recipes,
        author: {
          id: schema.users.id,
          name: schema.users.name,
          imageUrl: schema.users.imageUrl,
        },
      })
      .from(schema.recipes)
      .innerJoin(schema.users, eq(schema.users.id, schema.recipes.authorId))
      .where(eq(schema.recipes.id, id));

    if (!row) {
      throw new NotFoundException('Recipe not found');
    }

    if (!row.recipe.isPublic && (!user || row.recipe.authorId !== user.id)) {
      throw new ForbiddenException('You cannot view this recipe');
    }

    const tagsMap = await this.tagsService.getTagsForRecipeIds([row.recipe.id]);

    return this.mapRecipeWithAuthor(row, tagsMap);
  }

  async create(authHeader: string | undefined, input: CreateRecipeInput) {
    const user = await this.getUserFromAuth(authHeader);

    this.validateCreate(input);

    const result = await this.db.transaction(async (tx) => {
      const [existingSlug] = await tx
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.slug, input.slug));

      if (existingSlug) {
        throw new BadRequestException('Slug already in use');
      }

      const [recipe] = await tx
        .insert(schema.recipes)
        .values({
          authorId: user.id,
          name: input.name,
          slug: input.slug,
          shortDescription: input.shortDescription ?? null,
          imageUrl: input.imageUrl ?? null,
          prepDescription: input.prepDescription ?? null,
          cookDescription: input.cookDescription ?? null,
          prepTimeMinutes: input.prepTimeMinutes ?? null,
          cookTimeMinutes: input.cookTimeMinutes ?? null,
          servings: input.servings ?? null,
          ingredients: input.ingredients,
          spices: input.spices ?? [],
          tags: input.tags ?? [],
          isPublic: input.isPublic ?? true,
          status: input.status ?? 'draft',
        })
        .returning();

      const tagNames = input.tags ?? [];
      if (tagNames.length > 0) {
        await this.tagsService.upsert(tagNames, tx);
        const rows = await this.tagsService.findByNames(tagNames, tx);

        if (rows.length > 0) {
          const links = rows.map((tag) => ({
            recipeId: recipe.id,
            tagId: tag.id,
          }));

          await tx
            .insert(schema.recipeTags)
            .values(links)
            .onConflictDoNothing({
              target: [schema.recipeTags.recipeId, schema.recipeTags.tagId],
            });
        }
      }

      return recipe;
    });

    return result;
  }

  async update(
    id: string,
    authHeader: string | undefined,
    input: UpdateRecipeInput,
  ) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const user = await this.getUserFromAuth(authHeader);
    const recipe = await this.findRecipeOrThrow(id);

    if (recipe.authorId !== user.id) {
      throw new ForbiddenException('You cannot edit this recipe');
    }

    if (input.slug && input.slug !== recipe.slug) {
      const [slugExists] = await this.db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.slug, input.slug));
      if (slugExists) {
        throw new BadRequestException('Slug already in use');
      }
    }

    const tagsToUpdate = input.tags;

    const updated = await this.db.transaction(async (tx) => {
      const [recipeRow] = await tx
        .update(schema.recipes)
        .set({
          name: input.name ?? recipe.name,
          slug: input.slug ?? recipe.slug,
          shortDescription: input.shortDescription ?? recipe.shortDescription,
          imageUrl: input.imageUrl ?? recipe.imageUrl,
          prepDescription: input.prepDescription ?? recipe.prepDescription,
          cookDescription: input.cookDescription ?? recipe.cookDescription,
          prepTimeMinutes: input.prepTimeMinutes ?? recipe.prepTimeMinutes,
          cookTimeMinutes: input.cookTimeMinutes ?? recipe.cookTimeMinutes,
          servings: input.servings ?? recipe.servings,
          ingredients: input.ingredients ?? recipe.ingredients,
          spices: input.spices ?? recipe.spices,
          tags: tagsToUpdate ?? recipe.tags,
          isPublic: input.isPublic ?? recipe.isPublic,
          status: input.status ?? recipe.status,
        })
        .where(eq(schema.recipes.id, recipe.id))
        .returning();

      if (tagsToUpdate !== undefined) {
        await tx
          .delete(schema.recipeTags)
          .where(eq(schema.recipeTags.recipeId, recipe.id));

        if (tagsToUpdate.length > 0) {
          await this.tagsService.upsert(tagsToUpdate, tx);
          const tagRows = await this.tagsService.findByNames(tagsToUpdate, tx);

          if (tagRows.length > 0) {
            await tx
              .insert(schema.recipeTags)
              .values(
                tagRows.map((tag) => ({
                  recipeId: recipe.id,
                  tagId: tag.id,
                })),
              )
              .onConflictDoNothing({
                target: [schema.recipeTags.recipeId, schema.recipeTags.tagId],
              });
          }
        }
      }

      return recipeRow;
    });

    return updated;
  }

  async delete(id: string, authHeader: string | undefined) {
    const user = await this.getUserFromAuth(authHeader);
    const recipe = await this.findRecipeOrThrow(id);

    if (recipe.authorId !== user.id) {
      throw new ForbiddenException('You cannot delete this recipe');
    }

    const [deleted] = await this.db
      .delete(schema.recipes)
      .where(eq(schema.recipes.id, id))
      .returning();

    return deleted;
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

  private async getUserFromOptionalAuth(authHeader?: string) {
    if (!authHeader) {
      return null;
    }
    return this.getUserFromAuth(authHeader);
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

  private validateCreate(input: CreateRecipeInput) {
    if (!input.name || !input.slug) {
      throw new BadRequestException('name and slug are required');
    }
    if (!input.ingredients || input.ingredients.length === 0) {
      throw new BadRequestException('ingredients are required');
    }
  }

  private async findRecipeOrThrow(id: string) {
    const [recipe] = await this.db
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.id, id));

    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }

    return recipe;
  }

  private mapRecipeWithAuthor(
    row: {
      recipe: RecipeRow;
      author: AuthorInfo;
    },
    tagMap: Map<string, TagInfo[]>,
  ): RecipeWithAuthor {
    const tags = tagMap.get(row.recipe.id) ?? [];
    return {
      ...row.recipe,
      tags,
      tagIds: tags.map((t) => t.id),
      author: {
        id: row.author.id,
        name: row.author.name,
        imageUrl: row.author.imageUrl,
      },
    };
  }

  private normalizePagination(params?: {
    page?: string | number;
    pageSize?: string | number;
  }) {
    const pageNum = Number(params?.page) || 1;
    const pageSizeNum = Number(params?.pageSize) || 20;
    return {
      page: pageNum < 1 ? 1 : pageNum,
      pageSize: pageSizeNum < 1 ? 20 : Math.min(pageSizeNum, 100),
    };
  }

  private normalizeLimit(limit?: string | number) {
    const num = Number(limit) || 5;
    if (Number.isNaN(num) || num < 1) {
      return 5;
    }
    return Math.min(num, 20);
  }

  private async ensurePgTrgmExtension() {
    if (this.pgTrgmEnsured) {
      return;
    }

    await this.db.execute(sql`create extension if not exists pg_trgm`);
    this.pgTrgmEnsured = true;
  }

  private buildRecommendationConditions(
    userId: number,
    params?: {
      q?: string;
      tag?: string;
      status?: string;
      authorId?: string | number;
    },
  ) {
    const conditions: any[] = [
      sql`${schema.users.isDeleted} = false`,
      sql`(${schema.recipes.isPublic} = true or ${schema.recipes.authorId} = ${userId})`,
    ];

    if (params?.authorId) {
      conditions.push(
        sql`${schema.recipes.authorId} = ${Number(params.authorId)}`,
      );
    }

    if (params?.status) {
      conditions.push(sql`${schema.recipes.status} = ${params.status}`);
    }

    if (params?.q) {
      const like = `%${params.q}%`;
      conditions.push(
        sql`(${schema.recipes.name} ilike ${like} or ${schema.recipes.shortDescription} ilike ${like})`,
      );
    }

    if (params?.tag) {
      const numericTagId = Number(params.tag);
      if (!Number.isNaN(numericTagId)) {
        conditions.push(
          sql`${schema.recipes.id} in (select ${schema.recipeTags.recipeId} from ${schema.recipeTags} where ${schema.recipeTags.tagId} = ${numericTagId})`,
        );
      } else {
        conditions.push(
          sql`${schema.recipes.id} in (select ${schema.recipeTags.recipeId} from ${schema.recipeTags} join ${schema.tags} on ${schema.tags.id} = ${schema.recipeTags.tagId} where ${schema.tags.name} = ${params.tag})`,
        );
      }
    }

    return conditions;
  }

  private buildRecipeFilters(
    params:
      | {
          q?: string;
          tag?: string;
          status?: string;
          authorId?: string | number;
        }
      | undefined,
    callerId?: number,
    forceAuthor?: boolean,
  ) {
    const conditions: any[] = [];

    if (forceAuthor && callerId) {
      conditions.push(eq(schema.recipes.authorId, callerId));
    } else if (params?.authorId) {
      conditions.push(eq(schema.recipes.authorId, Number(params.authorId)));
    }

    if (params?.status) {
      conditions.push(eq(schema.recipes.status, params.status));
    }

    if (params?.q) {
      const like = `%${params.q}%`;
      conditions.push(
        or(
          ilike(schema.recipes.name, like),
          ilike(schema.recipes.shortDescription, like),
        ),
      );
    }

    if (params?.tag) {
      const numericTagId = Number(params.tag);
      if (!Number.isNaN(numericTagId)) {
        conditions.push(
          sql`${schema.recipes.id} IN (select ${schema.recipeTags.recipeId} from ${schema.recipeTags} where ${schema.recipeTags.tagId} = ${numericTagId})`,
        );
      } else {
        conditions.push(
          sql`${schema.recipes.id} IN (select ${schema.recipeTags.recipeId} from ${schema.recipeTags} join ${schema.tags} on ${schema.tags.id} = ${schema.recipeTags.tagId} where ${schema.tags.name} = ${params.tag})`,
        );
      }
    }

    return conditions;
  }
}

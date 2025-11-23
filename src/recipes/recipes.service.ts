import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, desc, eq, or } from 'drizzle-orm';
import { DRIZZLE, schema } from '../db/db.module';
import type { DrizzleDb } from '../db/db.module';
import type { Ingredient } from '../db/schema';

type RecipeRow = typeof schema.recipes.$inferSelect;
type AuthorInfo = Pick<
  typeof schema.users.$inferSelect,
  'id' | 'name' | 'imageUrl'
>;
type RecipeWithAuthor = RecipeRow & { author: AuthorInfo };

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
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getAll(authHeader?: string): Promise<RecipeWithAuthor[]> {
    const user = await this.getUserFromOptionalAuth(authHeader);
    const visibility = user
      ? or(
          eq(schema.recipes.isPublic, true),
          eq(schema.recipes.authorId, user.id),
        )
      : eq(schema.recipes.isPublic, true);

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
      .where(and(eq(schema.users.isDeleted, false), visibility))
      .orderBy(desc(schema.recipes.updatedAt));

    return rows.map((row) => this.mapRecipeWithAuthor(row));
  }

  async getFavorites(authHeader?: string): Promise<RecipeWithAuthor[]> {
    const user = await this.getUserFromAuth(authHeader);

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
      .where(
        and(
          eq(schema.recipeFavorites.userId, user.id),
          eq(schema.users.isDeleted, false),
        ),
      )
      .orderBy(desc(schema.recipes.updatedAt));

    return rows.map((row) => this.mapRecipeWithAuthor(row));
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

  async getMine(authHeader?: string): Promise<RecipeWithAuthor[]> {
    const user = await this.getUserFromAuth(authHeader);

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
      .where(
        and(
          eq(schema.recipes.authorId, user.id),
          eq(schema.users.isDeleted, false),
        ),
      )
      .orderBy(desc(schema.recipes.updatedAt));

    return rows.map((row) => this.mapRecipeWithAuthor(row));
  }

  async getOne(id: string, authHeader?: string) {
    const user = authHeader ? await this.getUserFromAuth(authHeader) : null;
    const recipe = await this.findRecipeOrThrow(id);

    if (!recipe.isPublic && (!user || recipe.authorId !== user.id)) {
      throw new ForbiddenException('You cannot view this recipe');
    }

    return recipe;
  }

  async create(authHeader: string | undefined, input: CreateRecipeInput) {
    const user = await this.getUserFromAuth(authHeader);

    this.validateCreate(input);

    const [existingSlug] = await this.db
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.slug, input.slug));

    if (existingSlug) {
      throw new BadRequestException('Slug already in use');
    }

    const [recipe] = await this.db
      .insert(schema.recipes)
      .values({
        authorId: user.id,
        name: input.name,
        slug: input.slug,
        shortDescription: input.shortDescription ?? null,
        imageUrl: input.imageUrl ?? null,
        prepDescription: input.prepDescription ?? null,
        cookDescription: input.cookDescription ?? null,
        steps: null,
        prepTimeMinutes: input.prepTimeMinutes ?? null,
        cookTimeMinutes: input.cookTimeMinutes ?? null,
        servings: input.servings ?? null,
        ingredients: input.ingredients,
        tags: input.tags ?? [],
        isPublic: input.isPublic ?? true,
        status: input.status ?? 'draft',
      })
      .returning();

    return recipe;
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

    const [updated] = await this.db
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
        tags: input.tags ?? recipe.tags,
        isPublic: input.isPublic ?? recipe.isPublic,
        status: input.status ?? recipe.status,
      })
      .where(eq(schema.recipes.id, recipe.id))
      .returning();

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

  private mapRecipeWithAuthor(row: {
    recipe: RecipeRow;
    author: AuthorInfo;
  }): RecipeWithAuthor {
    return {
      ...row.recipe,
      author: {
        id: row.author.id,
        name: row.author.name,
        imageUrl: row.author.imageUrl,
      },
    };
  }
}

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, lt, or } from 'drizzle-orm';
import { DRIZZLE, schema } from '../db/db.module';
import type { DrizzleDb } from '../db/db.module';
import { ShoppingListService } from '../shopping-list/shopping-list.service';

type MealPlanRow = typeof schema.mealPlans.$inferSelect;
type MealPlanEntryRow = typeof schema.mealPlanEntries.$inferSelect;

export type CreateMealPlanInput = {
  title?: string | null;
  startDate: string;
  endDate: string;
};

export type UpdateMealPlanInput = Partial<CreateMealPlanInput>;

export type UpsertMealPlanEntryInput = {
  id?: string;
  day: string;
  mealType?: string | null;
  recipeId: string;
  notes?: string | null;
  sortOrder?: number | null;
};

@Injectable()
export class MealPlansService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly shoppingListService: ShoppingListService,
  ) {}

  async getCurrent(
    authHeader: string | undefined,
    start?: string,
    end?: string,
  ) {
    const user = await this.getUserFromAuth(authHeader);
    const { startDate, endDate } = this.normalizeRange(start, end);

    const [plan] = await this.db
      .select()
      .from(schema.mealPlans)
      .where(
        and(
          eq(schema.mealPlans.userId, user.id),
          eq(schema.mealPlans.startDate, startDate),
          eq(schema.mealPlans.endDate, endDate),
        ),
      )
      .orderBy(desc(schema.mealPlans.updatedAt))
      .limit(1);

    const entries = plan ? await this.getEntries(plan.id) : [];

    return {
      plan:
        plan ??
        ({
          id: null,
          title: null,
          startDate,
          endDate,
        } as const),
      entries,
    };
  }

  async create(authHeader: string | undefined, input: CreateMealPlanInput) {
    const user = await this.getUserFromAuth(authHeader);
    const { startDate, endDate } = this.normalizeRange(
      input.startDate,
      input.endDate,
    );
    const title = input.title?.trim() || null;

    const [created] = await this.db
      .insert(schema.mealPlans)
      .values({
        userId: user.id,
        title,
        startDate,
        endDate,
      })
      .returning();

    return created;
  }

  async update(
    id: string,
    authHeader: string | undefined,
    input: UpdateMealPlanInput,
  ) {
    if (
      input.title === undefined &&
      input.startDate === undefined &&
      input.endDate === undefined
    ) {
      throw new BadRequestException('No fields provided to update');
    }

    const user = await this.getUserFromAuth(authHeader);
    const plan = await this.getPlanForUser(id, user.id);

    const { startDate, endDate } = this.normalizeRange(
      input.startDate ?? plan.startDate,
      input.endDate ?? plan.endDate,
    );

    const outOfRangeEntries = await this.db
      .select({
        id: schema.mealPlanEntries.id,
        day: schema.mealPlanEntries.day,
      })
      .from(schema.mealPlanEntries)
      .where(
        and(
          eq(schema.mealPlanEntries.planId, plan.id),
          or(
            lt(schema.mealPlanEntries.day, startDate),
            gt(schema.mealPlanEntries.day, endDate),
          ),
        ),
      )
      .limit(1);

    if (outOfRangeEntries.length > 0) {
      throw new BadRequestException(
        'Plan has entries outside of the updated date range',
      );
    }

    const title =
      input.title === undefined ? plan.title : input.title?.trim() || null;

    const [updated] = await this.db
      .update(schema.mealPlans)
      .set({
        title,
        startDate,
        endDate,
      })
      .where(
        and(
          eq(schema.mealPlans.id, plan.id),
          eq(schema.mealPlans.userId, user.id),
        ),
      )
      .returning();

    return updated;
  }

  async upsertEntries(
    planId: string,
    authHeader: string | undefined,
    body: { entries: UpsertMealPlanEntryInput[] } | UpsertMealPlanEntryInput[],
  ) {
    const user = await this.getUserFromAuth(authHeader);
    const plan = await this.getPlanForUser(planId, user.id);
    const entriesPayload = Array.isArray(body)
      ? body
      : Array.isArray(body.entries)
        ? body.entries
        : null;

    if (!entriesPayload) {
      throw new BadRequestException('entries must be an array');
    }

    const normalized = entriesPayload.map((entry, index) => {
      const day = this.parseDate(entry.day, 'day');
      this.assertWithinRange(day, plan.startDate, plan.endDate);

      const recipeId = entry.recipeId?.trim();
      if (!recipeId) {
        throw new BadRequestException(`entries[${index}].recipeId is required`);
      }

      const mealType = entry.mealType?.trim() || null;
      const notes = entry.notes?.trim() || null;
      const sortOrder =
        entry.sortOrder === undefined || entry.sortOrder === null
          ? 0
          : entry.sortOrder;

      return {
        id: entry.id,
        day,
        recipeId,
        mealType,
        notes,
        sortOrder,
      };
    });

    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(schema.mealPlanEntries)
        .where(eq(schema.mealPlanEntries.planId, plan.id));

      const existingMap = new Map(existing.map((entry) => [entry.id, entry]));
      const keepIds = new Set<string>();
      const results: MealPlanEntryRow[] = [];

      for (const entry of normalized) {
        if (entry.id) {
          const current = existingMap.get(entry.id);
          if (!current) {
            throw new NotFoundException(
              `Entry ${entry.id} does not belong to this plan`,
            );
          }

          const [updated] = await tx
            .update(schema.mealPlanEntries)
            .set({
              day: entry.day,
              recipeId: entry.recipeId,
              mealType: entry.mealType,
              notes: entry.notes,
              sortOrder: entry.sortOrder,
            })
            .where(eq(schema.mealPlanEntries.id, entry.id))
            .returning();

          keepIds.add(updated.id);
          results.push(updated);
          continue;
        }

        const [created] = await tx
          .insert(schema.mealPlanEntries)
          .values({
            planId: plan.id,
            day: entry.day,
            recipeId: entry.recipeId,
            mealType: entry.mealType,
            notes: entry.notes,
            sortOrder: entry.sortOrder,
          })
          .returning();

        keepIds.add(created.id);
        results.push(created);
      }

      const staleIds = existing
        .filter((entry) => !keepIds.has(entry.id))
        .map((entry) => entry.id);

      if (staleIds.length > 0) {
        await tx
          .delete(schema.mealPlanEntries)
          .where(
            and(
              eq(schema.mealPlanEntries.planId, plan.id),
              inArray(schema.mealPlanEntries.id, staleIds),
            ),
          );
      }

      return results.sort((a, b) =>
        a.day === b.day
          ? a.sortOrder - b.sortOrder
          : a.day.localeCompare(b.day),
      );
    });
  }

  async deleteEntry(
    planId: string,
    entryId: string,
    authHeader: string | undefined,
  ) {
    const user = await this.getUserFromAuth(authHeader);
    await this.getPlanForUser(planId, user.id);

    const [existing] = await this.db
      .select()
      .from(schema.mealPlanEntries)
      .where(
        and(
          eq(schema.mealPlanEntries.id, entryId),
          eq(schema.mealPlanEntries.planId, planId),
        ),
      );

    if (!existing) {
      throw new NotFoundException('Entry not found');
    }

    const [deleted] = await this.db
      .delete(schema.mealPlanEntries)
      .where(eq(schema.mealPlanEntries.id, existing.id))
      .returning();

    return deleted;
  }

  async addMissingIngredientsToShoppingList(
    planId: string,
    authHeader: string | undefined,
  ) {
    const user = await this.getUserFromAuth(authHeader);
    await this.getPlanForUser(planId, user.id);

    const entries = await this.db
      .select({
        entry: schema.mealPlanEntries,
        recipe: schema.recipes,
      })
      .from(schema.mealPlanEntries)
      .innerJoin(
        schema.recipes,
        eq(schema.recipes.id, schema.mealPlanEntries.recipeId),
      )
      .where(eq(schema.mealPlanEntries.planId, planId))
      .orderBy(
        asc(schema.mealPlanEntries.day),
        asc(schema.mealPlanEntries.sortOrder),
      );

    if (entries.length === 0) {
      return { addedCount: 0, items: [] };
    }

    const pantryItems = await this.db
      .select()
      .from(schema.pantryItems)
      .where(
        and(
          eq(schema.pantryItems.userId, user.id),
          eq(schema.pantryItems.isFinished, false),
        ),
      );

    const pantryNames = new Set(
      pantryItems
        .map((item) => item.name.trim().toLowerCase())
        .filter((name) => name.length > 0),
    );

    const missing: { name: string; quantity: string | null }[] = [];

    for (const row of entries) {
      const ingredients = row.recipe.ingredients || [];
      for (const ingredient of ingredients) {
        const normalizedName = ingredient.name?.trim().toLowerCase();
        if (!normalizedName) {
          continue;
        }
        if (pantryNames.has(normalizedName)) {
          continue;
        }

        missing.push({
          name: ingredient.name.trim(),
          quantity: this.formatIngredientQuantity(ingredient),
        });
      }
    }

    const created: (typeof schema.shoppingListItems.$inferSelect)[] = [];
    for (const ingredient of missing) {
      const item = await this.shoppingListService.create(authHeader, {
        name: ingredient.name,
        quantity: ingredient.quantity ?? undefined,
      });
      created.push(item);
    }
    return { addedCount: created.length, items: created };
  }

  private async getEntries(planId: string) {
    return this.db
      .select()
      .from(schema.mealPlanEntries)
      .where(eq(schema.mealPlanEntries.planId, planId))
      .orderBy(
        asc(schema.mealPlanEntries.day),
        asc(schema.mealPlanEntries.sortOrder),
      );
  }

  private async getPlanForUser(
    id: string,
    userId: number,
  ): Promise<MealPlanRow> {
    const [plan] = await this.db
      .select()
      .from(schema.mealPlans)
      .where(
        and(eq(schema.mealPlans.id, id), eq(schema.mealPlans.userId, userId)),
      );

    if (!plan) {
      throw new NotFoundException('Meal plan not found');
    }

    return plan;
  }

  private normalizeRange(start?: string, end?: string) {
    const startDate = this.parseDate(start, 'start');
    const endDate = this.parseDate(end, 'end');

    const startValue = this.toUtcDate(startDate);
    const endValue = this.toUtcDate(endDate);

    if (startValue.getTime() > endValue.getTime()) {
      throw new BadRequestException('start must be before or equal to end');
    }

    return { startDate, endDate };
  }

  private parseDate(value: string | undefined, field: string): string {
    if (!value) {
      throw new BadRequestException(`${field} date is required`);
    }

    const trimmed = value.trim();
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(trimmed)) {
      throw new BadRequestException(`${field} must be in YYYY-MM-DD format`);
    }

    const parsed = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} is not a valid date`);
    }

    return trimmed;
  }

  private assertWithinRange(day: string, start: string, end: string) {
    const value = this.toUtcDate(day).getTime();
    const min = this.toUtcDate(start).getTime();
    const max = this.toUtcDate(end).getTime();

    if (value < min || value > max) {
      throw new BadRequestException('Entry date is outside of the plan range');
    }
  }

  private toUtcDate(value: string) {
    return new Date(`${value}T00:00:00Z`);
  }

  private formatIngredientQuantity(ingredient: {
    quantity?: number;
    measureUnit?: string;
  }) {
    if (!ingredient.quantity && !ingredient.measureUnit) {
      return null;
    }

    if (ingredient.quantity && ingredient.measureUnit) {
      return `${ingredient.quantity} ${ingredient.measureUnit}`;
    }

    return ingredient.measureUnit || ingredient.quantity?.toString() || null;
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

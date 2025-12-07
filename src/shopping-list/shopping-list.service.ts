import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, schema } from '../db/db.module';
import type { DrizzleDb } from '../db/db.module';

export type CreateShoppingListItemInput = {
  name: string;
  quantity?: string | null;
  notes?: string | null;
  isPurchased?: boolean;
};

export type UpdateShoppingListItemInput = {
  name?: string;
  quantity?: string | null;
  notes?: string | null;
  isPurchased?: boolean;
};

@Injectable()
export class ShoppingListService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getAll(authHeader?: string) {
    const user = await this.getUserFromAuth(authHeader);

    return this.db
      .select()
      .from(schema.shoppingListItems)
      .where(eq(schema.shoppingListItems.userId, user.id))
      .orderBy(
        asc(schema.shoppingListItems.isPurchased),
        asc(schema.shoppingListItems.name),
      );
  }

  async create(
    authHeader: string | undefined,
    input: CreateShoppingListItemInput,
  ) {
    const user = await this.getUserFromAuth(authHeader);
    const trimmedName = input.name?.trim();

    if (!trimmedName) {
      throw new BadRequestException('name is required');
    }

    const existingItems = await this.db
      .select()
      .from(schema.shoppingListItems)
      .where(
        and(
          eq(schema.shoppingListItems.userId, user.id),
          eq(schema.shoppingListItems.isPurchased, false),
          sql`lower(${schema.shoppingListItems.name}) = lower(${trimmedName})`,
        ),
      );

    if (existingItems.length > 0) {
      const [primary, ...rest] = existingItems;
      const mergedExistingQuantities = rest.reduce(
        (acc, item) => this.mergeQuantities(acc, item.quantity),
        primary.quantity,
      );
      const mergedQuantity = this.mergeQuantities(
        mergedExistingQuantities,
        input.quantity,
      );

      if (rest.length > 0) {
        await this.db
          .delete(schema.shoppingListItems)
          .where(
            and(
              eq(schema.shoppingListItems.userId, user.id),
              eq(schema.shoppingListItems.isPurchased, false),
              sql`lower(${schema.shoppingListItems.name}) = lower(${trimmedName})`,
              sql`${schema.shoppingListItems.id} != ${primary.id}`,
            ),
          );
      }

      const [updated] = await this.db
        .update(schema.shoppingListItems)
        .set({
          name: trimmedName,
          quantity: mergedQuantity,
          notes:
            input.notes === undefined
              ? primary.notes
              : input.notes?.trim() || null,
          isPurchased: input.isPurchased ?? primary.isPurchased,
        })
        .where(eq(schema.shoppingListItems.id, primary.id))
        .returning();

      if (!primary.isPurchased && updated.isPurchased) {
        await this.addToPantry(user.id, updated.name, updated.quantity);
      }

      return updated;
    }

    const [created] = await this.db
      .insert(schema.shoppingListItems)
      .values({
        userId: user.id,
        name: trimmedName,
        quantity: input.quantity?.trim() || null,
        notes: input.notes?.trim() || null,
        isPurchased: input.isPurchased ?? false,
      })
      .returning();

    if (created.isPurchased) {
      await this.addToPantry(user.id, created.name, created.quantity);
    }

    return created;
  }

  async update(
    id: number,
    authHeader: string | undefined,
    input: UpdateShoppingListItemInput,
  ) {
    if (
      input.name === undefined &&
      input.quantity === undefined &&
      input.notes === undefined &&
      input.isPurchased === undefined
    ) {
      throw new BadRequestException('No fields provided to update');
    }

    const trimmedName = input.name?.trim();
    if (input.name !== undefined && !trimmedName) {
      throw new BadRequestException('name cannot be empty');
    }

    const user = await this.getUserFromAuth(authHeader);

    const [existing] = await this.db
      .select()
      .from(schema.shoppingListItems)
      .where(
        and(
          eq(schema.shoppingListItems.id, id),
          eq(schema.shoppingListItems.userId, user.id),
        ),
      );

    if (!existing) {
      throw new NotFoundException('Shopping list item not found');
    }

    const wasPurchased = existing.isPurchased;

    const [updated] = await this.db
      .update(schema.shoppingListItems)
      .set({
        name: trimmedName ?? existing.name,
        quantity:
          input.quantity === undefined
            ? existing.quantity
            : input.quantity?.trim() || null,
        notes:
          input.notes === undefined
            ? existing.notes
            : input.notes?.trim() || null,
        isPurchased:
          input.isPurchased === undefined
            ? existing.isPurchased
            : input.isPurchased,
      })
      .where(eq(schema.shoppingListItems.id, existing.id))
      .returning();

    if (!wasPurchased && updated.isPurchased) {
      await this.addToPantry(user.id, updated.name, updated.quantity);
    }

    return updated;
  }

  async deleteOne(id: number, authHeader: string | undefined) {
    const user = await this.getUserFromAuth(authHeader);

    const [existing] = await this.db
      .select()
      .from(schema.shoppingListItems)
      .where(
        and(
          eq(schema.shoppingListItems.id, id),
          eq(schema.shoppingListItems.userId, user.id),
        ),
      );

    if (!existing) {
      throw new NotFoundException('Shopping list item not found');
    }

    const [deleted] = await this.db
      .delete(schema.shoppingListItems)
      .where(eq(schema.shoppingListItems.id, existing.id))
      .returning();

    return deleted;
  }

  async deleteByStatus(
    authHeader: string | undefined,
    status?: 'purchased',
  ) {
    if (status !== 'purchased') {
      throw new BadRequestException('status must be purchased');
    }

    const user = await this.getUserFromAuth(authHeader);
    const deleted = await this.db
      .delete(schema.shoppingListItems)
      .where(
        and(
          eq(schema.shoppingListItems.userId, user.id),
          eq(schema.shoppingListItems.isPurchased, true),
        ),
      )
      .returning();

    return { deletedCount: deleted.length };
  }

  private async addToPantry(
    userId: number,
    name: string,
    quantity: string | null,
  ) {
    const trimmedName = name.trim();
    const trimmedQuantity = quantity?.trim() || null;

    const existingItems = await this.db
      .select()
      .from(schema.pantryItems)
      .where(
        and(
          eq(schema.pantryItems.userId, userId),
          sql`lower(${schema.pantryItems.name}) = lower(${trimmedName})`,
        ),
      );

    if (existingItems.length > 0) {
      const primary =
        existingItems.find((item) => item.isFinished === false) ||
        existingItems[0];
      const others = existingItems.filter((item) => item.id !== primary.id);

      const mergedExisting = existingItems.reduce(
        (acc, item) => this.mergeQuantities(acc, item.quantity),
        null as string | null,
      );
      const newQuantity = this.mergeQuantities(mergedExisting, trimmedQuantity);

      if (others.length > 0) {
        await this.db
          .delete(schema.pantryItems)
          .where(
            and(
              eq(schema.pantryItems.userId, userId),
              sql`lower(${schema.pantryItems.name}) = lower(${trimmedName})`,
              sql`${schema.pantryItems.id} != ${primary.id}`,
            ),
          );
      }

      await this.db
        .update(schema.pantryItems)
        .set({
          quantity: newQuantity,
          isFinished: false,
        })
        .where(eq(schema.pantryItems.id, primary.id));
      return;
    }

    await this.db.insert(schema.pantryItems).values({
      userId,
      name: trimmedName,
      quantity: trimmedQuantity,
      isFinished: false,
    });
  }

  private mergeQuantities(
    existingQuantity: string | null,
    incomingQuantity: string | null | undefined,
  ) {
    const trimmedExisting = existingQuantity?.trim() || null;
    const trimmedIncoming = incomingQuantity?.toString().trim() || null;

    if (!trimmedExisting) {
      return trimmedIncoming;
    }
    if (!trimmedIncoming) {
      return trimmedExisting;
    }

    const parseQuantity = (value: string) => {
      const match = value.match(/^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/);
      if (!match) {
        return { amount: NaN, unit: value.trim() };
      }
      return {
        amount: Number(match[1]),
        unit: match[2].trim(),
      };
    };

    const existing = parseQuantity(trimmedExisting);
    const incoming = parseQuantity(trimmedIncoming);

    const bothNumeric =
      Number.isFinite(existing.amount) && Number.isFinite(incoming.amount);
    const unitMatches =
      (existing.unit || '').toLowerCase() === (incoming.unit || '').toLowerCase();

    if (bothNumeric && unitMatches) {
      const total = existing.amount + incoming.amount;
      const unit = existing.unit || incoming.unit;
      return unit ? `${total} ${unit}` : `${total}`;
    }

    return trimmedIncoming;
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

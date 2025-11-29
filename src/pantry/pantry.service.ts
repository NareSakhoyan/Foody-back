import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DRIZZLE, schema } from '../db/db.module';
import type { DrizzleDb } from '../db/db.module';

export type UpsertPantryItemInput = {
  id?: number;
  name?: string;
  quantity?: string | null;
  isFinished?: boolean;
};

@Injectable()
export class PantryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getAll(authHeader?: string) {
    const user = await this.getUserFromAuth(authHeader);

    return this.db
      .select()
      .from(schema.pantryItems)
      .where(eq(schema.pantryItems.userId, user.id))
      .orderBy(
        asc(schema.pantryItems.isFinished),
        asc(schema.pantryItems.name),
      );
  }

  async upsert(authHeader: string | undefined, input: UpsertPantryItemInput) {
    const user = await this.getUserFromAuth(authHeader);
    const trimmedName = input.name?.trim();

    if (!input.id && !trimmedName) {
      throw new BadRequestException('name is required');
    }

    if (input.id) {
      const [existing] = await this.db
        .select()
        .from(schema.pantryItems)
        .where(
          and(
            eq(schema.pantryItems.id, input.id),
            eq(schema.pantryItems.userId, user.id),
          ),
        );

      if (!existing) {
        throw new NotFoundException('Pantry item not found');
      }

      const [updated] = await this.db
        .update(schema.pantryItems)
        .set({
          name: trimmedName ?? existing.name,
          quantity:
            input.quantity === undefined
              ? existing.quantity
              : input.quantity?.trim() || null,
          isFinished:
            input.isFinished === undefined
              ? existing.isFinished
              : input.isFinished,
        })
        .where(eq(schema.pantryItems.id, existing.id))
        .returning();

      return updated;
    }

    const [created] = await this.db
      .insert(schema.pantryItems)
      .values({
        userId: user.id,
        name: trimmedName!,
        quantity: input.quantity?.trim() || null,
        isFinished: input.isFinished ?? false,
      })
      .returning();

    return created;
  }

  async finishOrDelete(
    id: number,
    authHeader: string | undefined,
    hardDelete: boolean,
  ) {
    const user = await this.getUserFromAuth(authHeader);

    const [existing] = await this.db
      .select()
      .from(schema.pantryItems)
      .where(
        and(
          eq(schema.pantryItems.id, id),
          eq(schema.pantryItems.userId, user.id),
        ),
      );

    if (!existing) {
      throw new NotFoundException('Pantry item not found');
    }

    if (hardDelete) {
      const [deleted] = await this.db
        .delete(schema.pantryItems)
        .where(eq(schema.pantryItems.id, existing.id))
        .returning();
      return deleted;
    }

    const [finished] = await this.db
      .update(schema.pantryItems)
      .set({ isFinished: true })
      .where(eq(schema.pantryItems.id, existing.id))
      .returning();

    return finished;
  }

  async getActiveItemsForUser(userId: number) {
    return this.db
      .select()
      .from(schema.pantryItems)
      .where(
        and(
          eq(schema.pantryItems.userId, userId),
          eq(schema.pantryItems.isFinished, false),
        ),
      );
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

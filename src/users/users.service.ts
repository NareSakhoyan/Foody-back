import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from '../db/db.module';
import { schema } from '../db/db.module';
import type { DrizzleDb } from '../db/db.module';

export type CreateUserInput = {
  clerkId: string;
  email: string;
  name?: string | null;
  imageUrl?: string | null;
};

export type UpdateUserInput = {
  name?: string | null;
  imageUrl?: string | null;
};

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getMe(authHeader?: string) {
    const clerkId = this.parseClerkIdFromAuth(authHeader);

    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.clerkId, clerkId), eq(schema.users.isDeleted, false)));

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async createUser(input: CreateUserInput) {
    if (!input.clerkId || !input.email) {
      throw new BadRequestException('clerkId and email are required');
    }

    const [existing] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.clerkId, input.clerkId));

    if (existing && !existing.isDeleted) {
      return existing;
    }

    const [user] = await this.db
      .insert(schema.users)
      .values({
        clerkId: input.clerkId,
        email: input.email,
        name: input.name ?? null,
        imageUrl: input.imageUrl ?? null,
        isDeleted: false,
      })
      .returning();

    return user;
  }

  async updateUser(id: number, input: UpdateUserInput) {
    if (input.name === undefined && input.imageUrl === undefined) {
      throw new BadRequestException('No fields provided to update');
    }

    const [existing] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.isDeleted, false)));

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const [updated] = await this.db
      .update(schema.users)
      .set({
        name: input.name ?? existing.name,
        imageUrl: input.imageUrl ?? existing.imageUrl,
      })
      .where(eq(schema.users.id, id))
      .returning();

    return updated;
  }

  async softDeleteUser(id: number) {
    const [existing] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.isDeleted, false)));

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const [deleted] = await this.db
      .update(schema.users)
      .set({ isDeleted: true })
      .where(eq(schema.users.id, id))
      .returning();

    return deleted;
  }

  private parseClerkIdFromAuth(authHeader?: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) {
      throw new UnauthorizedException('Authorization header must be a Bearer token');
    }

    const token = match[1];
    const parts = token.split('.');
    if (parts.length < 2) {
      throw new UnauthorizedException('Invalid bearer token format');
    }

    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
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

# Foody Backend

Small NestJS + Drizzle API for recipes and users. This document lists the available endpoints and what each service function does at a high level.

## Auth

- Uses a bearer token (`Authorization: Bearer <jwt>`) whose payload includes `sub` as the Clerk user id.
- Many endpoints require auth. Public listing/viewing can omit the header.

## Recipe Model (core fields)

- `id` (uuid), `name`, `slug`, `shortDescription`, `imageUrl`
- `prepDescription`, `cookDescription`
- `prepTimeMinutes`, `cookTimeMinutes`, `servings`
- `ingredients` (array of `{ name, quantity, measureUnit, note? }`)
- `tags` (string array), `isPublic` (boolean), `status` (`draft | published | archived`)
- `authorId` (internal user id), `createdAt`, `updatedAt`
- `steps` is currently not collected; it is stored as `null`.
- Responses from list endpoints include `author: { id, name, imageUrl }`.
- Favorites: users can mark recipes as favorites; stored in `recipe_favorites` (unique per user/recipe).
- Tags are stored both on the recipe row and in separate `tags` / `recipe_tags` tables; recipe creation upserts tags and links them.

## Recipes Endpoints

- `GET /recipes` — Public list of recipes. If the auth header is provided, also includes the caller’s private recipes. Sorted by `updatedAt` desc. Returns author info with each recipe. Query: `page`, `pageSize`, `q` (search name/shortDescription), `tag`, `status`, `authorId`.
- `GET /recipes/mine` — Auth required. Lists only the caller’s recipes, sorted by `updatedAt` desc, with author info. Query: `page`, `pageSize`, `q`, `tag`, `status`.
- `GET /recipes/favorites` — Auth required. Lists the caller’s favorited recipes, sorted by `updatedAt`. Query: `page`, `pageSize`, `q`, `tag`, `status`.
- `GET /recipes/:id` — Public if the recipe is `isPublic`; otherwise requires the author. Returns the recipe.
- `POST /recipes/:id/favorite` — Auth required. Adds the recipe to the caller’s favorites (no-op if already favorited).
- `POST /recipes` — Auth required. Creates a recipe. Required body: `name`, `slug`, `ingredients`. Optional: `shortDescription`, `imageUrl`, `prepDescription`, `cookDescription`, `prepTimeMinutes`, `cookTimeMinutes`, `servings`, `tags`, `isPublic`, `status`.
- `PATCH /recipes/:id` — Auth required. Only the author can update. Body may include any mutable fields above (except `ingredients`/`slug` are optional here).
- `DELETE /recipes/:id/favorite` — Auth required. Removes the recipe from favorites.
- `DELETE /recipes/:id` — Auth required. Only the author can delete.

## Users Endpoints (brief)

- `GET /users/me` — Auth required. Returns the current user.
- `POST /users` — Upserts a user from Clerk data (`clerkId`, `email`, optional `name`, `imageUrl`).
- `PATCH /users/:id` — Updates `name`/`imageUrl`.
- `DELETE /users/:id` — Soft deletes the user.

## Tags Endpoints

- `GET /tags` — Public. Returns all tags (sorted by name).

## Service Function Notes

- `getAll` (recipes.service) — Builds visibility based on auth, joins author, supports pagination/search/tag/status filters, orders by `updatedAt`.
- `getMine` — Filters by caller’s `authorId`, supports pagination/search/tag/status, returns author info, sorted by `updatedAt`.
- `getFavorites` — Returns the caller’s favorites with author info, supports pagination/search/tag/status, sorted by `updatedAt`.
- `TagsService.getAll` — Returns all tags sorted by name.
- `addFavorite` / `removeFavorite` — Add/remove a recipe to/from the caller’s favorites. Requires auth.
- `getOne` — Permits public access when `isPublic`; otherwise enforces author ownership.
- `create` — Validates `name`, `slug`, `ingredients`; rejects duplicate slugs; stores `steps` as `null`.
- `update` — Prevents empty payloads and duplicate slug collisions; enforces author ownership.
- `delete` — Enforces author ownership before removal.
- User service functions mirror the HTTP endpoints and validate presence/format of auth tokens.

## Development

```bash
npm install
npm run start:dev
npm run build
npm run test
```

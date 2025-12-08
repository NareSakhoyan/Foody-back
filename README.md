# Foody Backend

Small NestJS + Drizzle API for recipes and users. This document lists the available endpoints and what each service function does at a high level.

## Root

- `GET /` — Public. Returns a simple hello string.

## Auth

- Uses a bearer token (`Authorization: Bearer <jwt>`) whose payload includes `sub` as the Clerk user id.
- Many endpoints require auth. Public listing/viewing can omit the header.

## Recipe Model (core fields)

- `id` (uuid), `name`, `slug`, `shortDescription`, `imageUrl`
- `prepDescription`, `cookDescription`
- `prepTimeMinutes`, `cookTimeMinutes`, `servings`
- `ingredients` (array of `{ name, quantity, measureUnit, note? }`), `spices` (string array)
- `tags` (string array), `isPublic` (boolean), `status` (`draft | published | archived`)
- `authorId` (internal user id), `createdAt`, `updatedAt`
- Responses from list endpoints include `author: { id, name, imageUrl }`.
- Favorites: users can mark recipes as favorites; stored in `recipe_favorites` (unique per user/recipe).
- Tags are stored both on the recipe row and in separate `tags` / `recipe_tags` tables; recipe creation upserts tags and links them.

## Recipes Endpoints

- `GET /recipes` — Public list of recipes. If the auth header is provided, also includes the caller’s private recipes. Sorted by `updatedAt` desc. Returns author info with each recipe. Query: `page`, `pageSize`, `q` (search name/shortDescription), `tag`, `status`, `authorId`.
- `GET /recipes/mine` — Auth required. Lists only the caller’s recipes, sorted by `updatedAt` desc, with author info. Query: `page`, `pageSize`, `q`, `tag`, `status`.
- `GET /recipes/favorites` — Auth required. Lists the caller’s favorited recipes, sorted by `updatedAt`. Query: `page`, `pageSize`, `q`, `tag`, `status`.
- `GET /recipes/recommendations` — Auth required. Uses the caller’s pantry items to recommend recipes with ingredient matches. Query: `limit`, `q`, `tag`, `status`.
- `GET /recipes/:id` — Public if the recipe is `isPublic`; otherwise requires the author. Returns the recipe.
- `POST /recipes/:id/favorite` — Auth required. Adds the recipe to the caller’s favorites (no-op if already favorited).
- `POST /recipes` — Auth required. Creates a recipe. Required body: `name`, `slug`, `ingredients`. Optional: `shortDescription`, `imageUrl`, `prepDescription`, `cookDescription`, `prepTimeMinutes`, `cookTimeMinutes`, `servings`, `tags`, `isPublic`, `status`.
- `PATCH /recipes/:id` — Auth required. Only the author can update. Body may include any mutable fields above (except `ingredients`/`slug` are optional here).
- `DELETE /recipes/:id/favorite` — Auth required. Removes the recipe from favorites.
- `DELETE /recipes/:id` — Auth required. Only the author can delete.

## Users Endpoints (brief)

- `GET /me` — Auth required. Returns the current user.
- `POST /users` — Upserts a user from Clerk data (`clerkId`, `email`, optional `name`, `imageUrl`).
- `PATCH /users/:id` — Updates `name`/`imageUrl`.
- `DELETE /users/:id` — Soft deletes the user.

## Tags Endpoints

- `GET /tags` — Public. Returns all tags (sorted by name).

## Pantry Endpoints

- `GET /pantry` — Auth required. Lists pantry items for the caller (finished items are included with `isFinished` flag).
- `POST /pantry` — Auth required. Create or update an item. Body: `name` (required on create), optional `quantity`, `isFinished`, `id` to update.
- `DELETE /pantry/items` — Auth required. Bulk delete by status. Query: `status=active|finished` (required). Returns `{ deletedCount }`.
- `DELETE /pantry/:id` — Auth required. Marks the item as finished; pass `?hard=true` to delete.

## Shopping List Endpoints

- `GET /shopping-list` — Auth required. Lists the caller’s shopping list items, ordered with unpurchased items first.
- `POST /shopping-list` — Auth required. Creates an item; body: `name` (required), optional `quantity`, `notes`, `isPurchased`. Automatically merges with an existing active item of the same name; if created as purchased, it is also added to the pantry (merging quantities).
- `PATCH /shopping-list/:id` — Auth required. Updates an item; body may include `name`, `quantity`, `notes`, `isPurchased` (payload cannot be empty). Marking `isPurchased=true` also adds it to the pantry.
- `DELETE /shopping-list/items` — Auth required. Deletes purchased items. Query: `status=purchased` (required). Returns `{ deletedCount }`.
- `DELETE /shopping-list/:id` — Auth required. Deletes a single shopping list item for the caller.

## Meal Plans Endpoints

- `GET /meal-plans/current?start=YYYY-MM-DD&end=YYYY-MM-DD` — Auth required. Returns the plan for the requested range plus its entries; if none exists, returns an empty plan stub with that range.
- `POST /meal-plans` — Auth required. Creates a plan. Body: `startDate`, `endDate`, optional `title`.
- `PUT /meal-plans/:id` — Auth required. Updates plan metadata (`title`, `startDate`, `endDate`) for the caller.
- `PUT /meal-plans/:id/entries` — Auth required. Replaces the plan’s entries with the provided list (entries can include `id`, `day`, `recipeId`, optional `mealType`, `notes`, `sortOrder`).
- `DELETE /meal-plans/:id/entries/:entryId` — Auth required. Removes a single entry from the plan.
- `POST /meal-plans/:id/add-missing-to-shopping-list` — Auth required. Looks at recipes in the plan, compares ingredients to the caller’s pantry, and upserts missing ones into the shopping list.

## Service Function Notes

- `getAll` (recipes.service) — Builds visibility based on auth, joins author, supports pagination/search/tag/status filters, orders by `updatedAt`.
- `getMine` — Filters by caller’s `authorId`, supports pagination/search/tag/status, returns author info, sorted by `updatedAt`.
- `getFavorites` — Returns the caller’s favorites with author info, supports pagination/search/tag/status, sorted by `updatedAt`.
- `getRecommendations` — Uses pantry items to score recipes by ingredient overlap (substring + fuzzy `pg_trgm`), sorted by match ratio and count.
- `TagsService.getAll` — Returns all tags sorted by name.
- `PantryService` — Parses auth, lists/creates/updates pantry items, supports bulk deletion by status, and finishes items by merging into existing finished entries unless `hard=true` deletes.
- `ShoppingListService` — Parses auth, merges duplicate items (case-insensitive) and quantities, updates/deletes items, and when items are marked purchased they are added to the pantry with quantity merging.
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

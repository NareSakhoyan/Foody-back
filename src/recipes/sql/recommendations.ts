import { sql, type SQL } from 'drizzle-orm';
import { schema } from '../../db/db.module';

export type RecommendationQueryParams = {
  userId: number;
  limit: number;
  offset: number;
  whereClause: SQL;
  scoreFilters?: SQL[];
};

export const buildRecommendationScoreQuery = ({
  userId,
  limit,
  offset,
  whereClause,
  scoreFilters,
}: RecommendationQueryParams) => sql`
  with pantry as (
    select distinct lower(trim(name)) as token
    from ${schema.pantryItems}
    where ${schema.pantryItems.userId} = ${userId}
      and ${schema.pantryItems.isFinished} = false
      and ${schema.pantryItems.name} is not null
  ),
  visible as (
    select ${schema.recipes.id} as id, ${schema.recipes.ingredients} as ingredients
    from ${schema.recipes}
    inner join ${schema.users}
      on ${schema.users.id} = ${schema.recipes.authorId}
    ${whereClause}
  ),
  recipe_ing as (
    select v.id, jsonb_array_elements(v.ingredients) ->> 'name' as ing
    from visible v
  ),
  scored as (
    select
      ri.id,
      count(*) as total_ingredients,
      count(*) filter (
        where exists (
          select 1
          from pantry p
          where ri.ing ilike '%' || p.token || '%'
             or p.token ilike '%' || ri.ing || '%'
             or similarity(ri.ing, p.token) >= 0.35
        )
      ) as match_count,
      array_agg(distinct ri.ing) filter (
        where exists (
          select 1
          from pantry p
          where ri.ing ilike '%' || p.token || '%'
             or p.token ilike '%' || ri.ing || '%'
             or similarity(ri.ing, p.token) >= 0.35
        )
      ) as matched_ingredients,
      array_agg(distinct ri.ing) filter (
        where not exists (
          select 1
          from pantry p
          where ri.ing ilike '%' || p.token || '%'
             or p.token ilike '%' || ri.ing || '%'
             or similarity(ri.ing, p.token) >= 0.35
        )
      ) as missing_ingredients
    from recipe_ing ri
    group by ri.id
  )
  select
    s.id,
    s.match_count,
    s.total_ingredients,
    coalesce((s.match_count::numeric / nullif(s.total_ingredients, 0)), 0) as match_ratio,
    coalesce(s.matched_ingredients, '{}') as matched_ingredients,
    coalesce(s.missing_ingredients, '{}') as missing_ingredients,
    count(*) over() as total_count
  from scored s
  ${
    scoreFilters && scoreFilters.length > 0
      ? sql`where ${sql.join(scoreFilters, sql` and `)}`
      : sql``
  }
  order by match_ratio desc, s.match_count desc, s.total_ingredients asc, s.id
  limit ${limit}
  offset ${offset};
`;

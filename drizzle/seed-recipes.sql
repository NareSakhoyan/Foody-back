-- Seed user and recipes. Safe to re-run; uses ON CONFLICT DO NOTHING.
DO $$
DECLARE
  v_user_id integer;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE clerk_id = 'seed_clerk_001';

  IF v_user_id IS NULL THEN
    INSERT INTO users (clerk_id, email, name, image_url, is_deleted)
    VALUES (
      'seed_clerk_001',
      'seed@example.com',
      'Seed User',
      'https://placehold.co/128x128',
      false
    )
    RETURNING id INTO v_user_id;
  END IF;

  -- Seed tags with stable IDs (safe to re-run).
  INSERT INTO tags (id, name)
  VALUES
    (1, 'pasta'),
    (2, 'vegetarian'),
    (3, 'weeknight'),
    (4, 'sheet-pan'),
    (5, 'chicken'),
    (6, 'meal-prep'),
    (7, 'gluten-free'),
    (8, 'vegan'),
    (9, 'curry'),
    (10, 'one-pot'),
    (11, 'comfort'),
    (12, 'stovetop'),
    (13, 'beef'),
    (14, 'breakfast'),
    (15, 'no-cook'),
    (16, 'seafood'),
    (17, 'grill'),
    (18, 'fast'),
    (19, 'stir-fry'),
    (20, 'noodles'),
    (21, 'sweet')
  ON CONFLICT DO NOTHING;

  INSERT INTO recipes (
    id,
    author_id,
    name,
    slug,
    short_description,
    image_url,
    prep_description,
    cook_description,
    prep_time_minutes,
    cook_time_minutes,
    servings,
    ingredients,
    tags,
    is_public,
    status
  )
  VALUES
    (
      '7c3f43b0-0d1e-4b30-9d0b-1b63dc67d9b0',
      v_user_id,
      'Weeknight Marinara Pasta',
      'weeknight-marinara-pasta',
      'A quick tomato pasta with garlic and basil.',
      'https://placehold.co/640x360',
      'Chop garlic and onions. Measure ingredients. Roughly tear basil.',
      'Simmer tomatoes with aromatics, finish with butter and basil.',
      10,
      20,
      4,
      '[{"name":"spaghetti","quantity":400,"measureUnit":"g"},{"name":"canned tomatoes","quantity":800,"measureUnit":"g","note":"crushed"},{"name":"garlic","quantity":4,"measureUnit":"cloves","note":"minced"},{"name":"onion","quantity":1,"measureUnit":"piece","note":"small, diced"},{"name":"olive oil","quantity":2,"measureUnit":"tbsp"},{"name":"butter","quantity":1,"measureUnit":"tbsp"},{"name":"basil","quantity":0.5,"measureUnit":"cup","note":"torn"},{"name":"salt","quantity":1,"measureUnit":"tsp"},{"name":"black pepper","quantity":0.5,"measureUnit":"tsp"}]'::jsonb,
      '[1,2,3]'::jsonb,
      true,
      'published'
    ),
    (
      '2a4f3d1c-2e6d-4ef2-8f35-4d8ef1399f8c',
      v_user_id,
      'Sheet Pan Lemon Herb Chicken',
      'sheet-pan-lemon-herb-chicken',
      'One-pan roasted chicken thighs with potatoes and green beans.',
      'https://placehold.co/640x360',
      'Trim green beans; cut potatoes into 1-inch pieces; pat chicken dry.',
      'Roast chicken and potatoes, add green beans for final minutes.',
      15,
      35,
      4,
      '[{"name":"chicken thighs","quantity":4,"measureUnit":"piece","note":"bone-in, skin-on"},{"name":"baby potatoes","quantity":600,"measureUnit":"g","note":"halved"},{"name":"green beans","quantity":300,"measureUnit":"g","note":"trimmed"},{"name":"lemon","quantity":1,"measureUnit":"piece","note":"zested and juiced"},{"name":"garlic","quantity":3,"measureUnit":"cloves","note":"minced"},{"name":"olive oil","quantity":3,"measureUnit":"tbsp"},{"name":"dried oregano","quantity":1,"measureUnit":"tsp"},{"name":"salt","quantity":1,"measureUnit":"tsp"},{"name":"black pepper","quantity":0.5,"measureUnit":"tsp"}]'::jsonb,
      '[4,5,3]'::jsonb,
      true,
      'published'
    ),
    (
      '0d6e4fba-7abf-4a4f-bb47-5c48203eae1c',
      v_user_id,
      'Roasted Veggie Quinoa Bowl',
      'roasted-veggie-quinoa-bowl',
      'Roasted vegetables over fluffy quinoa with tahini drizzle.',
      'https://placehold.co/640x360',
      'Dice vegetables; rinse quinoa; preheat oven to 400F.',
      'Roast veggies until caramelized; simmer quinoa until fluffy.',
      15,
      25,
      4,
      '[{"name":"quinoa","quantity":1,"measureUnit":"cup","note":"rinsed"},{"name":"sweet potato","quantity":1,"measureUnit":"piece","note":"diced"},{"name":"zucchini","quantity":1,"measureUnit":"piece","note":"sliced"},{"name":"bell pepper","quantity":1,"measureUnit":"piece","note":"chopped"},{"name":"red onion","quantity":0.5,"measureUnit":"piece","note":"wedges"},{"name":"olive oil","quantity":2,"measureUnit":"tbsp"},{"name":"tahini","quantity":2,"measureUnit":"tbsp"},{"name":"lemon juice","quantity":1,"measureUnit":"tbsp"},{"name":"salt","quantity":1,"measureUnit":"tsp"}]'::jsonb,
      '[2,6,7]'::jsonb,
      true,
      'published'
    ),
    (
      '3fb4983b-d78d-4ad6-8c1d-0b51f2f346a2',
      v_user_id,
      'Coconut Chickpea Curry',
      'coconut-chickpea-curry',
      'Creamy coconut curry with chickpeas and spinach.',
      'https://placehold.co/640x360',
      'Mince aromatics; rinse chickpeas; chop spinach.',
      'Saute aromatics, simmer with coconut milk and spices, finish with spinach.',
      15,
      25,
      4,
      '[{"name":"chickpeas","quantity":2,"measureUnit":"can","note":"drained"},{"name":"coconut milk","quantity":1,"measureUnit":"can"},{"name":"diced tomatoes","quantity":1,"measureUnit":"can"},{"name":"spinach","quantity":4,"measureUnit":"cup"},{"name":"onion","quantity":1,"measureUnit":"piece","note":"diced"},{"name":"garlic","quantity":3,"measureUnit":"cloves","note":"minced"},{"name":"ginger","quantity":1,"measureUnit":"tbsp","note":"grated"},{"name":"red curry paste","quantity":2,"measureUnit":"tbsp"},{"name":"lime juice","quantity":1,"measureUnit":"tbsp"},{"name":"salt","quantity":1,"measureUnit":"tsp"}]'::jsonb,
      '[8,9,10]'::jsonb,
      true,
      'published'
    ),
    (
      '1c7f3d2a-3fa2-4ab4-9a1a-f6a2c8b3572a',
      v_user_id,
      'Classic Beef Chili',
      'classic-beef-chili',
      'Hearty chili with beans, beef, and smoky spices.',
      'https://placehold.co/640x360',
      'Dice aromatics; brown beef; open canned goods.',
      'Brown beef, build flavor with spices, simmer with beans and tomatoes.',
      15,
      45,
      6,
      '[{"name":"ground beef","quantity":500,"measureUnit":"g"},{"name":"kidney beans","quantity":2,"measureUnit":"can","note":"drained"},{"name":"diced tomatoes","quantity":1,"measureUnit":"can"},{"name":"tomato paste","quantity":2,"measureUnit":"tbsp"},{"name":"onion","quantity":1,"measureUnit":"piece","note":"diced"},{"name":"garlic","quantity":3,"measureUnit":"cloves","note":"minced"},{"name":"chili powder","quantity":2,"measureUnit":"tbsp"},{"name":"cumin","quantity":2,"measureUnit":"tsp"},{"name":"smoked paprika","quantity":1,"measureUnit":"tsp"},{"name":"beef broth","quantity":1,"measureUnit":"cup"},{"name":"salt","quantity":1,"measureUnit":"tsp"}]'::jsonb,
      '[11,12,13]'::jsonb,
      true,
      'published'
    ),
    (
      '5e7b2d01-2fa7-4f1c-8b51-ec3adcd67c3b',
      v_user_id,
      'Overnight Oats with Berries',
      'overnight-oats-with-berries',
      'Creamy overnight oats topped with mixed berries and nuts.',
      'https://placehold.co/640x360',
      'Stir oats with milk and chia; chill overnight.',
      'Serve cold with toppings; adjust sweetness to taste.',
      5,
      0,
      2,
      '[{"name":"rolled oats","quantity":1,"measureUnit":"cup"},{"name":"milk","quantity":1,"measureUnit":"cup"},{"name":"yogurt","quantity":0.5,"measureUnit":"cup"},{"name":"chia seeds","quantity":1,"measureUnit":"tbsp"},{"name":"honey","quantity":1,"measureUnit":"tbsp"},{"name":"mixed berries","quantity":1,"measureUnit":"cup"},{"name":"almonds","quantity":0.25,"measureUnit":"cup","note":"chopped"},{"name":"salt","quantity":0.25,"measureUnit":"tsp"}]'::jsonb,
      '[14,15,6]'::jsonb,
      true,
      'published'
    ),
    (
      '8be7dc3f-2f94-4b3d-9c32-3d5f8bca6fa9',
      v_user_id,
      'Smoky Grilled Salmon',
      'smoky-grilled-salmon',
      'Grilled salmon fillets with smoky paprika and lemon.',
      'https://placehold.co/640x360',
      'Pat salmon dry; preheat grill; mix rub.',
      'Grill salmon skin-side down, finish with lemon squeeze.',
      10,
      12,
      4,
      '[{"name":"salmon fillets","quantity":4,"measureUnit":"piece"},{"name":"olive oil","quantity":1,"measureUnit":"tbsp"},{"name":"smoked paprika","quantity":1,"measureUnit":"tsp"},{"name":"garlic powder","quantity":0.5,"measureUnit":"tsp"},{"name":"lemon","quantity":1,"measureUnit":"piece"},{"name":"salt","quantity":1,"measureUnit":"tsp"},{"name":"black pepper","quantity":0.5,"measureUnit":"tsp"}]'::jsonb,
      '[16,17,7]'::jsonb,
      true,
      'published'
    ),
    (
      '4b0d9cf4-8b20-44ad-a2bb-406f0d1ef8c1',
      v_user_id,
      'Veggie Fried Rice',
      'veggie-fried-rice',
      'Quick fried rice with veggies and scrambled egg.',
      'https://placehold.co/640x360',
      'Use cold cooked rice; dice veggies; beat eggs.',
      'Stir-fry veggies, scramble eggs, toss with rice and soy sauce.',
      10,
      10,
      4,
      '[{"name":"cooked rice","quantity":4,"measureUnit":"cup","note":"cold"},{"name":"carrot","quantity":1,"measureUnit":"piece","note":"diced"},{"name":"peas","quantity":0.75,"measureUnit":"cup"},{"name":"scallions","quantity":3,"measureUnit":"piece","note":"sliced"},{"name":"eggs","quantity":2,"measureUnit":"piece","note":"beaten"},{"name":"soy sauce","quantity":2,"measureUnit":"tbsp"},{"name":"sesame oil","quantity":1,"measureUnit":"tsp"},{"name":"salt","quantity":0.5,"measureUnit":"tsp"}]'::jsonb,
      '[18,19,2]'::jsonb,
      true,
      'published'
    ),
    (
      '6d2c84fb-9690-4e04-9f39-a7f5cce203c0',
      v_user_id,
      'Miso Ginger Tofu Noodles',
      'miso-ginger-tofu-noodles',
      'Savory miso-ginger sauce over pan-crisped tofu and noodles.',
      'https://placehold.co/640x360',
      'Press tofu; mince aromatics; boil noodles.',
      'Crisp tofu, build sauce with miso and ginger, toss with noodles.',
      15,
      15,
      4,
      '[{"name":"firm tofu","quantity":400,"measureUnit":"g","note":"pressed and cubed"},{"name":"noodles","quantity":300,"measureUnit":"g","note":"udon or rice noodles"},{"name":"miso paste","quantity":1.5,"measureUnit":"tbsp"},{"name":"soy sauce","quantity":2,"measureUnit":"tbsp"},{"name":"rice vinegar","quantity":1,"measureUnit":"tbsp"},{"name":"garlic","quantity":2,"measureUnit":"cloves","note":"minced"},{"name":"ginger","quantity":1,"measureUnit":"tbsp","note":"minced"},{"name":"sesame oil","quantity":1,"measureUnit":"tsp"},{"name":"sesame seeds","quantity":1,"measureUnit":"tbsp"}]'::jsonb,
      '[8,20,3]'::jsonb,
      true,
      'published'
    ),
    (
      '9f3f2c6e-8961-4b7b-b2dd-28b4df0f1d52',
      v_user_id,
      'Blueberry Buttermilk Pancakes',
      'blueberry-buttermilk-pancakes',
      'Fluffy pancakes studded with blueberries.',
      'https://placehold.co/640x360',
      'Whisk dry and wet ingredients separately; fold together.',
      'Cook on greased griddle until bubbles form; flip once.',
      10,
      10,
      4,
      '[{"name":"flour","quantity":1.5,"measureUnit":"cup"},{"name":"buttermilk","quantity":1.25,"measureUnit":"cup"},{"name":"egg","quantity":1,"measureUnit":"piece"},{"name":"butter","quantity":2,"measureUnit":"tbsp","note":"melted"},{"name":"sugar","quantity":2,"measureUnit":"tbsp"},{"name":"baking powder","quantity":1.5,"measureUnit":"tsp"},{"name":"baking soda","quantity":0.5,"measureUnit":"tsp"},{"name":"salt","quantity":0.5,"measureUnit":"tsp"},{"name":"blueberries","quantity":1,"measureUnit":"cup"}]'::jsonb,
      '[14,21,2]'::jsonb,
      true,
      'published'
    )
  ON CONFLICT DO NOTHING;

  -- Seed recipe_tags junction from numeric tag IDs; safe to re-run.
  INSERT INTO recipe_tags (recipe_id, tag_id)
  SELECT r.id, (t.value)::int
  FROM recipes r
  CROSS JOIN LATERAL jsonb_array_elements(r.tags) AS t(value)
  ON CONFLICT DO NOTHING;
END
$$;

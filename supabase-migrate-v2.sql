-- ================================================================
-- Meal Planner — Migration v1 → v2 (fixed)
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- 1. Add household_id to profiles
alter table public.profiles add column if not exists household_id uuid;

-- 2. Create households table
create table if not exists public.households (
  id           uuid default uuid_generate_v4() primary key,
  name         text not null,
  invite_code  text not null unique,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now()
);
alter table public.households enable row level security;

drop policy if exists "Members can read own household"           on public.households;
drop policy if exists "Authenticated users can create household" on public.households;
drop policy if exists "Creator can update household"             on public.households;
create policy "Members can read own household" on public.households for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.household_id = households.id));
create policy "Authenticated users can create household" on public.households for insert
  with check (auth.role() = 'authenticated');
create policy "Creator can update household" on public.households for update
  using (auth.uid() = created_by);

-- 3. Create canonical ingredients table
create table if not exists public.canonical_ingredients (
  id         uuid default uuid_generate_v4() primary key,
  name       text not null unique,
  category   text not null default 'Other',
  aliases    text[] default '{}',
  created_at timestamptz default now()
);
alter table public.canonical_ingredients enable row level security;

drop policy if exists "Authenticated users can read canonical ingredients"   on public.canonical_ingredients;
drop policy if exists "Authenticated users can insert canonical ingredients" on public.canonical_ingredients;
drop policy if exists "Authenticated users can update canonical ingredients" on public.canonical_ingredients;
create policy "Authenticated users can read canonical ingredients"   on public.canonical_ingredients for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert canonical ingredients" on public.canonical_ingredients for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update canonical ingredients" on public.canonical_ingredients for update using (auth.role() = 'authenticated');

-- 4. Add new columns to existing tables
alter table public.recipes     add column if not exists tags           text[] default '{}';
alter table public.ingredients add column if not exists canonical_name text;

-- 5. Create saved_recipes table
create table if not exists public.saved_recipes (
  id           uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households(id) on delete cascade not null,
  recipe_id    uuid references public.recipes(id) on delete cascade not null,
  saved_by     uuid references auth.users(id) on delete set null,
  saved_at     timestamptz default now(),
  unique (household_id, recipe_id)
);
alter table public.saved_recipes enable row level security;

drop policy if exists "Household members can manage saved recipes" on public.saved_recipes;
create policy "Household members can manage saved recipes" on public.saved_recipes
  for all using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.household_id = saved_recipes.household_id)
  );

-- 6. Add household_id and misc_items to meal_plans
alter table public.meal_plans add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.meal_plans add column if not exists misc_items   text[] default '{}';

-- 7. Add slot_order to meal_plan_slots
alter table public.meal_plan_slots add column if not exists slot_order int not null default 0;

-- 8. Update meal_plan_slots RLS
drop policy if exists "Users can manage own slots"      on public.meal_plan_slots;
drop policy if exists "Household members can manage slots" on public.meal_plan_slots;
create policy "Household members can manage slots" on public.meal_plan_slots
  for all using (
    exists (
      select 1 from public.meal_plans mp
      join public.profiles p on p.household_id = mp.household_id
      where mp.id = meal_plan_slots.plan_id and p.id = auth.uid()
    )
  );

-- 9. Update profiles RLS
drop policy if exists "Users can read own profile"  on public.profiles;
drop policy if exists "Users can read all profiles" on public.profiles;
create policy "Users can read all profiles" on public.profiles
  for select using (auth.role() = 'authenticated');

-- 10. Seed canonical ingredients
insert into public.canonical_ingredients (name, category, aliases) values
  ('Chicken Breast',        'Meat',        '{"chicken breasts","boneless chicken breast","chicken breast cutlet","chicken breast chopped","sous vide chopped chicken"}'),
  ('Chicken Thighs',        'Meat',        '{"chicken thigh","chicken thighs diced","boneless thighs"}'),
  ('Ground Beef',           'Meat',        '{"ground beef 80/20","ground beef 90/10","lean ground beef"}'),
  ('Ground Turkey',         'Meat',        '{"ground turkey breast","lean ground turkey"}'),
  ('Ground Chicken',        'Meat',        '{"ground chicken breast"}'),
  ('Sirloin Steak',         'Meat',        '{"sirloin","steak","beef steak"}'),
  ('Salmon',                'Meat',        '{"salmon fillet","salmon filet","fresh salmon"}'),
  ('Chorizo',               'Meat',        '{"chorizo sausage"}'),
  ('Bacon',                 'Meat',        '{"bacon strips","bacon slices"}'),
  ('Italian Pork Sausage',  'Meat',        '{"pork sausage","italian sausage"}'),
  ('Ground Pork',           'Meat',        '{"pork mince"}'),
  ('Jasmine Rice',          'Dry',         '{"jasmine rice uncooked","white jasmine rice"}'),
  ('Basmati Rice',          'Dry',         '{"basmati","long grain rice"}'),
  ('Spaghetti',             'Dry',         '{"spaghetti pasta","thin spaghetti"}'),
  ('Olive Oil',             'Dry',         '{"extra virgin olive oil","evoo","olive oil spray"}'),
  ('Panko Breadcrumbs',     'Dry',         '{"panko","breadcrumbs","panko crumbs"}'),
  ('Chicken Broth',         'Dry',         '{"chicken stock","chicken broth low sodium"}'),
  ('Garlic',                'Produce',     '{"garlic cloves","fresh garlic","minced garlic","garlic clove"}'),
  ('Yellow Onion',          'Produce',     '{"onion","white onion","brown onion","medium onion"}'),
  ('Red Onion',             'Produce',     '{"red onions"}'),
  ('Lemon',                 'Produce',     '{"fresh lemon","lemons"}'),
  ('Lime',                  'Produce',     '{"fresh lime","limes"}'),
  ('Red Bell Pepper',       'Produce',     '{"red pepper","bell pepper red","red capsicum"}'),
  ('Green Bell Pepper',     'Produce',     '{"green pepper","bell pepper green"}'),
  ('Broccoli Florets',      'Produce',     '{"broccoli","fresh broccoli","broccoli crown"}'),
  ('Zucchini',              'Produce',     '{"zucchini squash","courgette"}'),
  ('Tomato',                'Produce',     '{"tomatoes","fresh tomato","roma tomato"}'),
  ('Spinach',               'Produce',     '{"fresh spinach","baby spinach","spinach leaves"}'),
  ('Cilantro',              'Produce',     '{"fresh cilantro","coriander leaves","cilantro leaves"}'),
  ('Green Onion',           'Produce',     '{"scallions","spring onions","green onions"}'),
  ('Avocado',               'Produce',     '{"fresh avocado","ripe avocado"}'),
  ('Cucumber',              'Produce',     '{"fresh cucumber","english cucumber"}'),
  ('Ginger',                'Produce',     '{"fresh ginger","ginger root","minced ginger"}'),
  ('Button Mushrooms',      'Produce',     '{"mushrooms","fresh mushrooms","cremini mushrooms"}'),
  ('Golden Potatoes',       'Produce',     '{"potatoes","yellow potatoes","baby potatoes"}'),
  ('Sweet Potato',          'Produce',     '{"sweet potatoes","yam"}'),
  ('Coconut Milk',          'Can',         '{"coconut milk can","full fat coconut milk"}'),
  ('Black Beans',           'Can',         '{"canned black beans","black beans canned"}'),
  ('Diced Tomatoes',        'Can',         '{"canned diced tomatoes","diced tomato","fire roasted diced tomatoes"}'),
  ('Light Sour Cream',      'Dairy',       '{"sour cream","reduced fat sour cream"}'),
  ('Heavy Cream',           'Dairy',       '{"heavy whipping cream","double cream","whipping cream"}'),
  ('Butter',                'Dairy',       '{"unsalted butter","salted butter"}'),
  ('Parmesan Cheese',       'Dairy',       '{"parmesean cheese","parmesan","grated parmesan","parmigiano"}'),
  ('Feta Cheese',           'Dairy',       '{"crumbled feta","feta"}'),
  ('Shredded Cheddar',      'Dairy',       '{"cheddar cheese","shredded cheddar cheese","cheddar"}'),
  ('Mexican Cheese Blend',  'Dairy',       '{"mexican cheese","shredded mexican cheese"}'),
  ('Plain Greek Yogurt',    'Dairy',       '{"plain nonfat yogurt","greek yogurt","nonfat yogurt","plain yogurt"}'),
  ('Large Eggs',            'Refrigerated','{"eggs","large egg","egg"}'),
  ('Soy Sauce',             'Condiments',  '{"low sodium soy sauce","light soy sauce","tamari"}'),
  ('Sriracha',              'Condiments',  '{"sriracha sauce","hot sauce sriracha"}'),
  ('Honey',                 'Condiments',  '{"pure honey","raw honey"}'),
  ('Sesame Oil',            'Condiments',  '{"toasted sesame oil"}'),
  ('Hoisin Sauce',          'Condiments',  '{"hoisin"}'),
  ('Sweet Thai Chili Sauce','Condiments',  '{"thai sweet chili sauce","sweet chili sauce"}'),
  ('Maple Syrup',           'Condiments',  '{"pure maple syrup"}'),
  ('Dijon Mustard',         'Condiments',  '{"dijon","whole grain mustard"}'),
  ('Rice Vinegar',          'Condiments',  '{"rice wine vinegar"}'),
  ('Curry Powder',          'Spice',       '{"curry spice","curry seasoning"}'),
  ('Italian Seasoning',     'Spice',       '{"italian herbs","mixed italian seasoning"}'),
  ('Cumin',                 'Spice',       '{"ground cumin","cumin powder"}'),
  ('Paprika',               'Spice',       '{"smoked paprika","sweet paprika"}'),
  ('Chili Flakes',          'Spice',       '{"red pepper flakes","crushed red pepper"}'),
  ('Taco Seasoning',        'Spice',       '{"taco spice mix"}'),
  ('Garlic Powder',         'Spice',       '{"garlic powder"}'),
  ('Onion Powder',          'Spice',       '{"onion powder"}'),
  ('Garam Masala',          'Spice',       '{"garam masala spice"}'),
  ('Burger Buns',           'Bakery',      '{"hamburger buns","brioche buns"}'),
  ('Flour Tortillas',       'Bakery',      '{"tortillas","medium flour tortillas","soft tortillas"}'),
  ('Frozen Mixed Veggies',  'Frozen',      '{"mixed vegetables frozen","frozen vegetables"}')
on conflict (name) do nothing;

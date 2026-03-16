-- ================================================================
-- Meal Planner — Full Schema (v2)
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- If upgrading from v1, use supabase-migrate-v2.sql instead
-- ================================================================

create extension if not exists "uuid-ossp";

-- ── Profiles ─────────────────────────────────────────────────────
create table public.profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  display_name text not null default '',
  household_id uuid,  -- set after household creation
  created_at   timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can read all profiles"    on public.profiles for select using (auth.role() = 'authenticated');
create policy "Users can update own profile"   on public.profiles for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Households ───────────────────────────────────────────────────
create table public.households (
  id           uuid default uuid_generate_v4() primary key,
  name         text not null,
  invite_code  text not null unique,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now()
);
alter table public.households enable row level security;
create policy "Members can read own household"   on public.households for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.household_id = households.id));
create policy "Authenticated users can create household" on public.households for insert
  with check (auth.role() = 'authenticated');
create policy "Creator can update household"     on public.households for update
  using (auth.uid() = created_by);

-- ── Canonical ingredients ─────────────────────────────────────────
-- Master list of standardized ingredient names for deduplication
create table public.canonical_ingredients (
  id           uuid default uuid_generate_v4() primary key,
  name         text not null unique,   -- the canonical/standard name e.g. "Chicken Breast"
  category     text not null default 'Other',
  aliases      text[] default '{}',    -- e.g. ["chicken breasts","boneless chicken breast"]
  created_at   timestamptz default now()
);
alter table public.canonical_ingredients enable row level security;
create policy "Authenticated users can read canonical ingredients"   on public.canonical_ingredients for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert canonical ingredients" on public.canonical_ingredients for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update canonical ingredients" on public.canonical_ingredients for update using (auth.role() = 'authenticated');

-- ── Recipes ──────────────────────────────────────────────────────
create table public.recipes (
  id           uuid default uuid_generate_v4() primary key,
  created_by   uuid references auth.users(id) on delete set null,
  name         text not null,
  servings     int  not null default 4,
  recipe_url   text,
  video_url    text,
  source_url   text,
  photo_url    text,
  instructions text,
  notes        text,
  tags         text[] default '{}',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.recipes enable row level security;
-- Master list: all authenticated users can read all recipes
create policy "Authenticated users can read recipes"   on public.recipes for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert recipes" on public.recipes for insert with check (auth.role() = 'authenticated');
create policy "Creator can update recipe"              on public.recipes for update using (auth.uid() = created_by);
create policy "Creator can delete recipe"              on public.recipes for delete using (auth.uid() = created_by);

-- ── Ingredients ──────────────────────────────────────────────────
create table public.ingredients (
  id               uuid default uuid_generate_v4() primary key,
  recipe_id        uuid references public.recipes(id) on delete cascade not null,
  name             text not null,
  canonical_name   text,   -- matched canonical name for shopping list deduplication
  qty              numeric not null default 0,
  unit             text not null default '',
  category         text not null default 'Other',
  calories         numeric default 0,
  protein          numeric default 0,
  is_pantry_staple boolean default false,
  sort_order       int default 0
);
alter table public.ingredients enable row level security;
create policy "Authenticated users can read ingredients"   on public.ingredients for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert ingredients" on public.ingredients for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update ingredients" on public.ingredients for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete ingredients" on public.ingredients for delete using (auth.role() = 'authenticated');

-- ── Saved recipes (household's curated list) ─────────────────────
create table public.saved_recipes (
  id           uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households(id) on delete cascade not null,
  recipe_id    uuid references public.recipes(id) on delete cascade not null,
  saved_by     uuid references auth.users(id) on delete set null,
  saved_at     timestamptz default now(),
  unique (household_id, recipe_id)
);
alter table public.saved_recipes enable row level security;
create policy "Household members can manage saved recipes" on public.saved_recipes
  for all using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.household_id = saved_recipes.household_id)
  );

-- ── Meal plans ───────────────────────────────────────────────────
create table public.meal_plans (
  id           uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households(id) on delete cascade not null,
  week_start   date not null,
  misc_items   text[] default '{}',   -- freetext shopping list extras
  created_at   timestamptz default now(),
  unique (household_id, week_start)
);
alter table public.meal_plans enable row level security;
create policy "Household members can manage meal plans" on public.meal_plans
  for all using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.household_id = meal_plans.household_id)
  );

-- ── Meal plan slots ──────────────────────────────────────────────
create table public.meal_plan_slots (
  id          uuid default uuid_generate_v4() primary key,
  plan_id     uuid references public.meal_plans(id) on delete cascade not null,
  recipe_id   uuid references public.recipes(id) on delete set null,
  slot_order  int not null default 0,   -- 0-6, order within the week (not day of week)
  servings    int not null default 4
);
alter table public.meal_plan_slots enable row level security;
create policy "Household members can manage slots" on public.meal_plan_slots
  for all using (
    exists (
      select 1 from public.meal_plans mp
      join public.profiles p on p.household_id = mp.household_id
      where mp.id = meal_plan_slots.plan_id and p.id = auth.uid()
    )
  );

-- ── Storage bucket for recipe photos ─────────────────────────────
insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', true)
on conflict (id) do nothing;

create policy "Anyone can view recipe photos"
  on storage.objects for select using (bucket_id = 'recipe-photos');
create policy "Authenticated users can upload recipe photos"
  on storage.objects for insert
  with check (bucket_id = 'recipe-photos' and auth.role() = 'authenticated');
create policy "Users can delete own recipe photos"
  on storage.objects for delete
  using (bucket_id = 'recipe-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ── Seed: canonical ingredients ───────────────────────────────────
insert into public.canonical_ingredients (name, category, aliases) values
  ('Chicken Breast',        'Meat',       '{"chicken breasts","boneless chicken breast","chicken breast cutlet","chicken breast chopped","sous vide chopped chicken"}'),
  ('Chicken Thighs',        'Meat',       '{"chicken thigh","chicken thighs diced","boneless thighs","chicken thigh diced"}'),
  ('Ground Beef',           'Meat',       '{"ground beef 80/20","ground beef 90/10","lean ground beef"}'),
  ('Ground Turkey',         'Meat',       '{"ground turkey breast","lean ground turkey"}'),
  ('Ground Chicken',        'Meat',       '{"ground chicken breast"}'),
  ('Sirloin Steak',         'Meat',       '{"sirloin","steak","beef steak"}'),
  ('Salmon',                'Meat',       '{"salmon fillet","salmon filet","fresh salmon"}'),
  ('Chorizo',               'Meat',       '{"chorizo sausage","spanish chorizo"}'),
  ('Bacon',                 'Meat',       '{"bacon strips","bacon slices"}'),
  ('Italian Pork Sausage',  'Meat',       '{"pork sausage","italian sausage"}'),
  ('Ground Pork',           'Meat',       '{"pork mince"}'),
  ('Jasmine Rice',          'Dry',        '{"jasmine rice uncooked","white jasmine rice"}'),
  ('Basmati Rice',          'Dry',        '{"basmati","long grain rice"}'),
  ('Spaghetti',             'Dry',        '{"spaghetti pasta","thin spaghetti"}'),
  ('Olive Oil',             'Dry',        '{"extra virgin olive oil","evoo","olive oil spray"}'),
  ('Garlic',                'Produce',    '{"garlic cloves","fresh garlic","minced garlic","garlic clove"}'),
  ('Yellow Onion',          'Produce',    '{"onion","white onion","brown onion","medium onion"}'),
  ('Red Onion',             'Produce',    '{"red onions"}'),
  ('Lemon',                 'Produce',    '{"fresh lemon","lemons"}'),
  ('Lime',                  'Produce',    '{"fresh lime","limes"}'),
  ('Red Bell Pepper',       'Produce',    '{"red pepper","bell pepper red","red capsicum"}'),
  ('Green Bell Pepper',     'Produce',    '{"green pepper","bell pepper green"}'),
  ('Broccoli Florets',      'Produce',    '{"broccoli","fresh broccoli","broccoli crown"}'),
  ('Zucchini',              'Produce',    '{"zucchini squash","courgette"}'),
  ('Cherry Tomatoes',       'Produce',    '{"cherry tomato","grape tomatoes"}'),
  ('Tomato',                'Produce',    '{"tomatoes","fresh tomato","roma tomato"}'),
  ('Spinach',               'Produce',    '{"fresh spinach","baby spinach","spinach leaves"}'),
  ('Cilantro',              'Produce',    '{"fresh cilantro","coriander leaves","cilantro leaves"}'),
  ('Green Onion',           'Produce',    '{"scallions","spring onions","green onions"}'),
  ('Avocado',               'Produce',    '{"fresh avocado","ripe avocado"}'),
  ('Cucumber',              'Produce',    '{"fresh cucumber","english cucumber"}'),
  ('Coconut Milk',          'Can',        '{"coconut milk can","full fat coconut milk"}'),
  ('Black Beans',           'Can',        '{"canned black beans","black beans canned"}'),
  ('Diced Tomatoes',        'Can',        '{"canned diced tomatoes","diced tomato","fire roasted diced tomatoes"}'),
  ('Light Sour Cream',      'Dairy',      '{"sour cream","reduced fat sour cream"}'),
  ('Heavy Cream',           'Dairy',      '{"heavy whipping cream","double cream","whipping cream"}'),
  ('Butter',                'Dairy',      '{"unsalted butter","salted butter"}'),
  ('Parmesan Cheese',       'Dairy',      '{"parmesean cheese","parmesan","grated parmesan","parmigiano"}'),
  ('Feta Cheese',           'Dairy',      '{"crumbled feta","feta"}'),
  ('Shredded Cheddar',      'Dairy',      '{"cheddar cheese","shredded cheddar cheese","cheddar"}'),
  ('Panko Breadcrumbs',     'Dry',        '{"panko","breadcrumbs","panko crumbs"}'),
  ('Soy Sauce',             'Condiments', '{"low sodium soy sauce","light soy sauce","tamari"}'),
  ('Sriracha',              'Condiments', '{"sriracha sauce","hot sauce sriracha"}'),
  ('Honey',                 'Condiments', '{"pure honey","raw honey"}'),
  ('Sesame Oil',            'Condiments', '{"toasted sesame oil"}'),
  ('Hoisin Sauce',          'Condiments', '{"hoisin"}'),
  ('Ginger',                'Produce',    '{"fresh ginger","ginger root","minced ginger"}'),
  ('Plain Greek Yogurt',    'Dairy',      '{"plain nonfat yogurt","greek yogurt","nonfat yogurt","plain yogurt"}'),
  ('Large Eggs',            'Refrigerated','{"eggs","large egg","egg"}'),
  ('Sweet Thai Chili Sauce','Condiments', '{"thai sweet chili sauce","sweet chili sauce"}'),
  ('Maple Syrup',           'Condiments', '{"pure maple syrup"}'),
  ('Curry Powder',          'Spice',      '{"curry spice","curry seasoning"}'),
  ('Italian Seasoning',     'Spice',      '{"italian herbs","mixed italian seasoning"}'),
  ('Cumin',                 'Spice',      '{"ground cumin","cumin powder"}'),
  ('Paprika',               'Spice',      '{"smoked paprika","sweet paprika"}'),
  ('Chili Flakes',          'Spice',      '{"red pepper flakes","crushed red pepper","chili flakes"}'),
  ('Taco Seasoning',        'Spice',      '{"taco spice mix"}'),
  ('Chicken Broth',         'Dry',        '{"chicken stock","chicken broth low sodium"}');

-- ── Seed: Thai Coconut Curry ──────────────────────────────────────
insert into public.recipes (id, name, servings, tags)
values ('a1b2c3d4-0000-0000-0000-000000000001', 'Thai Coconut Curry', 4, '{"Chicken","Bowls","High Protein"}');

insert into public.ingredients (recipe_id, name, canonical_name, qty, unit, category, calories, protein, is_pantry_staple, sort_order) values
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Chicken Breast',        'Chicken Breast',         16,  'oz',   'Meat',       752,   140.8, false, 1),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Jasmine Rice',          'Jasmine Rice',           1.5, 'cup',  'Dry',        307.5,   6.45, false, 2),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Red Bell Pepper',       'Red Bell Pepper',        1,   'each', 'Produce',     32,     1,   false, 3),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Coconut Milk',          'Coconut Milk',           8,   'oz',   'Can',        440,     4,   false, 4),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Sweet Thai Chili Sauce','Sweet Thai Chili Sauce', 2,   'oz',   'Condiments', 100,     0,   false, 5),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Lime',                  'Lime',                   1,   'each', 'Produce',     20,     0,   false, 6),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Curry Powder',          'Curry Powder',           1,   'tbsp', 'Spice',        0,     0,   true,  7);

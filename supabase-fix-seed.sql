-- ================================================================
-- Save the Thai Coconut Curry seed recipe to all existing households
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- Save seed recipe to every existing household that doesn't already have it
insert into public.saved_recipes (household_id, recipe_id)
select h.id, 'a1b2c3d4-0000-0000-0000-000000000001'
from public.households h
where not exists (
  select 1 from public.saved_recipes sr
  where sr.household_id = h.id
    and sr.recipe_id = 'a1b2c3d4-0000-0000-0000-000000000001'
);

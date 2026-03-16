-- ================================================================
-- Fix meal_plans table for household-based planning
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- 1. Make user_id nullable (old plans used user_id, new ones use household_id)
alter table public.meal_plans alter column user_id drop not null;

-- 2. Make sure household_id column exists
alter table public.meal_plans add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.meal_plans add column if not exists misc_items text[] default '{}';

-- 3. Drop old unique constraint and add new one
alter table public.meal_plans drop constraint if exists meal_plans_user_id_week_start_key;
alter table public.meal_plans drop constraint if exists meal_plans_household_id_week_start_key;
alter table public.meal_plans add constraint meal_plans_household_id_week_start_key unique (household_id, week_start);

-- 4. Fix RLS policies for meal_plans
drop policy if exists "Users can manage own meal plans"       on public.meal_plans;
drop policy if exists "Household members can manage meal plans" on public.meal_plans;

create policy "Household members can manage meal plans" on public.meal_plans
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.household_id = meal_plans.household_id
    )
  );

-- Also allow insert for authenticated users (needed to create the first plan)
create policy "Authenticated users can insert meal plans" on public.meal_plans
  for insert with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.household_id = meal_plans.household_id
    )
  );

-- 5. Fix meal_plan_slots RLS to work with household-based plans
drop policy if exists "Users can manage own slots"         on public.meal_plan_slots;
drop policy if exists "Household members can manage slots" on public.meal_plan_slots;

create policy "Household members can manage slots" on public.meal_plan_slots
  for all using (
    exists (
      select 1 from public.meal_plans mp
      join public.profiles p on p.household_id = mp.household_id
      where mp.id = meal_plan_slots.plan_id
        and p.id = auth.uid()
    )
  );

-- 6. Add slot_order to meal_plan_slots if missing
alter table public.meal_plan_slots add column if not exists slot_order int not null default 0;

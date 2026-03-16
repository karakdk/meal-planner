-- ================================================================
-- Fix meal_plan_slots RLS so recipe selection works
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- The current policy does a complex join which may be failing
-- Replace with a simpler, more reliable policy

drop policy if exists "Household members can manage slots" on public.meal_plan_slots;
drop policy if exists "Users can manage own slots"         on public.meal_plan_slots;

-- Simple policy: if you can see the meal plan, you can manage its slots
create policy "Anyone can manage slots for accessible plans" on public.meal_plan_slots
  for all using (
    exists (
      select 1 from public.meal_plans
      where meal_plans.id = meal_plan_slots.plan_id
        and exists (
          select 1 from public.profiles
          where profiles.id = auth.uid()
            and profiles.household_id = meal_plans.household_id
        )
    )
  )
  with check (
    exists (
      select 1 from public.meal_plans
      where meal_plans.id = meal_plan_slots.plan_id
        and exists (
          select 1 from public.profiles
          where profiles.id = auth.uid()
            and profiles.household_id = meal_plans.household_id
        )
    )
  );

-- Also make sure meal_plans insert works correctly
drop policy if exists "Household members can manage meal plans"    on public.meal_plans;
drop policy if exists "Authenticated users can insert meal plans"  on public.meal_plans;

create policy "Household members can manage meal plans" on public.meal_plans
  for all using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.household_id = meal_plans.household_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.household_id = meal_plans.household_id
    )
  );

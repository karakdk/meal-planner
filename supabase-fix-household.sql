-- ================================================================
-- Fix household creation permissions
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- The issue: the households insert policy may be conflicting
-- Drop and recreate all household policies cleanly

drop policy if exists "Members can read own household"           on public.households;
drop policy if exists "Authenticated users can create household" on public.households;
drop policy if exists "Creator can update household"             on public.households;

-- Allow any logged-in user to read any household (needed to validate invite codes on join)
create policy "Authenticated users can read households" on public.households
  for select using (auth.role() = 'authenticated');

-- Allow any logged-in user to create a household
create policy "Authenticated users can create household" on public.households
  for insert with check (auth.role() = 'authenticated');

-- Allow creator to update their household
create policy "Creator can update household" on public.households
  for update using (auth.uid() = created_by);

-- Also make sure profiles can be updated by the owner (needed to set household_id)
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Make sure profiles insert is allowed (in case trigger didn't fire)
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Fix: make day_of_week nullable since new code uses slot_order instead
alter table public.meal_plan_slots alter column day_of_week drop not null;
alter table public.meal_plan_slots alter column day_of_week set default 0;

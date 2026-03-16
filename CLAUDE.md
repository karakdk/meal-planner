# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm start        # Run production server
```

No test or lint scripts are configured.

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
```

## Architecture

**Next.js 14 App Router** app with Supabase (Postgres + Auth) backend and Claude AI integration.

### Route Groups

- `app/(app)/` — Protected routes requiring auth + household membership. Layout enforces both.
- `app/login/` — Email/password auth via Supabase
- `app/household/` — Create or join a household (required before accessing app)
- `app/api/` — Three serverless API routes (see below)

### Core Features & Data Flow

**Recipes** — Two-tier model: a global master list (all authenticated users can see/add) and per-household saved lists. Recipes are imported via URL → Claude parses HTML → returns structured JSON, or created manually.

**Meal Plans** — Weekly plans (Mon–Sun) scoped to a household. A plan auto-creates for the current week if missing. Each plan has up to 7 `meal_plan_slots`.

**Shopping List** — Generated from all meal plan slots' ingredients. Ingredients are deduplicated by `canonical_name` + unit. "Pantry staples" are excluded. Checked-off state lives in `localStorage`.

**Ingredients** — Recipes store ingredients with a `canonical_name` linked to the `canonical_ingredients` table, which holds standardized names, aliases, categories, and nutrition data. The `IngredientInput` component autocompletes against this table via `/api/canonical-ingredients`.

### API Routes

| Route | Purpose |
|---|---|
| `POST /api/import-recipe` | Fetches a URL's HTML, sends to Claude Sonnet to extract recipe structure (name, ingredients, instructions, tags, image) |
| `POST /api/estimate-nutrition` | Sends ingredient list to Claude to estimate calories & protein (USDA-based) |
| `GET /api/canonical-ingredients?q=` | Autocomplete search — returns top 6 matches via exact/prefix/alias scoring |

### Database

8 core tables with UUID PKs and Row-Level Security for multi-tenant isolation:

`profiles` → `households` (many-to-many via membership) → `meal_plans` → `meal_plan_slots` → `recipes` → `ingredients` → `canonical_ingredients`

`saved_recipes` links `households` ↔ `recipes`.

Full schema in [supabase-schema.sql](supabase-schema.sql). Migration scripts are in `supabase-fix-*.sql` and `supabase-migrate-v2.sql`.

### Supabase Clients

- [lib/supabase.ts](lib/supabase.ts) — Browser client (use in Client Components)
- [lib/supabase-server.ts](lib/supabase-server.ts) — Server client using `@supabase/ssr` (use in Server Components and API routes)

### Key Types

All shared TypeScript types and utility functions are in [lib/types.ts](lib/types.ts).

### Styling

Tailwind CSS with a custom theme: colors `cream`, `sage`, `stone`; fonts DM Sans (body) and DM Serif Display (headings); extended border-radius scale.

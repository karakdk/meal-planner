# Meal Planner — Setup Guide

## What you're getting
A full meal planning app with login, recipe management (including import from URL), weekly meal planning, and an auto-generated shopping list. Built with Next.js, Supabase, and Tailwind CSS.

---

## Step 1 — Get the code onto your computer

1. Install [Node.js](https://nodejs.org) (v18 or higher) if you don't have it
2. Unzip this folder somewhere on your computer
3. Open Terminal (Mac) or Command Prompt (Windows)
4. `cd` into the project folder
5. Run: `npm install`

---

## Step 2 — Create your Supabase project (free)

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project**, give it a name like "meal-planner"
3. Choose a region close to you, set a database password, click **Create**
4. Wait ~2 minutes for it to spin up
5. Go to **Settings → API**
6. Copy your **Project URL** and **anon public** key

---

## Step 3 — Set up the database

1. In Supabase, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Open the file `supabase-schema.sql` from this project
4. Paste all its contents into the SQL editor
5. Click **Run** — this creates all tables and seeds the Thai Coconut Curry recipe

---

## Step 4 — Configure environment variables

1. Copy `.env.local.example` to `.env.local`
2. Fill in your values:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
ANTHROPIC_API_KEY=sk-ant-...
```

**Getting your Anthropic API key** (needed for recipe URL import):
- Go to [console.anthropic.com](https://console.anthropic.com)
- Create an account, go to **API Keys**, create a new key
- You get $5 free credit which is more than enough to import hundreds of recipes

---

## Step 5 — Run it locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Sign up with your email, confirm it, and log in!

---

## Step 6 — Deploy to Vercel (free, so anyone can access it)

1. Create a free account at [vercel.com](https://vercel.com)
2. Install the Vercel CLI: `npm i -g vercel`
3. In your project folder run: `vercel`
4. Follow the prompts (link to your Vercel account, create a new project)
5. Add your environment variables in Vercel:
   - Go to your project → **Settings → Environment Variables**
   - Add all three variables from your `.env.local`
6. Run `vercel --prod` to deploy

Your app will be live at `https://your-project-name.vercel.app` — share that URL with Ernie to create an account!

---

## How to use the app

### Adding recipes
- **Import from URL**: Recipes → Import — paste any recipe website URL
- **Add manually**: Recipes → Add recipe — fill in the form

### Planning meals
- **Plan tab**: Select a day, choose a recipe from the dropdown, adjust servings
- The week runs Monday–Sunday and resets automatically each week

### Shopping list
- **Shop tab**: Auto-generated from your meal plan
- Tap items to check them off as you shop
- Items marked as "pantry staples" in the recipe are automatically excluded

---

## Files overview

```
app/
  (app)/          — protected pages (require login)
    plan/         — weekly meal planner
    shopping/     — shopping list
    recipes/      — recipe browser + detail + add + import
    profile/      — user settings
  api/
    import-recipe/ — serverless function for URL import
  login/          — login & signup page
components/
  Nav.tsx         — bottom navigation bar
lib/
  supabase.ts     — browser Supabase client
  supabase-server.ts — server Supabase client
  types.ts        — shared TypeScript types
supabase-schema.sql — run this in Supabase SQL editor
```

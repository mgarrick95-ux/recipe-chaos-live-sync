
# RecipeChaos – Live Sync Build (Starter)

This is a starter of the RecipeChaos app with:

- Recipes tab
- Pantry & Freezer with available vs held quantities
- Planner with Holds / Reservations
- Optional Supabase live sync (Pantry, Freezer, Reservations)
- Local fallback when Supabase is not configured

## Getting started

1. Copy `.env.example` to `.env.local` and (for now) you can leave the values empty while testing:
   ```bash
   cp .env.example .env.local
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the dev server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:3000 in your browser.

Without Supabase keys, everything is stored locally in your browser only.

## Enabling live sync with Supabase

1. Create a free project at https://supabase.com.
2. In the SQL editor, paste and run `supabase.schema.sql` from this project.
3. In `.env.local`, fill:
   ```env
   SUPABASE_URL=your_project_url
   SUPABASE_ANON_KEY=your_anon_key
   ```
4. Restart `npm run dev`.

When `SUPABASE_URL` and `SUPABASE_ANON_KEY` are present, Pantry, Freezer, and Reservations will read/write to Supabase and sync in realtime across devices.

## Next steps

- You can now push this entire folder to GitHub as a repo.
- Later we can:
  - Turn it into a PWA so you can "Add to Home Screen" on Android and Apple.
  - Add your rainbow bomb logo for the app icon.
  - Wire FrostPantry to the same Supabase tables for shared inventory.

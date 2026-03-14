# Reading (Books) Setup

This project uses Supabase as the source of truth for book reading state and exports a public snapshot to `reading/reading.json`.

## 1) Apply the database schema

Run the SQL in `supabase/reading_schema.sql` in the Supabase SQL editor.

This creates:
- `reading_books` table (single table)
- `reading_status` enum (`up_next`, `in_progress`, `finished`)
- update timestamp triggers
- RLS policies for per-user access

## 2) Environment variables

For local development and CI:

- `SUPABASE_URL`: Supabase project URL (for example, `https://xyzcompany.supabase.co`)
- `SUPABASE_PUBLISHABLE_KEY`: public key (used by future client/admin UI)
- `SUPABASE_SECRET_KEY`: server-only key used by export/publish scripts

Never expose `SUPABASE_SECRET_KEY` in client-side code.

## 3) Export public reading data

The export script reads from Supabase and writes a deterministic public snapshot:

```bash
node scripts/export-reading.mjs
```

Output:
- `reading/reading.json`

## 4) Status model

Internal status values are exported directly:
- `up_next`
- `in_progress`
- `finished`

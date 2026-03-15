# Reading (Books) Setup

This project uses Supabase as the source of truth for book reading state and exports a public snapshot to `reading/reading.json`.

## 1) Apply the database schema

Run the SQL in `supabase/reading_schema.sql` in the Supabase SQL editor.

This creates:
- `reading_books` table (single table)
- `reading_status` enum (`up_next`, `in_progress`, `completed`)
- `date_read` (date, nullable) — when the book was finished; used to order **Completed** chronologically (newest first)
- `date_added` (date, nullable) — when the book was added; used to order **Up next** and **In Progress** chronologically (newest first)
- update timestamp triggers
- RLS policies for per-user access

If you already have the table, add the new columns in the SQL editor:
`alter table public.reading_books add column if not exists date_read date;`
`alter table public.reading_books add column if not exists date_added date;`

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
- `completed`

## 5) Goodreads → import CSV

To regenerate `reading/reading_books_import.csv` from a Goodreads Library Export:

```bash
node scripts/goodreads-to-import-csv.mjs <your_user_uuid> "Goodreads Library Export.csv"
```

Or set `READING_USER_ID` and optionally pass the Goodreads CSV path:

```bash
READING_USER_ID=3e60c37d-ba9e-47c5-8b12-857a651e8a42 node scripts/goodreads-to-import-csv.mjs "Goodreads Library Export.csv"
```

The script maps Goodreads **Exclusive Shelf** to status (`read` → completed, `currently-reading` → in_progress, `to-read` → up_next) and copies **Date Read** and **Date Added** into `date_read` and `date_added` for ordering on the site. Import CSV columns: `user_id`, `title`, `authors`, `status`, `image_url`, `date_read`, `date_added`.

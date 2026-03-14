#!/usr/bin/env node

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");
try {
  const env = await readFile(resolve(root, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
} catch (_) {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "Missing required env vars: SUPABASE_URL and SUPABASE_SECRET_KEY"
  );
  process.exit(1);
}

const STATUS_ORDER = { up_next: 0, in_progress: 1, completed: 2 };

function compareItems(a, b) {
  const statusDelta = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (statusDelta !== 0) return statusDelta;

  if (a.status === "completed") {
    const aDate = a.date_read ? Date.parse(a.date_read) : 0;
    const bDate = b.date_read ? Date.parse(b.date_read) : 0;
    if (aDate !== bDate) return bDate - aDate;
  } else {
    const aAdded = a.date_added ? Date.parse(a.date_added) : (a.created_at ? Date.parse(a.created_at) : 0);
    const bAdded = b.date_added ? Date.parse(b.date_added) : (b.created_at ? Date.parse(b.created_at) : 0);
    if (aAdded !== bAdded) return bAdded - aAdded;
  }

  return a.title.localeCompare(b.title);
}

function toPublicItem(row) {
  return {
    type: "book",
    title: row.title || "Untitled",
    authors: row.authors || "Unknown",
    image_url: row.image_url || null,
    status: row.status,
    updated_at: row.updated_at || null,
    date_read: row.date_read || null,
    date_added: row.date_added || null,
  };
}

async function fetchReadingEntries() {
  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/reading_books`);
  endpoint.searchParams.set(
    "select",
    "title,authors,status,image_url,updated_at,date_read,date_added,created_at"
  );
  endpoint.searchParams.set("order", "updated_at.desc");

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase export query failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function main() {
  const rows = await fetchReadingEntries();
  const items = rows.map(toPublicItem).sort(compareItems);
  const output = {
    generated_at: new Date().toISOString(),
    total: items.length,
    items,
  };

  const outputPath = resolve(process.cwd(), "reading", "reading.json");
  await mkdir(resolve(process.cwd(), "reading"), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Wrote ${items.length} books to reading/reading.json`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

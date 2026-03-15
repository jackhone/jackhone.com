#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const GOODREADS_SHELF_TO_STATUS = {
  read: "completed",
  "currently-reading": "in_progress",
  "to-read": "up_next",
};

function parseCsvLine(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let field = "";
      i++;
      while (i < line.length) {
        if (line[i] === '"') {
          i++;
          if (line[i] === '"') {
            field += '"';
            i++;
          } else break;
        } else {
          field += line[i];
          i++;
        }
      }
      out.push(field);
      if (line[i] === ",") i++;
    } else {
      let field = "";
      while (i < line.length && line[i] !== ",") {
        field += line[i];
        i++;
      }
      out.push(field.trim());
      if (line[i] === ",") i++;
    }
  }
  return out;
}

function toIsoDate(goodreadsDate) {
  if (!goodreadsDate || !/^\d{4}\/\d{2}\/\d{2}$/.test(goodreadsDate.trim()))
    return "";
  const [y, m, d] = goodreadsDate.trim().split("/");
  return `${y}-${m}-${d}`;
}

function rowToImport(userId, cols, header) {
  const title = (cols[header.Title] ?? "").trim() || "Untitled";
  const author = (cols[header.Author] ?? "").trim();
  const additional = (cols[header["Additional Authors"]] ?? "").trim();
  const authors = additional ? `${author}, ${additional}` : author;
  const shelf = (cols[header["Exclusive Shelf"]] ?? "").trim().toLowerCase();
  const status = GOODREADS_SHELF_TO_STATUS[shelf] ?? "up_next";
  const dateRead = toIsoDate(cols[header["Date Read"]] ?? "");
  const dateAdded = toIsoDate(cols[header["Date Added"]] ?? "");
  return [userId, title, authors, status, "", dateRead, dateAdded];
}

function escapeCsvField(s) {
  const t = String(s ?? "");
  if (t.includes(",") || t.includes('"') || t.includes("\n")) {
    return '"' + t.replace(/"/g, '""') + '"';
  }
  return t;
}

async function main() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];
  let userId = process.env.READING_USER_ID;
  let goodreadsPath = "Goodreads Library Export.csv";
  if (arg1 && arg1.endsWith(".csv")) {
    goodreadsPath = arg1;
  } else if (arg1) {
    userId = arg1;
    if (arg2) goodreadsPath = arg2;
  }
  if (!userId) {
    console.error(
      "Usage: READING_USER_ID=<uuid> node scripts/goodreads-to-import-csv.mjs [goodreads.csv]"
    );
    console.error("   Or: node scripts/goodreads-to-import-csv.mjs <user_id> [goodreads.csv]");
    process.exit(1);
  }
  const goodreadsFull = resolve(process.cwd(), goodreadsPath);
  const outputPath = resolve(process.cwd(), "reading", "reading_books_import.csv");

  const raw = await readFile(goodreadsFull, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) {
    console.error("CSV has no data rows");
    process.exit(1);
  }

  const headerLine = lines[0];
  const headerCols = parseCsvLine(headerLine);
  const header = {};
  headerCols.forEach((name, i) => {
    header[name] = i;
  });

  const required = ["Title", "Author", "Exclusive Shelf", "Date Read", "Date Added"];
  for (const k of required) {
    if (header[k] === undefined) {
      console.error(`Missing column: ${k}. Found: ${headerCols.join(", ")}`);
      process.exit(1);
    }
  }

  const outLines = ["user_id,title,authors,status,image_url,date_read,date_added"];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length <= Math.max(...Object.values(header))) continue;
    const row = rowToImport(userId, cols, header);
    outLines.push(row.map(escapeCsvField).join(","));
  }

  await mkdir(resolve(process.cwd(), "reading"), { recursive: true });
  await writeFile(outputPath, outLines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${outLines.length - 1} rows to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

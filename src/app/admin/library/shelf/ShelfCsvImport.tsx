"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Field";
import { bulkAddLibraryBooks } from "./actions";

/** One CSV line, honouring quotes -- a title with a comma in it is one field. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === "," || ch === ";" || ch === "\t") {
      out.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field.trim());
  return out;
}

export type ParsedRow = {
  title: string;
  author: string;
  isbn: string;
  category: string;
  description: string;
  shelf_mark: string;
  copies: number;
};

/** The headings a club's spreadsheet is likely to use for each field. */
const FIELDS: { key: keyof ParsedRow; match: RegExp }[] = [
  { key: "title", match: /^(title|book ?name|book|name)$/i },
  { key: "author", match: /^(author|writer|by)$/i },
  { key: "isbn", match: /^(isbn|isbn ?13|isbn ?10)$/i },
  { key: "category", match: /^(category|genre|subject|type)$/i },
  { key: "description", match: /^(description|about|blurb|notes?)$/i },
  { key: "shelf_mark", match: /^(shelf ?mark|shelf|location|code)$/i },
  { key: "copies", match: /^(copies|qty|quantity|count|stock)$/i },
];

function parseCsv(text: string): { rows: ParsedRow[]; headerFound: boolean } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], headerFound: false };

  const header = splitLine(lines[0]);
  const at: Partial<Record<keyof ParsedRow, number>> = {};
  header.forEach((cell, i) => {
    for (const field of FIELDS) {
      if (at[field.key] === undefined && field.match.test(cell.trim())) at[field.key] = i;
    }
  });

  // No recognisable header? Assume the commonest shape a club types by hand:
  // title, author, copies.
  const headerFound = at.title !== undefined;
  const body = headerFound ? lines.slice(1) : lines;

  const rows: ParsedRow[] = [];
  for (const line of body) {
    const cells = splitLine(line);
    const pick = (key: keyof ParsedRow, fallback = -1) => {
      const index = at[key] ?? fallback;
      return index >= 0 ? (cells[index] ?? "").trim() : "";
    };

    const title = headerFound ? pick("title") : (cells[0] ?? "").trim();
    if (!title) continue;

    const copiesRaw = headerFound ? pick("copies") : (cells[2] ?? "").trim();
    const copies = Number(copiesRaw.replace(/[^0-9]/g, ""));

    rows.push({
      title,
      author: headerFound ? pick("author") : (cells[1] ?? "").trim(),
      isbn: pick("isbn"),
      category: pick("category"),
      description: pick("description"),
      shelf_mark: pick("shelf_mark"),
      copies: Number.isFinite(copies) && copies > 0 ? copies : 1,
    });
  }

  return { rows, headerFound };
}

/**
 * A shelf from a spreadsheet.
 *
 * Parsed in the browser and shown before anything is written, because an
 * import of the wrong file should cost a glance rather than eighty rows to
 * undo. Matching is on title and author, so re-importing a corrected sheet
 * updates what is there instead of doubling the shelf.
 */
export function ShelfCsvImport() {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setDone(null);
    setFileName(file.name);

    const { rows: parsed, headerFound } = parseCsv(await file.text());
    if (parsed.length === 0) {
      setError("No books found in that file.");
      setRows(null);
      return;
    }
    if (parsed.length > 500) {
      setError("Please import at most 500 books at a time.");
      setRows(null);
      return;
    }
    if (!headerFound) {
      setError(
        "No column headings recognised, so the first three columns were read as title, author and copies. Check the preview before importing.",
      );
    }
    setRows(parsed);
  }

  function send() {
    if (!rows) return;
    setError(null);

    startTransition(async () => {
      const result = await bulkAddLibraryBooks(rows);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const d = result.data;
      setDone(
        d
          ? `${d.added} added${d.updated ? `, ${d.updated} already on the shelf and updated` : ""}.`
          : "Imported.",
      );
      setRows(null);
      setFileName(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-sm font-medium text-ink">
            Import a shelf from a spreadsheet
          </span>
          <span className="block text-xs text-ink-muted">
            A column each for title, author and copies is enough.
          </span>
        </span>
        <span className="shrink-0 text-sm font-medium text-brand-600">
          {open ? "Hide" : "Open"}
        </span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {error ? <Notice tone={rows ? "info" : "error"}>{error}</Notice> : null}
          {done ? <Notice tone="success">{done}</Notice> : null}

          <div className="flex flex-wrap items-center gap-2">
            <label className="press inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-brand-700 hover:bg-canvas">
              {fileName ? "Choose another file" : "Choose a CSV file"}
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={onFile}
                className="sr-only"
              />
            </label>
            {fileName ? <span className="text-sm text-ink-muted">{fileName}</span> : null}
          </div>

          <p className="text-xs text-ink-muted">
            Recognised headings: title, author, isbn, category, copies, shelf
            mark, description. Anything else is ignored. Covers are uploaded
            afterwards, book by book.
          </p>

          {rows ? (
            <>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-canvas text-left text-xs uppercase tracking-wide text-ink-faint">
                    <tr>
                      <th className="px-3 py-2 font-medium">Title</th>
                      <th className="px-3 py-2 font-medium">Author</th>
                      <th className="px-3 py-2 font-medium">Copies</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((row, i) => (
                      <tr key={`${row.title}-${i}`}>
                        <td className="px-3 py-1.5 text-ink">{row.title}</td>
                        <td className="px-3 py-1.5 text-ink-muted">{row.author || "—"}</td>
                        <td className="px-3 py-1.5 tabular-nums text-ink-muted">{row.copies}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={send} disabled={pending}>
                  {pending
                    ? "Importing…"
                    : `Import ${rows.length} ${rows.length === 1 ? "book" : "books"}`}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRows(null);
                    setFileName(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

import "server-only";

/**
 * A CSV field, quoted the way a spreadsheet expects.
 *
 * Everything is quoted rather than only the fields that need it: a member's
 * name can acquire a comma at any time, and a file that is right only until
 * someone is called "Silva, Jr." is not right.
 *
 * The leading apostrophe guard is deliberate. A field beginning =, +, - or @
 * is executed as a formula when the file is opened in Excel or Sheets, which
 * is how a spreadsheet of member details becomes a way to run something on
 * an admin's machine.
 */
function field(value: unknown): string {
  if (value == null) return '""';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(field).join(","), ...rows.map((r) => r.map(field).join(","))];
  // CRLF and a BOM: Excel on Windows opens a plain UTF-8 file as Latin-1 and
  // turns every Sinhala or Tamil name into mojibake.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** A filename with the date in it, so two downloads never look alike. */
export function csvFilename(what: string, scope?: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  const middle = scope ? `-${scope.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
  return `pickabook-${what}${middle}-${today}.csv`;
}

export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A member list is not something to leave in a shared cache.
      "Cache-Control": "no-store, private",
    },
  });
}

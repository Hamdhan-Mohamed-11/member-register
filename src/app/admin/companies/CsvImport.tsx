"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Field";
import { checkEmployeeEmails, inviteEmployees, type InviteOutcome } from "./actions";

export type CsvRowState = "new" | "invited" | "member" | "invalid" | "duplicate";

type Row = { email: string; name: string; state: CsvRowState; note?: string };

const STATE_LABEL: Record<CsvRowState, string> = {
  new: "Will be invited",
  invited: "Already invited",
  member: "Already in the club",
  invalid: "Not an email address",
  duplicate: "Repeated in the file",
};

const STATE_CLASS: Record<CsvRowState, string> = {
  new: "bg-success-100 text-success-700",
  invited: "bg-warning-100 text-warning-700",
  member: "bg-canvas-deep text-ink-muted",
  invalid: "bg-danger-100 text-danger-700",
  duplicate: "bg-canvas-deep text-ink-muted",
};

/**
 * Splits one CSV line, honouring quotes.
 *
 * Written out rather than `line.split(",")` because an exported employee list
 * routinely carries "Silva, Nimali" in a name column, and splitting on every
 * comma turns that row into two wrong ones.
 */
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Finds the email and the name in a file whose columns we did not choose.
 *
 * HR exports come with whatever headings the system that made them used, so
 * the header is read when it looks like one, and when it does not the first
 * field that looks like an email address wins. Being tolerant here is the
 * difference between "upload your list" and "reformat your list, then upload".
 */
function parseCsv(text: string): { email: string; name: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const first = splitLine(lines[0]).map((h) => h.toLowerCase());
  const looksLikeHeader = first.some((h) => /e-?mail/.test(h)) || first.some((h) => /name/.test(h));

  let emailAt = first.findIndex((h) => /e-?mail/.test(h));
  let nameAt = first.findIndex((h) => /^(full ?name|name|employee)$/.test(h));
  const firstAt = first.findIndex((h) => /first/.test(h));
  const lastAt = first.findIndex((h) => /last|surname/.test(h));

  const body = looksLikeHeader ? lines.slice(1) : lines;
  if (!looksLikeHeader) {
    emailAt = -1;
    nameAt = -1;
  }

  return body.map((line) => {
    const cells = splitLine(line);
    const email =
      emailAt >= 0 && cells[emailAt]
        ? cells[emailAt]
        : (cells.find((c) => EMAIL.test(c.replace(/^.*<|>.*$/g, ""))) ?? cells[0] ?? "");

    const name =
      nameAt >= 0 && cells[nameAt]
        ? cells[nameAt]
        : firstAt >= 0 || lastAt >= 0
          ? [firstAt >= 0 ? cells[firstAt] : "", lastAt >= 0 ? cells[lastAt] : ""]
              .filter(Boolean)
              .join(" ")
          : cells.filter((c) => c !== email && !EMAIL.test(c))[0] ?? "";

    // "Ada Lovelace <ada@acme.lk>" is one field, not two.
    const angled = email.match(/<([^>]+)>/);
    return { email: (angled ? angled[1] : email).trim().toLowerCase(), name: name.trim() };
  });
}

/**
 * Bulk-inviting a company's employees from a spreadsheet.
 *
 * Nothing is sent until the list has been looked at: the file is parsed in
 * the browser, checked against who is already invited or already a member,
 * and shown row by row. Only then does the confirm button send the invites --
 * an accidental upload of the wrong file should cost a glance, not fifty
 * emails to a client's staff.
 */
export function CsvImport({ clubId, clubName }: { clubId: string; clubName: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null);
  const [pending, startTransition] = useTransition();
  const [checking, setChecking] = useState(false);

  const toInvite = (rows ?? []).filter((r) => r.state === "new");

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setOutcome(null);
    setRows(null);
    setFileName(file.name);

    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      setError("That file had no rows in it.");
      return;
    }
    if (parsed.length > 500) {
      setError("Please import at most 500 people at a time.");
      return;
    }

    const seen = new Set<string>();
    const draft: Row[] = parsed.map(({ email, name }) => {
      if (!EMAIL.test(email)) return { email: email || "(blank)", name, state: "invalid" };
      if (seen.has(email)) return { email, name, state: "duplicate" };
      seen.add(email);
      return { email, name, state: "new" };
    });

    // What the club already knows about these addresses. Without it the
    // preview would promise to invite people who are already members.
    setChecking(true);
    const known = await checkEmployeeEmails(
      clubId,
      draft.filter((r) => r.state === "new").map((r) => r.email),
    );
    setChecking(false);

    if (known.ok && known.data) {
      const byEmail = new Map(known.data.map((k) => [k.email, k.state]));
      for (const row of draft) {
        const state = byEmail.get(row.email);
        if (state && state !== "new") row.state = state;
      }
    }

    setRows(draft);
  }

  function send() {
    setError(null);
    const fd = new FormData();
    fd.set("clubId", clubId);
    fd.set("emails", toInvite.map((r) => r.email).join("\n"));

    startTransition(async () => {
      const result = await inviteEmployees(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOutcome(result.data ?? null);
      setRows(null);
      setFileName(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? <Notice>{error}</Notice> : null}

      {outcome ? (
        <Notice tone="success">
          Invited {outcome.invited.length}{" "}
          {outcome.invited.length === 1 ? "person" : "people"} to {clubName}
          {outcome.failed.length ? `, ${outcome.failed.length} didn't go through` : ""}.
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="press inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-brand-700 hover:bg-canvas">
          {fileName ? "Choose another file" : "Choose a CSV file"}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={onFile}
            className="sr-only"
          />
        </label>
        {fileName ? <span className="text-sm text-ink-muted">{fileName}</span> : null}
        {checking ? <span className="text-sm text-ink-muted">Checking…</span> : null}
      </div>

      <p className="text-xs text-ink-muted">
        A column headed <code className="font-mono">email</code> is used if there is
        one; otherwise the first address in each row. Name columns are read where
        they exist and ignored where they do not.
      </p>

      {rows ? (
        <>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-canvas text-left text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">What happens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row, i) => (
                  <tr key={`${row.email}-${i}`}>
                    <td className="px-3 py-1.5 text-ink">{row.email}</td>
                    <td className="px-3 py-1.5 text-ink-muted">{row.name || "—"}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_CLASS[row.state]}`}
                      >
                        {STATE_LABEL[row.state]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={send} disabled={pending || toInvite.length === 0}>
              {pending
                ? "Sending invites…"
                : toInvite.length === 0
                  ? "Nobody new to invite"
                  : `Invite ${toInvite.length} ${toInvite.length === 1 ? "person" : "people"}`}
            </Button>
            <Button variant="ghost" onClick={() => { setRows(null); setFileName(null); }}>
              Cancel
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

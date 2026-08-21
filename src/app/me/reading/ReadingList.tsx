"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice } from "@/components/ui/Field";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ReadingItem } from "@/lib/members/queries";
import { addReadingItem, deleteReadingItem, setReadingStatus } from "./actions";

const SECTIONS = [
  { status: "reading", label: "Currently reading", empty: "Nothing on the go right now." },
  { status: "want_to_read", label: "Want to read", empty: "No books on the list yet." },
  { status: "read", label: "Read", empty: "Books you finish will collect here." },
] as const;

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReadingList({ items }: { items: ReadingItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fields: Record<string, string>,
    form?: HTMLFormElement,
  ) {
    setError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);

    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      form?.reset();
      router.refresh();
    });
  }

  function onAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    run(
      addReadingItem,
      {
        title: String(fd.get("title") ?? ""),
        author: String(fd.get("author") ?? ""),
        status: String(fd.get("status") ?? "reading"),
      },
      form,
    );
  }

  return (
    <div className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}

      <Card>
        <CardHeader
          title="Add a book"
          description="Type the title and author — anything you're reading counts."
        />
        <form onSubmit={onAdd} className="space-y-3">
          <Field label="Title" name="title" required placeholder="The Remains of the Day" />
          <Field label="Author" name="author" placeholder="Kazuo Ishiguro" />
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-ink mb-1.5">
              Where does it go?
            </label>
            <select
              id="status"
              name="status"
              defaultValue="reading"
              className="w-full min-h-11 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="reading">Currently reading</option>
              <option value="want_to_read">Want to read</option>
              <option value="read">Already read</option>
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add book"}
          </Button>
        </form>
      </Card>

      {SECTIONS.map((section) => {
        const rows = items.filter((i) => i.status === section.status);
        return (
          <Card key={section.status} flush>
            <div className="p-4 pb-2">
              <CardHeader title={`${section.label} (${rows.length})`} />
            </div>

            {rows.length === 0 ? (
              <EmptyState title={section.empty} />
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((item) => (
                  <li key={item.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{item.title}</p>
                        {item.author ? (
                          <p className="text-sm text-ink-muted">{item.author}</p>
                        ) : null}
                        {item.dateRead ? (
                          <p className="text-xs text-ink-faint mt-0.5">
                            Finished {formatDate(item.dateRead)}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 gap-1.5">
                        {item.status !== "read" ? (
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              run(setReadingStatus, { itemId: item.id, status: "read" })
                            }
                          >
                            Mark read
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              run(setReadingStatus, { itemId: item.id, status: "reading" })
                            }
                          >
                            Reading again
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          aria-label={`Remove ${item.title}`}
                          onClick={() => run(deleteReadingItem, { itemId: item.id })}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Notice, TextareaField } from "@/components/ui/Field";
import { parseVideoUrl } from "@/lib/sessions/video";
import { submitVideo } from "./actions";

/**
 * The form and, beside it on a wide screen, a live preview of the link.
 *
 * The preview is the same parse the server does, so what the member sees here
 * is what will be embedded -- and a link that shows nothing is caught before
 * they send it, not after an admin rejects it. The embed URL is built by
 * parseVideoUrl from a validated id, never from the pasted string.
 *
 * On success it goes to the member's own videos, where the new one is waiting
 * (review item 1), rather than leaving them on an emptied form.
 */
export function SubmitVideoForm({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  const embed = parseVideoUrl(url);
  const looksWrong = url.trim().length > 8 && !embed;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await submitVideo(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/me/videos?${isAdmin ? "published" : "sent"}=1`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-5 lg:items-start">
      <Card className="lg:col-span-3">
        <div className="space-y-4">
          {error ? <Notice>{error}</Notice> : null}

          <Field
            label="Video link"
            name="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtu.be/…"
            hint={
              looksWrong
                ? "That doesn't look like a YouTube or Vimeo link yet."
                : "YouTube or Vimeo. Set the video to Public or Unlisted."
            }
          />
          <Field label="Title" name="title" required placeholder="Our September session" />
          <TextareaField
            label="Description"
            name="description"
            rows={4}
            placeholder="What's in it, and why it's worth watching."
          />

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : isAdmin ? "Add video" : "Send for review"}
            </Button>
            <button
              type="button"
              onClick={() => router.back()}
              className="min-h-10 rounded-lg px-3 text-sm text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      </Card>

      <div className="space-y-4 lg:col-span-2 lg:sticky lg:top-6">
        <Card flush className="overflow-hidden">
          <div className="relative aspect-video bg-brand-900">
            {embed ? (
              <iframe
                key={embed.embedUrl}
                src={embed.embedUrl}
                title="Preview"
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center px-6 text-center">
                <div>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mx-auto size-9 text-sky-300"
                    aria-hidden
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <path d="m10 9.5 4.5 2.5-4.5 2.5z" />
                  </svg>
                  <p className="mt-2 text-sm text-on-navy-muted">
                    Paste a link and the video shows here.
                  </p>
                </div>
              </div>
            )}
          </div>
          <p className="px-4 py-2.5 text-xs text-ink-muted">
            {embed ? "This is exactly what members will see." : "Preview"}
          </p>
        </Card>

        <Card tone="brand">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
            What happens next
          </p>
          <ol className="mt-3 space-y-3 text-sm text-ink">
            {(isAdmin
              ? [
                  "You add the link and a title.",
                  "It is published on Recordings straight away.",
                ]
              : [
                  "You send the link and a title.",
                  "A club admin checks it. You can watch it in My videos meanwhile.",
                  "Once approved, it appears on Recordings for everyone.",
                ]
            ).map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </form>
  );
}

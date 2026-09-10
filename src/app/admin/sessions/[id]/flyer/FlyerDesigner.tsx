"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Field";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { useHydrated } from "@/lib/useHydrated";
import {
  FLYER_H,
  FLYER_TEMPLATES,
  FLYER_W,
  templateById,
  type FlyerFields,
} from "@/lib/flyers/templates";
import { clearFlyer, saveFlyer } from "./actions";

export type FlyerSession = {
  id: string;
  clubName: string;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  when: string;
  location: string;
  presenter: string;
  flyerTemplate: string | null;
  flyerUrl: string | null;
};

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/**
 * Builds a session flyer in the browser.
 *
 * Everything is drawn on a canvas at full size and displayed scaled down, so
 * what a secretary sees is exactly the file they get — a preview built from
 * separate HTML would drift from the render, and the whole point is that the
 * poster is correct before it goes out.
 *
 * The three outcomes are deliberately independent, as the club asked for:
 * download it, share it through the phone's own share sheet, save it into the
 * app for members — any, all, or none.
 */
export function FlyerDesigner({ session }: { session: FlyerSession }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [templateId, setTemplateId] = useState(
    session.flyerTemplate ?? FLYER_TEMPLATES[0].id,
  );
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  // navigator.share exists on phones and almost nothing else, so the button
  // only appears where it will actually work. Gated on hydration rather than
  // set from an effect: the server has no navigator, and useHydrated gives a
  // different server and client snapshot by design with no extra render.
  const hydrated = useHydrated();
  const canShare =
    hydrated && typeof navigator !== "undefined" && typeof navigator.share === "function";

  const template = templateById(templateId);

  const fields: FlyerFields = {
    clubName: session.clubName,
    title: session.title,
    bookTitle: session.bookTitle,
    bookAuthor: session.bookAuthor,
    when: session.when,
    location: session.location,
    presenter: session.presenter,
    photo: template.usesPhoto ? photo : null,
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, FLYER_W, FLYER_H);
    templateById(templateId).draw(ctx, fields);
    // fields is rebuilt every render from props and state; listing it as a
    // dependency would redraw on every render forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, photo, session]);

  useEffect(() => {
    draw();
  }, [draw]);

  function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("That photo is over 8MB. Please pick a smaller one.");
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPhoto(img);
      setPhotoName(file.name);
      // The bitmap is decoded by now, so the object URL has done its job.
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("That image couldn't be read.");
    };
    img.src = url;
  }

  function toBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        resolve(null);
        return;
      }
      canvas.toBlob((b) => resolve(b), "image/png", 0.95);
    });
  }

  const fileName = `${session.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "flyer"}.png`;

  async function download() {
    setError(null);
    const blob = await toBlob();
    if (!blob) {
      setError("Couldn't produce the image.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    setError(null);
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], fileName, { type: "image/png" });

    try {
      // canShare(files) is a separate check from share() existing: several
      // browsers expose share() for links but refuse files.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: session.title });
      } else {
        await navigator.share({ title: session.title, text: session.title });
      }
    } catch {
      // A cancelled share sheet rejects. That is not an error worth showing.
    }
  }

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);

    const blob = await toBlob();
    if (!blob) {
      setBusy(false);
      setError("Couldn't produce the image.");
      return;
    }

    // Straight from the browser to storage, like avatars -- the PNG never
    // passes through the server. A random name rather than the session id:
    // the bucket is public, so an unguessable key is what stops next month's
    // flyer being readable before it is announced.
    const path = `${session.id}/${crypto.randomUUID()}.png`;
    const supabase = getBrowserSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from("flyers")
      .upload(path, blob, { contentType: "image/png", upsert: false });

    setBusy(false);
    if (uploadError) {
      setError(uploadError.message);
      return;
    }

    startTransition(async () => {
      const result = await saveFlyer(session.id, path, templateId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await clearFlyer(session.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(false);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
      <div className="space-y-3 order-2 lg:order-1">
        {error ? <Notice>{error}</Notice> : null}
        {saved ? (
          <Notice tone="success">Saved. Members see it on the session page.</Notice>
        ) : null}

        <Card>
          <p className="text-sm font-medium text-ink mb-2">Template</p>
          <div className="space-y-1.5">
            {FLYER_TEMPLATES.map((t) => (
              <label
                key={t.id}
                className={`flex gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  t.id === templateId
                    ? "border-brand-600 bg-brand-50"
                    : "border-line hover:bg-canvas"
                }`}
              >
                <input
                  type="radio"
                  name="template"
                  value={t.id}
                  checked={t.id === templateId}
                  onChange={() => setTemplateId(t.id)}
                  className="mt-1 size-4 shrink-0 text-brand-600 focus:ring-brand-600/25"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{t.name}</span>
                  <span className="block text-xs text-ink-muted">{t.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-sm font-medium text-ink mb-1">Photo</p>
          {template.usesPhoto ? (
            <>
              <input
                type="file"
                accept="image/*"
                onChange={onPhoto}
                className="block w-full text-sm text-ink-muted file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
              />
              <p className="mt-1.5 text-xs text-ink-muted">
                {photoName ?? "No photo yet — the template shows a colour block until you add one."}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">
              This template doesn&apos;t use a photo.
            </p>
          )}
        </Card>

        <Card>
          <p className="text-sm font-medium text-ink mb-2">When it&apos;s right</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={download} size="sm">
              Download
            </Button>
            {canShare ? (
              <Button onClick={share} variant="secondary" size="sm">
                Share
              </Button>
            ) : null}
            <Button
              onClick={save}
              variant="secondary"
              size="sm"
              disabled={busy || pending}
            >
              {busy || pending ? "Saving…" : "Save to the session"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Do any of these, or all three. Saving is what puts it in front of
            members in the app.
          </p>

          {session.flyerUrl ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="mt-3 text-xs text-danger-600 hover:underline disabled:opacity-50"
            >
              Remove the saved flyer
            </button>
          ) : null}
        </Card>
      </div>

      <div className="order-1 lg:order-2">
        <Card flush className="overflow-hidden bg-canvas-deep p-3">
          {/*
            Rendered at full size and scaled with CSS. The canvas element's
            width/height attributes are the bitmap; the style is only how big
            it looks. Setting the size in CSS alone would render a 1080px
            design into a 340px bitmap and export a blurry file.
          */}
          <canvas
            ref={canvasRef}
            width={FLYER_W}
            height={FLYER_H}
            className="w-full h-auto rounded-lg shadow-card"
          />
        </Card>
      </div>
    </div>
  );
}

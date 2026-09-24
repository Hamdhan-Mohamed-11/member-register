"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice, controlClassName } from "@/components/ui/Field";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { useHydrated } from "@/lib/useHydrated";
import {
  CENTRED,
  FLYER_H,
  FLYER_TEMPLATES,
  FLYER_W,
  flyerFontSpecs,
  setFlyerFonts,
  templateById,
  type FlyerDate,
  type FlyerFields,
  type FlyerImage,
  type PhotoBox,
  type PhotoPos,
  type SponsorBox,
  type SponsorPos,
} from "@/lib/flyers/templates";
import { clearFlyer, saveFlyer, saveFlyerAssets } from "./actions";

export type FlyerSession = {
  id: string;
  clubName: string;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  date: FlyerDate;
  location: string;
  presenter: string;
  flyerTemplate: string | null;
  flyerUrl: string | null;
  /** A cover someone uploaded for this session's book. */
  bookImageUrl: string | null;
  /** The shop's id for this book, when the catalogue has a cover for it. */
  catalogueBookId: number | null;
  sponsorUrl: string | null;
  sponsorName: string;
};

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
// A phone photo is 4000px+ across. Redrawing that on every pointer move while
// dragging stutters, and the flyer is only 1080 wide, so it is scaled down
// once on load.
const MAX_PHOTO_EDGE = 2400;

const THUMB_SCALE = 0.2;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function downscale(img: HTMLImageElement): FlyerImage {
  const edge = Math.max(img.width, img.height);
  if (edge <= MAX_PHOTO_EDGE) return img;
  const k = MAX_PHOTO_EDGE / edge;
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/**
 * The real family names of the page's fonts. next/font renames Playfair and
 * Poppins, so a canvas asking for them by their usual names gets a fallback;
 * the CSS variables next/font defines hold the names it actually registered.
 */
function pageFonts(): { display: string | null; body: string | null } {
  const css = getComputedStyle(document.documentElement);
  const display = css.getPropertyValue("--font-playfair").trim() || null;
  const body = css.getPropertyValue("--font-poppins").trim() || null;
  return { display, body };
}

/** A small live preview of one template, for the picker. */
function TemplateThumb({
  fields,
  templateId,
  version,
}: {
  fields: FlyerFields;
  templateId: string;
  version: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(THUMB_SCALE, 0, 0, THUMB_SCALE, 0, 0);
    ctx.clearRect(0, 0, FLYER_W, FLYER_H);
    const t = templateById(templateId);
    t.draw(ctx, { ...fields, photo: t.usesPhoto ? fields.photo : null, onPhotoBox: undefined });
    // Redrawn when the photo, logo or fonts change (`version`), not on every
    // drag -- six extra full renders per pointer move would stutter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, version]);

  return (
    <canvas
      ref={ref}
      width={FLYER_W * THUMB_SCALE}
      height={FLYER_H * THUMB_SCALE}
      className="h-auto w-full rounded-md shadow-card"
    />
  );
}

/**
 * Builds a session flyer in the browser.
 *
 * Everything is drawn on a canvas at full size and displayed scaled down, so
 * what a secretary sees is exactly the file they get — a preview built from
 * separate HTML would drift from the render, and the whole point is that the
 * poster is correct before it goes out.
 *
 * The photo can be dragged into place on the preview and zoomed, instead of
 * always being centre-cropped -- a face at the edge of a phone photo used to
 * end up cut in half with no way to fix it.
 *
 * The three outcomes are deliberately independent, as the club asked for:
 * download it, share it through the phone's own share sheet, save it into the
 * app for members — any, all, or none.
 */
export function FlyerDesigner({ session }: { session: FlyerSession }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<PhotoBox | null>(null);
  const sponsorBoxRef = useRef<SponsorBox | null>(null);
  const dragRef = useRef<{ px: number; py: number; pos: PhotoPos } | null>(null);
  const sponsorDragRef = useRef<{ px: number; py: number; pos: SponsorPos } | null>(null);

  const [templateId, setTemplateId] = useState(
    FLYER_TEMPLATES.some((t) => t.id === session.flyerTemplate)
      ? (session.flyerTemplate as string)
      : FLYER_TEMPLATES[0].id,
  );
  const [photo, setPhoto] = useState<FlyerImage | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoPos, setPhotoPos] = useState<PhotoPos>(CENTRED);
  const [logo, setLogo] = useState<FlyerImage | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [bookCover, setBookCover] = useState<FlyerImage | null>(null);
  const [sponsor, setSponsor] = useState<FlyerImage | null>(null);
  const [sponsorName, setSponsorName] = useState(session.sponsorName);
  // Null means "wherever this template puts it". It only becomes a position
  // once someone moves or resizes it, so switching template still lands the
  // sponsor in the spot that template leaves clear.
  const [sponsorPos, setSponsorPos] = useState<SponsorPos | null>(null);
  const [assetsSaved, setAssetsSaved] = useState(false);
  const [dragging, setDragging] = useState(false);
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
  const canDrag = template.usesPhoto && photo != null;

  // The brand fonts and the logo, before anything is worth drawing. The draw
  // runs anyway meanwhile; it just redraws once these land.
  useEffect(() => {
    let alive = true;
    const { display, body } = pageFonts();
    setFlyerFonts(display, body);
    Promise.allSettled(flyerFontSpecs().map((spec) => document.fonts.load(spec))).then(() => {
      if (alive) setFontsReady(true);
    });
    loadImage("/logo.png")
      .then((img) => alive && setLogo(img))
      .catch(() => {});

    // The book's cover: whatever was uploaded for this session, otherwise the
    // shop's own picture of it, served from our origin so the canvas can
    // still export (a canvas that has drawn a cross-origin image cannot).
    const coverSrc =
      session.bookImageUrl ??
      (session.catalogueBookId ? `/api/book-cover/${session.catalogueBookId}` : null);
    if (coverSrc) {
      loadImage(coverSrc)
        .then((img) => alive && setBookCover(downscale(img)))
        .catch(() => {});
    }
    if (session.sponsorUrl) {
      loadImage(session.sponsorUrl)
        .then((img) => alive && setSponsor(downscale(img)))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
    // Once, on mount. The session's saved assets are props from the server and
    // a change to them arrives as a fresh page, so re-running on each would
    // re-fetch the same two pictures for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fields: FlyerFields = {
    clubName: session.clubName,
    title: session.title,
    bookTitle: session.bookTitle,
    bookAuthor: session.bookAuthor,
    date: session.date,
    location: session.location,
    presenter: session.presenter,
    photo: template.usesPhoto ? photo : null,
    photoPos,
    logo,
    bookCover,
    sponsor,
    sponsorName,
    sponsorPos,
    onPhotoBox: (box) => {
      boxRef.current = box;
    },
    onSponsorBox: (box) => {
      sponsorBoxRef.current = box;
    },
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    boxRef.current = null;
    sponsorBoxRef.current = null;
    ctx.clearRect(0, 0, FLYER_W, FLYER_H);
    templateById(templateId).draw(ctx, fields);
    // fields is rebuilt every render from props and state; listing it as a
    // dependency would redraw on every render forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    templateId,
    photo,
    photoPos,
    logo,
    bookCover,
    sponsor,
    sponsorName,
    sponsorPos,
    fontsReady,
    session,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Bumps when anything the thumbnails show changes.
  const thumbVersion =
    (photo ? 1 : 0) +
    (logo ? 2 : 0) +
    (fontsReady ? 4 : 0) +
    (bookCover ? 8 : 0) +
    (sponsor ? 16 : 0) +
    (sponsorPos ? 64 : 0) +
    sponsorName.length * 32;

  /**
   * Uploads a book cover or a sponsor logo and records it on the session, so
   * the next flyer for this evening already has it.
   */
  async function onAsset(
    event: React.ChangeEvent<HTMLInputElement>,
    which: "book" | "sponsor",
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("That image is too large. Please pick a smaller one.");
      return;
    }

    setError(null);
    setAssetsSaved(false);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const key = `${session.id}/${which}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await getBrowserSupabaseClient()
      .storage.from("flyers")
      .upload(key, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setError(uploadError.message);
      return;
    }

    // Only the field that changed: null leaves the others alone (0044).
    const saved = await saveFlyerAssets({
      sessionId: session.id,
      bookImagePath: which === "book" ? key : null,
      sponsorPath: which === "sponsor" ? key : null,
      sponsorName: null,
    });
    if (!saved.ok) {
      setError(saved.error);
      return;
    }

    const img = downscale(await loadImage(URL.createObjectURL(file)));
    if (which === "book") setBookCover(img);
    else setSponsor(img);
    setAssetsSaved(true);
    router.refresh();
  }

  async function saveSponsorName() {
    setError(null);
    const saved = await saveFlyerAssets({
      sessionId: session.id,
      bookImagePath: null,
      sponsorPath: null,
      sponsorName: sponsorName.trim() || "",
    });
    if (!saved.ok) setError(saved.error);
    else setAssetsSaved(true);
  }

  async function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("That photo is over 12MB. Please pick a smaller one.");
      return;
    }

    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      setPhoto(downscale(img));
      setPhotoName(file.name);
      setPhotoPos(CENTRED);
      // Switch to a template that shows it, if the current one does not.
      if (!template.usesPhoto) {
        setTemplateId(FLYER_TEMPLATES.find((t) => t.usesPhoto)!.id);
      }
    } catch {
      setError("That image couldn't be read.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // --- dragging -------------------------------------------------------------

  function inBox(p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) {
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  function clamp01(v: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, v));
  }

  /** A pointer position in flyer pixels, whatever size the preview is shown. */
  function toFlyer(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * FLYER_W,
      y: ((event.clientY - rect.top) / rect.height) * FLYER_H,
    };
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const p = toFlyer(event);

    // The sponsor is tested FIRST, and it is usually the smaller target: on
    // the templates where it sits over the photo, testing the photo first
    // would mean the sponsor could never be picked up.
    const sBox = sponsorBoxRef.current;
    if (sBox && inBox(p, sBox)) {
      event.currentTarget.setPointerCapture(event.pointerId);
      sponsorDragRef.current = {
        px: p.x,
        py: p.y,
        pos: sponsorPos ?? {
          x: (sBox.x + sBox.w / 2) / FLYER_W,
          y: (sBox.y + sBox.h / 2) / FLYER_H,
          scale: 1,
        },
      };
      setDragging(true);
      return;
    }

    const box = boxRef.current;
    if (!canDrag || !box) return;
    // Only a press on the photo itself starts a drag.
    if (!inBox(p, box)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { px: p.x, py: p.y, pos: photoPos };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const sponsorDrag = sponsorDragRef.current;
    if (sponsorDrag) {
      const p = toFlyer(event);
      // Kept a little inside the edges: a sponsor dragged off the flyer is
      // gone until someone thinks to press Re-place.
      setSponsorPos({
        scale: sponsorDrag.pos.scale,
        x: clamp01(sponsorDrag.pos.x + (p.x - sponsorDrag.px) / FLYER_W, 0.08, 0.92),
        y: clamp01(sponsorDrag.pos.y + (p.y - sponsorDrag.py) / FLYER_H, 0.05, 0.95),
      });
      return;
    }

    const drag = dragRef.current;
    const box = boxRef.current;
    if (!drag || !box) return;
    const p = toFlyer(event);
    // The photo overflows its frame by (dw - w); moving the pointer that far
    // takes the focal point from one edge to the other.
    const spanX = box.dw - box.w;
    const spanY = box.dh - box.h;
    setPhotoPos({
      zoom: drag.pos.zoom,
      x: spanX > 0 ? Math.min(1, Math.max(0, drag.pos.x - (p.x - drag.px) / spanX)) : 0.5,
      y: spanY > 0 ? Math.min(1, Math.max(0, drag.pos.y - (p.y - drag.py) / spanY)) : 0.5,
    });
  }

  function endDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current && !sponsorDragRef.current) return;
    dragRef.current = null;
    sponsorDragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  // --- output ---------------------------------------------------------------

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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
      <div className="order-2 space-y-4 lg:order-1">
        {error ? <Notice>{error}</Notice> : null}
        {saved ? (
          <Notice tone="success">Saved. Members see it on the session page.</Notice>
        ) : null}

        <Card>
          <p className="mb-3 text-sm font-medium text-ink">Template</p>
          <div className="grid grid-cols-3 gap-3">
            {FLYER_TEMPLATES.map((t) => {
              const active = t.id === templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  aria-pressed={active}
                  className={`press rounded-lg border-2 p-1.5 text-left transition-colors ${
                    active ? "border-brand-600 bg-brand-50" : "border-transparent hover:bg-canvas"
                  }`}
                >
                  <TemplateThumb fields={fields} templateId={t.id} version={thumbVersion} />
                  <span className="mt-1.5 block truncate text-xs font-medium text-ink">
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-ink-muted">{template.hint}</p>
        </Card>

        <Card>
          <p className="mb-1 text-sm font-medium text-ink">Photo</p>
          <input
            type="file"
            accept="image/*"
            onChange={onPhoto}
            className="block w-full text-sm text-ink-muted file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            {photoName
              ? template.usesPhoto
                ? "Drag the photo on the preview to move it."
                : "This template doesn't use a photo — pick one that does to show it."
              : "No photo yet — photo templates show a brand pattern until you add one."}
          </p>

          {canDrag ? (
            <div className="mt-3 space-y-2">
              <label htmlFor="flyer-zoom" className="flex items-center justify-between text-xs text-ink-muted">
                <span>Zoom</span>
                <span className="tabular-nums">{Math.round(photoPos.zoom * 100)}%</span>
              </label>
              <input
                id="flyer-zoom"
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={photoPos.zoom}
                onChange={(e) => setPhotoPos((p) => ({ ...p, zoom: Number(e.target.value) }))}
                className="w-full accent-brand-600"
              />
              <Button size="sm" variant="ghost" onClick={() => setPhotoPos(CENTRED)}>
                Re-centre
              </Button>
            </div>
          ) : null}
        </Card>

        <Card>
          <p className="mb-1 text-sm font-medium text-ink">The book</p>
          <div className="flex items-start gap-3">
            <div className="grid h-24 w-16 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-canvas-deep text-center text-[11px] text-ink-faint">
              {bookCover ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={session.bookImageUrl ?? `/api/book-cover/${session.catalogueBookId}`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="px-1">No cover</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-muted">
                {bookCover
                  ? session.bookImageUrl
                    ? "Using the cover you uploaded."
                    : "Using the shop's cover for this book."
                  : "The shop has no cover for this book. Upload one and every template will show it."}
              </p>
              <label className="press mt-2 inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-brand-700 hover:bg-canvas">
                {bookCover ? "Replace cover" : "Upload a cover"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onAsset(e, "book")}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          <hr className="my-4 border-line" />

          <p className="mb-1 text-sm font-medium text-ink">Sponsor (optional)</p>
          <div className="flex items-start gap-3">
            <div className="grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface text-center text-[11px] text-ink-faint">
              {session.sponsorUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={session.sponsorUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="px-1">No logo</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <input
                value={sponsorName}
                onChange={(e) => setSponsorName(e.target.value)}
                onBlur={saveSponsorName}
                maxLength={60}
                placeholder="Sponsor name"
                className={controlClassName}
              />
              <label className="press inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-brand-700 hover:bg-canvas">
                {sponsor ? "Replace logo" : "Upload a logo"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onAsset(e, "sponsor")}
                  className="sr-only"
                />
              </label>
              <p className="text-xs text-ink-muted">
                Printed as &ldquo;In association with&rdquo;. Drag it on the preview
                to move it.
              </p>
            </div>
          </div>
          {sponsor || sponsorName ? (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              <label
                htmlFor="sponsor-size"
                className="flex items-center justify-between text-xs text-ink-muted"
              >
                <span>Sponsor size</span>
                <span className="tabular-nums">
                  {Math.round((sponsorPos?.scale ?? 1) * 100)}%
                </span>
              </label>
              <input
                id="sponsor-size"
                type="range"
                min={0.5}
                max={2.5}
                step={0.05}
                value={sponsorPos?.scale ?? 1}
                onChange={(e) =>
                  setSponsorPos((prev) => {
                    const box = sponsorBoxRef.current;
                    const base =
                      prev ??
                      (box
                        ? {
                            x: (box.x + box.w / 2) / FLYER_W,
                            y: (box.y + box.h / 2) / FLYER_H,
                            scale: 1,
                          }
                        : { x: 0.5, y: 0.94, scale: 1 });
                    return { ...base, scale: Number(e.target.value) };
                  })
                }
                className="w-full accent-brand-600"
              />
              {sponsorPos ? (
                <Button size="sm" variant="ghost" onClick={() => setSponsorPos(null)}>
                  Re-place
                </Button>
              ) : null}
            </div>
          ) : null}

          {assetsSaved ? (
            <p className="mt-2 text-xs text-success-600">Saved to this session.</p>
          ) : null}
        </Card>

        <Card>
          <p className="mb-2 text-sm font-medium text-ink">When it&apos;s right</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={download} size="sm">
              Download
            </Button>
            {canShare ? (
              <Button onClick={share} variant="secondary" size="sm">
                Share
              </Button>
            ) : null}
            <Button onClick={save} variant="secondary" size="sm" disabled={busy || pending}>
              {busy || pending ? "Saving…" : "Save to the session"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Do any of these, or all three. Saving is what puts it in front of members in
            the app.
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

      <div className="order-1 lg:order-2 lg:sticky lg:top-6">
        <Card flush className="overflow-hidden bg-canvas-deep p-3">
          {/*
            Rendered at full size and scaled with CSS. The canvas element's
            width/height attributes are the bitmap; the style is only how big
            it looks. Setting the size in CSS alone would render a 1080px
            design into a 340px bitmap and export a blurry file.

            touch-action is only switched off while there is a photo to drag,
            so on a phone the page still scrolls past a text-only flyer.
          */}
          <canvas
            ref={canvasRef}
            width={FLYER_W}
            height={FLYER_H}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={`mx-auto block h-auto w-full max-w-xl rounded-lg shadow-card ${
              canDrag ? (dragging ? "cursor-grabbing touch-none" : "cursor-grab touch-none") : ""
            }`}
          />
          {canDrag ? (
            <p className="mt-2 text-center text-xs text-ink-muted">
              Drag the photo to reposition it.
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

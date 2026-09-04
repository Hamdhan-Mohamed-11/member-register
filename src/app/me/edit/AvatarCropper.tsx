"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

const VIEWPORT = 256; // on-screen editor, CSS pixels
const OUTPUT = 512; // exported avatar, square
const TARGET_TYPE = "image/webp";
const QUALITY = 0.85;
const MAX_ZOOM = 4;

/**
 * Square avatar cropper: drag to reposition, slider to zoom.
 *
 * Hand-rolled rather than pulling in a cropper library. The whole job is one
 * cover-fit calculation reused twice -- once as a CSS transform for the
 * preview, once as drawImage source rectangle for the export -- and the CSP
 * only allows scripts from a short CDN allowlist, so a dependency here is more
 * friction than the ~100 lines it would save.
 *
 * Avatars render as circles at 32-80px, so a square source is what the rest of
 * the app already assumes. Before this, an upload was letterboxed at whatever
 * aspect the phone produced and the crop was whatever the CSS happened to cut.
 */
export function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Centre it as it loads. Doing this in a follow-up effect would mean
      // setting state from an effect body, and would flash the image at the
      // corner for a frame first.
      const fit = VIEWPORT / Math.min(img.width, img.height);
      setImage(img);
      setOffset({
        x: (VIEWPORT - img.width * fit) / 2,
        y: (VIEWPORT - img.height * fit) / 2,
      });
    };
    img.onerror = () => setError("That image couldn't be read. Try a JPEG or PNG.");
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Scale at which the image exactly covers the square. Everything else is
  // this times the zoom.
  const base = image ? VIEWPORT / Math.min(image.width, image.height) : 1;
  const scale = base * zoom;
  const shownW = image ? image.width * scale : 0;
  const shownH = image ? image.height * scale : 0;

  // The image must always cover the viewport, so the offset is clamped rather
  // than free -- otherwise you can drag a blank edge into the avatar.
  const clamp = useCallback(
    (next: { x: number; y: number }) => ({
      x: Math.min(0, Math.max(VIEWPORT - shownW, next.x)),
      y: Math.min(0, Math.max(VIEWPORT - shownH, next.y)),
    }),
    [shownW, shownH],
  );

  /**
   * Zoom about the centre of the frame, then re-clamp.
   *
   * Done here rather than in an effect watching `zoom`: the offset has to move
   * with the zoom or whatever you had centred slides away, and the clamp has
   * to run against the NEW size or a zoom-out leaves a blank edge showing.
   */
  function onZoom(next: number) {
    setZoom(next);
    if (!image) return;

    const half = VIEWPORT / 2;
    const ratio = next / zoom;
    const nextW = image.width * base * next;
    const nextH = image.height * base * next;

    setOffset((prev) => ({
      x: Math.min(0, Math.max(VIEWPORT - nextW, half - (half - prev.x) * ratio)),
      y: Math.min(0, Math.max(VIEWPORT - nextH, half - (half - prev.y) * ratio)),
    }));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    setOffset(
      clamp({
        x: event.clientX - dragging.current.x,
        y: event.clientY - dragging.current.y,
      }),
    );
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    dragging.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function confirm() {
    if (!image) return;

    // Same geometry as the preview, in the original image's own pixels.
    const sourceSize = VIEWPORT / scale;
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Your browser couldn't process the image.");
      return;
    }
    ctx.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, TARGET_TYPE, QUALITY),
    );
    if (!blob) {
      setError("Your browser couldn't process the image.");
      return;
    }
    onDone(blob);
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}

      <div
        className="relative overflow-hidden rounded-full border border-line bg-surface-sunken touch-none select-none cursor-grab active:cursor-grabbing mx-auto"
        style={{ width: VIEWPORT, height: VIEWPORT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.src}
            alt=""
            draggable={false}
            className="absolute max-w-none"
            style={{
              width: shownW,
              height: shownH,
              left: offset.x,
              top: offset.y,
            }}
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-sm text-ink-muted">
            Loading…
          </div>
        )}
      </div>

      <div>
        <label htmlFor="avatar-zoom" className="block text-sm font-medium text-ink mb-1.5">
          Zoom
        </label>
        <input
          id="avatar-zoom"
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(event) => onZoom(Number(event.target.value))}
          className="w-full"
          disabled={!image}
        />
        <p className="text-xs text-ink-muted mt-1">
          Drag the photo to reposition it. The circle is what everyone sees.
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={confirm} disabled={!image} className="flex-1">
          Use this photo
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

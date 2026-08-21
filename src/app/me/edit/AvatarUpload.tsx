"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Field";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { setAvatarPath } from "./actions";

const MAX_DIMENSION = 512;
const TARGET_TYPE = "image/webp";
const QUALITY = 0.85;

/**
 * Downscales and re-encodes to WebP in the browser before upload.
 *
 * Phone cameras produce 4-8MB JPEGs, which would blow past the bucket's 2MB
 * limit and waste storage on an image rendered at 80px. Doing it client-side
 * also means the original never leaves the device.
 */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, TARGET_TYPE, QUALITY),
  );
  if (!blob) throw new Error("could not encode image");
  return blob;
}

export function AvatarUpload({
  userId,
  firstName,
  lastName,
  currentUrl,
}: {
  userId: string;
  firstName: string;
  lastName: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setBusy(true);

    try {
      const blob = await shrink(file);

      // Timestamped filename rather than a fixed one: overwriting the same key
      // leaves browsers and the CDN serving the old photo from cache, which
      // looks like the upload silently failed.
      const path = `${userId}/avatar-${Date.now()}.webp`;

      const supabase = getBrowserSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: TARGET_TYPE, upsert: false });

      if (uploadError) {
        setError(uploadError.message);
        setBusy(false);
        return;
      }

      setPreview(URL.createObjectURL(blob));

      const fd = new FormData();
      fd.set("path", path);
      startTransition(async () => {
        const result = await setAvatarPath(fd);
        if (!result.ok) setError(result.error);
        else router.refresh();
        setBusy(false);
      });
    } catch {
      setError("That image couldn't be processed. Try a JPEG or PNG.");
      setBusy(false);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const working = busy || pending;

  return (
    <div className="space-y-3">
      {error ? <Notice>{error}</Notice> : null}

      <div className="flex items-center gap-4">
        <Avatar
          src={preview ?? currentUrl}
          firstName={firstName}
          lastName={lastName}
          size="lg"
        />
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={working}
            onClick={() => inputRef.current?.click()}
          >
            {working ? "Uploading…" : currentUrl ? "Change photo" : "Add a photo"}
          </Button>
          <p className="text-xs text-ink-muted mt-1.5">
            JPEG, PNG or WebP. Resized automatically.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={onPick}
      />
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Field";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { setAvatarPath } from "./actions";
import { AvatarCropper } from "./AvatarCropper";

// Downscaling and WebP encoding now happen in AvatarCropper, which has to draw
// to a canvas anyway to apply the crop. Phone cameras produce 4-8MB JPEGs; the
// cropper's 512px square output keeps them well under the bucket's 2MB cap,
// and the original never leaves the device either way.
const TARGET_TYPE = "image/webp";

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
  const [picked, setPicked] = useState<File | null>(null);

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setError(null);
    // Crop first. Uploading straight from the picker gave whatever aspect the
    // camera produced, and the circular avatar then cut it wherever CSS liked.
    setPicked(file);
  }

  async function onCropped(blob: Blob) {
    setPicked(null);
    setError(null);
    setBusy(true);

    try {
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

  if (picked) {
    return (
      <div className="space-y-3">
        {error ? <Notice>{error}</Notice> : null}
        <AvatarCropper
          file={picked}
          onCancel={() => setPicked(null)}
          onDone={onCropped}
        />
      </div>
    );
  }

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

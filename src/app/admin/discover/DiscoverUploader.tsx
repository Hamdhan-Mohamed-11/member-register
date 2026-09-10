"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Notice, SelectField, TextareaField } from "@/components/ui/Field";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { createPost, deletePost } from "@/app/discover/actions";
import type { DiscoverPost } from "@/lib/discover/media";

export type ClubOption = { id: string; name: string };
export type SessionOption = { id: string; title: string; clubId: string };

const MAX_BYTES = 200 * 1024 * 1024;

/** Reads a photo's pixel size, so the feed can reserve the right box. */
function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Reads a video's size and length, and grabs a frame for the poster.
 *
 * The poster matters more than it sounds: without one the feed is a column of
 * black rectangles until each video buffers, and `preload="none"` — which is
 * what keeps a feed from downloading tens of megabytes unasked — guarantees
 * they stay black until tapped.
 */
function videoMeta(
  file: File,
): Promise<{ width: number; height: number; duration: number; poster: Blob | null } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const fail = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    video.onloadedmetadata = () => {
      // A second in, not frame zero: the first frame of a phone video is very
      // often black while the sensor settles.
      video.currentTime = Math.min(1, Math.max(0, video.duration / 2));
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: Math.round(video.duration),
          poster: null,
        });
        return;
      }
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((poster) => {
        URL.revokeObjectURL(url);
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: Math.round(video.duration),
          poster,
        });
      }, "image/jpeg", 0.8);
    };

    video.onerror = fail;
    video.src = url;
  });
}

export function DiscoverUploader({
  clubs,
  sessions,
}: {
  clubs: ClubOption[];
  sessions: SessionOption[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clubId, setClubId] = useState(clubs[0]?.id ?? "");
  const [sessionId, setSessionId] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const forThisClub = sessions.filter((s) => s.clubId === clubId);

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    setError(null);
    setDone(false);
    if (!chosen) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError("That file is over 200MB. Please trim it or send a smaller export.");
      return;
    }
    if (!chosen.type.startsWith("image/") && !chosen.type.startsWith("video/")) {
      setError("Please choose a photo or a video.");
      return;
    }
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  }

  async function submit() {
    if (!file || !clubId) return;
    setError(null);
    setDone(false);
    setBusy(true);

    const isVideo = file.type.startsWith("video/");
    const supabase = getBrowserSupabaseClient();
    const stamp = crypto.randomUUID();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? (isVideo ? "mp4" : "jpg");

    // First path segment is the club id -- the storage policy reads it and
    // asks can_admin_club(), so a secretary cannot write into another club.
    const path = `${clubId}/${stamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("discover")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setBusy(false);
      setError(uploadError.message);
      return;
    }

    let width: number | undefined;
    let height: number | undefined;
    let durationS: number | undefined;
    let posterPath: string | undefined;

    if (isVideo) {
      const meta = await videoMeta(file);
      if (meta) {
        width = meta.width;
        height = meta.height;
        durationS = meta.duration;
        if (meta.poster) {
          const key = `${clubId}/${stamp}-poster.jpg`;
          const { error: posterError } = await supabase.storage
            .from("discover")
            .upload(key, meta.poster, { contentType: "image/jpeg", upsert: false });
          // A missing poster is a worse-looking feed, not a failed post.
          if (!posterError) posterPath = key;
        }
      }
    } else {
      const size = await imageSize(file);
      if (size) {
        width = size.width;
        height = size.height;
      }
    }

    startTransition(async () => {
      const result = await createPost({
        clubId,
        kind: isVideo ? "video" : "photo",
        storagePath: path,
        caption: caption.trim() || undefined,
        posterPath,
        sessionId: sessionId || undefined,
        width,
        height,
        durationS,
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFile(null);
      setPreview(null);
      setCaption("");
      setSessionId("");
      if (fileRef.current) fileRef.current.value = "";
      setDone(true);
      router.refresh();
    });
  }

  if (clubs.length === 0) {
    return (
      <Card tone="warning">
        <p className="text-sm text-ink">
          You don&apos;t run a club yet, so there is nowhere to post. A super
          admin needs to appoint you first.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Post something"
        description="A photo or a short video from one of your club's events."
      />

      {error ? <Notice>{error}</Notice> : null}
      {done ? <Notice tone="success">Posted. Members can see it in Discover.</Notice> : null}

      <div className="space-y-4 mt-3">
        <SelectField
          label="Club"
          name="clubId"
          value={clubId}
          onChange={(e) => {
            setClubId(e.target.value);
            setSessionId("");
          }}
        >
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Session"
          name="sessionId"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          hint="Optional — links the post to the evening it came from."
        >
          <option value="">Not tied to a session</option>
          {forThisClub.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </SelectField>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="discover-file">
            Photo or video
          </label>
          <input
            id="discover-file"
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            onChange={onFile}
            className="block w-full text-sm text-ink-muted file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            Up to 200MB. Videos get a still picked from the middle, so the feed
            isn&apos;t a column of black boxes.
          </p>
        </div>

        {preview && file ? (
          <div className="rounded-lg overflow-hidden border border-line bg-canvas-deep">
            {file.type.startsWith("video/") ? (
              <video src={preview} controls playsInline className="w-full max-h-80" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="w-full max-h-80 object-contain" />
            )}
          </div>
        ) : null}

        <TextareaField
          label="Caption"
          name="caption"
          rows={2}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          hint="Optional."
        />

        <Button onClick={submit} disabled={busy || !file}>
          {busy ? "Uploading…" : "Post to Discover"}
        </Button>
      </div>
    </Card>
  );
}

/** Removes a post. The file stays; only the row goes. */
export function DeletePostButton({ post }: { post: DiscoverPost }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deletePost(post.id);
            if (!result.ok) setError(result.error);
            else router.refresh();
          })
        }
        className="min-h-9 rounded-lg border border-line px-3 text-xs font-medium text-danger-600 hover:bg-danger-100 disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error ? <span className="text-[11px] text-danger-600">{error}</span> : null}
    </span>
  );
}

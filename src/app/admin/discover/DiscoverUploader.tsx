"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Notice, SelectField, TextareaField } from "@/components/ui/Field";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { createPost, deletePost, setPostPoster } from "@/app/discover/actions";
import type { DiscoverPost } from "@/lib/discover/media";

export type ClubOption = { id: string; name: string };
export type SessionOption = { id: string; title: string; clubId: string };

const MAX_BYTES = 200 * 1024 * 1024;

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

/** The frame a <video> is currently showing, as a JPEG. */
function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!video.videoWidth || !video.videoHeight) return resolve(null);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return resolve(null);
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
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

    video.onseeked = async () => {
      const poster = await captureFrame(video);
      URL.revokeObjectURL(url);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Math.round(video.duration),
        poster,
      });
    };

    video.onerror = fail;
    video.src = url;
  });
}

type ThumbMode = "auto" | "frame" | "upload";

export function DiscoverUploader({
  clubs,
  sessions,
}: {
  clubs: ClubOption[];
  sessions: SessionOption[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [clubId, setClubId] = useState(clubs[0]?.id ?? "");
  const [sessionId, setSessionId] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  // The video's thumbnail: picked automatically, a frame the admin scrubbed
  // to, or an image they uploaded.
  const [thumbMode, setThumbMode] = useState<ThumbMode>("auto");
  const [thumb, setThumb] = useState<Blob | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);

  const forThisClub = sessions.filter((s) => s.clubId === clubId);
  const isVideoFile = file?.type.startsWith("video/") ?? false;

  function setThumbnail(mode: ThumbMode, blob: Blob | null) {
    setThumbMode(mode);
    setThumb(blob);
    setThumbPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return blob ? URL.createObjectURL(blob) : null;
    });
  }

  async function useCurrentFrame() {
    if (!videoRef.current) return;
    const blob = await captureFrame(videoRef.current);
    if (blob) setThumbnail("frame", blob);
    else setError("Couldn't grab that frame. Play the video for a moment, then try again.");
  }

  function onThumbFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    if (!IMAGE_EXT[chosen.type]) {
      setError("A thumbnail needs to be a JPEG, PNG or WebP image.");
      return;
    }
    setThumbnail("upload", chosen);
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    setError(null);
    setDone(false);
    setThumbnail("auto", null);
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
      }
      // The admin's choice if they made one, otherwise the frame picked from
      // the middle.
      const poster = thumb ?? meta?.poster ?? null;
      if (poster) {
        const type = IMAGE_EXT[poster.type] ? poster.type : "image/jpeg";
        const key = `${clubId}/${stamp}-poster.${IMAGE_EXT[type]}`;
        const { error: posterError } = await supabase.storage
          .from("discover")
          .upload(key, poster, { contentType: type, upsert: false });
        // A missing poster is a worse-looking feed, not a failed post.
        if (!posterError) posterPath = key;
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
      setThumbnail("auto", null);
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
      {done ? <Notice tone="success">Posted. Every member can see it in Discover.</Notice> : null}

      <div className="space-y-4 mt-3">
        <SelectField
          label="Club"
          name="clubId"
          value={clubId}
          hint="Who it's from. Every member sees Discover, whichever club you pick."
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
            Up to 200MB. MP4 plays in every browser; an iPhone .mov may not.
          </p>
        </div>

        {preview && file ? (
          <div className="rounded-lg overflow-hidden border border-line bg-canvas-deep">
            {isVideoFile ? (
              <video
                ref={videoRef}
                src={preview}
                controls
                playsInline
                muted
                className="w-full max-h-80 bg-black"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="w-full max-h-80 object-contain" />
            )}
          </div>
        ) : null}

        {preview && isVideoFile ? (
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-medium text-ink">Thumbnail</legend>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="grid aspect-video w-32 shrink-0 place-items-center overflow-hidden rounded-md bg-canvas-deep text-center text-[11px] text-ink-faint">
                {thumbPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbPreview} alt="Chosen thumbnail" className="h-full w-full object-cover" />
                ) : (
                  <span className="px-2">Picked from the middle</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={useCurrentFrame}>
                    Use the frame showing now
                  </Button>
                  <label className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-brand-700 shadow-card hover:bg-canvas">
                    Upload an image
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={onThumbFile}
                      className="sr-only"
                    />
                  </label>
                  {thumbMode !== "auto" ? (
                    <Button size="sm" variant="ghost" onClick={() => setThumbnail("auto", null)}>
                      Reset
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-ink-muted">
                  Scrub the video above to the moment you want and use that frame, or
                  upload a picture of your own.
                </p>
              </div>
            </div>
          </fieldset>
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
        className="min-h-9 rounded-lg border border-danger-600/40 px-3 text-xs font-medium text-danger-600 hover:bg-danger-100 disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error ? <span className="text-[11px] text-danger-600">{error}</span> : null}
    </span>
  );
}

/**
 * Sets or replaces the thumbnail of a video already posted -- for one that
 * went up without a still, or with a poor one.
 */
export function SetThumbnailButton({ post }: { post: DiscoverPost }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen || !post.clubId) return;
    const ext = IMAGE_EXT[chosen.type];
    if (!ext) {
      setError("JPEG, PNG or WebP only.");
      return;
    }
    setError(null);
    setDone(false);
    setPending(true);

    const key = `${post.clubId}/${crypto.randomUUID()}-poster.${ext}`;
    const { error: uploadError } = await getBrowserSupabaseClient()
      .storage.from("discover")
      .upload(key, chosen, { contentType: chosen.type, upsert: false });
    if (uploadError) {
      setPending(false);
      setError(uploadError.message);
      return;
    }

    const result = await setPostPoster(post.id, key);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (!post.clubId) return null;

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <label
        className={`inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-line px-3 text-xs font-medium text-brand-700 hover:bg-canvas ${
          pending ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {pending ? "Uploading…" : done ? "Thumbnail set" : "Thumbnail"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onChange}
          className="sr-only"
        />
      </label>
      {error ? <span className="text-[11px] text-danger-600">{error}</span> : null}
    </span>
  );
}

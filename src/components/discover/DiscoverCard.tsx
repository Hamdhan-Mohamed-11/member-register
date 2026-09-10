"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { useHydrated } from "@/lib/useHydrated";
import { discoverMediaUrl, type DiscoverPost } from "@/lib/discover/media";
import { toggleLike, toggleSave } from "@/app/discover/actions";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8.4a3.8 3.8 0 0 1 7 2.4c0 4.8-7 9.2-7 9.2z" />
    </svg>
  );
}

function Bookmark({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4-6.5 4V4.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <path d="M12 3v13M12 3 8 7M12 3l4 4" />
      <path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </svg>
  );
}

/**
 * One Discover post.
 *
 * Like, save, share. No comments -- the club asked for none, and a thread is
 * not a small addition: it needs moderation, reporting and somewhere for an
 * argument to happen.
 *
 * Like and save are optimistic; a tap on a feed has to answer instantly, and
 * both are trivially reversible if the server disagrees.
 */
export function DiscoverCard({ post }: { post: DiscoverPost }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.savedByMe);
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const canShare =
    hydrated && typeof navigator !== "undefined" && typeof navigator.share === "function";

  function like() {
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    startTransition(async () => {
      const result = await toggleLike(post.id);
      if (!result.ok) {
        setLiked(!next);
        setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
        return;
      }
      setLiked(result.data?.liked ?? next);
      router.refresh();
    });
  }

  function save() {
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await toggleSave(post.id);
      if (!result.ok) {
        setSaved(!next);
        return;
      }
      setSaved(result.data?.saved ?? next);
      router.refresh();
    });
  }

  async function share() {
    // The LINK, not the file. The media itself is behind a signed URL that
    // expires and is caller-specific, so sending the file out would either
    // break in an hour or leak a private bucket. A link makes the recipient
    // sign in, which is the correct outcome for members-only footage.
    const url = `${window.location.origin}/discover#${post.id}`;
    const text = post.caption ?? "From the club";

    try {
      if (canShare) {
        await navigator.share({ title: "Pick a Book", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A cancelled share sheet rejects, and clipboard access can be denied.
      // Neither is worth an error message on a feed.
    }
  }

  // Reserve the right box before the media loads, so the feed does not jump as
  // each item arrives. Falls back to 4:5, the commonest phone crop.
  const ratio =
    post.width && post.height ? `${post.width} / ${post.height}` : "4 / 5";

  const action =
    "inline-flex items-center gap-1.5 min-h-11 px-2 rounded-lg text-sm font-medium transition-colors";

  return (
    // The id lives on the wrapper rather than the Card: a shared primitive
    // should not grow a prop for one feature, and <article> is the right
    // element for a feed item anyway. It is what a shared /discover#id link
    // scrolls to.
    <article id={post.id} className="scroll-mt-20">
    <Card flush className="overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">
            {post.clubName ?? "Pick a Book"}
          </p>
          <p className="text-xs text-ink-faint">
            {post.authorName ? `${post.authorName} · ` : ""}
            {timeAgo(post.createdAt)}
          </p>
        </div>
        {post.sessionId ? (
          <Link
            href={`/sessions/${post.sessionId}`}
            className="text-xs text-brand-600 hover:underline shrink-0"
          >
            The session
          </Link>
        ) : null}
      </div>

      <div className="bg-canvas-deep" style={{ aspectRatio: ratio }}>
        {post.kind === "video" ? (
          <video
            src={discoverMediaUrl(post.id)}
            poster={discoverMediaUrl(post.id, true)}
            controls
            playsInline
            preload="none"
            className="w-full h-full object-cover"
          />
        ) : (
          /*
            A plain <img>: the source is a route that 307s to a signed
            Supabase host, which next/image would need in remotePatterns and
            would then try to re-optimise through a URL that expires.
          */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={discoverMediaUrl(post.id)}
            alt={post.caption ?? "Club photo"}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        )}
      </div>

      <div className="px-2 py-1.5 flex items-center gap-1">
        <button
          type="button"
          onClick={like}
          aria-pressed={liked}
          aria-label={liked ? "Undo like" : "Like"}
          className={`${action} ${liked ? "text-danger-600" : "text-ink-muted hover:text-ink"}`}
        >
          <Heart filled={liked} />
          {likes > 0 ? <span className="tabular-nums">{likes}</span> : null}
        </button>

        <button
          type="button"
          onClick={save}
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved" : "Save"}
          className={`${action} ${saved ? "text-gold-700" : "text-ink-muted hover:text-ink"}`}
        >
          <Bookmark filled={saved} />
          <span className="sr-only sm:not-sr-only sm:text-xs">
            {saved ? "Saved" : "Save"}
          </span>
        </button>

        <button
          type="button"
          onClick={share}
          className={`${action} text-ink-muted hover:text-ink ml-auto`}
        >
          <ShareIcon />
          <span className="text-xs">{copied ? "Link copied" : "Share"}</span>
        </button>
      </div>

      {post.caption ? (
        <p className="px-4 pb-3 text-sm text-ink whitespace-pre-line">{post.caption}</p>
      ) : null}
    </Card>
    </article>
  );
}

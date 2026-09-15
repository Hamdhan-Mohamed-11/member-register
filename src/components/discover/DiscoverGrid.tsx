"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { discoverMediaUrl, type DiscoverPost } from "@/lib/discover/media";
import { DiscoverCard } from "./DiscoverCard";

function PlayBadge({ large = false }: { large?: boolean }) {
  return (
    <span
      className={`grid place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm ${
        large ? "size-14" : "size-10"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className={`ml-0.5 ${large ? "size-6" : "size-4"}`} aria-hidden>
        <path d="M8 5.5v13l10.5-6.5z" />
      </svg>
    </span>
  );
}

/**
 * Discover as a grid of tiles, opening one at a time in a viewer.
 *
 * It was a single column capped at the width of a phone, so on a desktop a
 * portrait photo filled the screen top to bottom with empty space either
 * side, and seeing the fifth post meant scrolling past four full-height ones.
 * Tiles are cropped to one shape so the grid lines up; the viewer shows the
 * whole photo or plays the video, with like, save and share.
 *
 * A shared /discover#<id> link opens that post's viewer on arrival.
 */
export function DiscoverGrid({ posts }: { posts: DiscoverPost[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => {
    setOpenId(null);
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  // The hash opens a post: on arrival (a shared link), and whenever it changes
  // (the "most liked" list links to #<id>). Read after hydration, because the
  // server has no hash to render from.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (id && posts.some((p) => p.id === id)) setOpenId(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [posts]);

  const open = posts.find((p) => p.id === openId) ?? null;

  return (
    <>
      <ul className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
        {posts.map((post) => (
          <li key={post.id} className="min-w-0">
            <button
              type="button"
              onClick={() => setOpenId(post.id)}
              className="group press relative block aspect-[4/5] w-full overflow-hidden rounded-card bg-brand-900 text-left shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
              aria-label={`Open ${post.caption ?? (post.kind === "video" ? "video" : "photo")}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={discoverMediaUrl(post.id, post.kind === "video")}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {post.kind === "video" ? (
                <span className="absolute inset-0 grid place-items-center">
                  <PlayBadge />
                </span>
              ) : null}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 pb-2.5 pt-10">
                {post.caption ? (
                  <span className="line-clamp-2 text-sm font-medium leading-snug text-white">
                    {post.caption}
                  </span>
                ) : null}
                <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-white/80">
                  <span className="truncate">{post.clubName ?? "Pick a Book"}</span>
                  {post.likeCount > 0 ? (
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5" aria-hidden>
                        <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8.4a3.8 3.8 0 0 1 7 2.4c0 4.8-7 9.2-7 9.2z" />
                      </svg>
                      {post.likeCount}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Modal
        open={open != null}
        onClose={close}
        title={open?.clubName ?? "Discover"}
        size="lg"
      >
        {open ? <DiscoverCard key={open.id} post={open} inViewer /> : null}
      </Modal>
    </>
  );
}

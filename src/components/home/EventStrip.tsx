"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { discoverMediaUrl } from "@/lib/discover/media";

export type EventItem = {
  id: string;
  kind: "photo" | "video";
  caption: string | null;
  clubName: string | null;
};

/**
 * A row of recent club-event photos and videos, for the two home pages.
 *
 * For members each tile links into Discover, where the post can be liked and
 * saved. Signed out there is no Discover to link to, so a tile opens a
 * simple viewer in place -- and only posts an admin marked for the public
 * homepage ever reach this component in that mode.
 */
export function EventStrip({
  items,
  mode,
}: {
  items: EventItem[];
  mode: "member" | "public";
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);
  const open = items.find((i) => i.id === openId) ?? null;

  const tile = (item: EventItem, index: number) => (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={discoverMediaUrl(item.id, item.kind === "video")}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      {item.kind === "video" ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 size-5" aria-hidden>
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </span>
        </span>
      ) : null}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 pb-3 pt-12 text-left">
        {item.caption ? (
          <span className={`line-clamp-2 font-medium leading-snug text-white ${index === 0 ? "text-base" : "text-sm"}`}>
            {item.caption}
          </span>
        ) : null}
        <span className="mt-0.5 block truncate text-[11px] text-white/80">
          {item.clubName ?? "Pick a Book"}
        </span>
      </span>
    </>
  );

  // First tile large, the rest in a 2x2 beside it on a wide screen -- the
  // shape of a magazine's "latest" block rather than five equal squares.
  const cell = (index: number) =>
    `group press relative block overflow-hidden rounded-card bg-brand-900 shadow-card ${
      index === 0 ? "col-span-2 row-span-2 aspect-square sm:aspect-auto" : "aspect-square"
    }`;

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:grid-rows-2">
        {items.map((item, index) => (
          <li key={item.id} className={index === 0 ? "col-span-2 row-span-2" : ""}>
            {mode === "member" ? (
              <Link href={`/discover#${item.id}`} className={`${cell(index)} h-full w-full`}>
                {tile(item, index)}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setOpenId(item.id)}
                className={`${cell(index)} h-full w-full`}
                aria-label={`Open ${item.caption ?? (item.kind === "video" ? "video" : "photo")}`}
              >
                {tile(item, index)}
              </button>
            )}
          </li>
        ))}
      </ul>

      {mode === "public" ? (
        <Modal open={open != null} onClose={close} title={open?.clubName ?? "Pick a Book"} size="lg">
          {open ? (
            <div className="space-y-3">
              <div className="grid place-items-center overflow-hidden rounded-lg bg-black">
                {open.kind === "video" ? (
                  <video
                    key={open.id}
                    src={discoverMediaUrl(open.id)}
                    poster={discoverMediaUrl(open.id, true)}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[62vh] w-full object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={discoverMediaUrl(open.id)}
                    alt={open.caption ?? "Club event"}
                    className="max-h-[62vh] w-full object-contain"
                  />
                )}
              </div>
              {open.caption ? <p className="text-sm text-ink">{open.caption}</p> : null}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}

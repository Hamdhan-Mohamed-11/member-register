export type VideoEmbed = {
  provider: "youtube" | "vimeo";
  externalId: string;
  embedUrl: string;
};

/**
 * Parses a pasted YouTube/Vimeo link into a provider and an id, and builds the
 * iframe src OURSELVES.
 *
 * Rendering a user-supplied string straight into <iframe src> accepts
 * `javascript:` and `data:` URLs, which is script execution in the page. The
 * only safe shape is: extract an opaque id, validate it against a strict
 * charset, and construct a known-good URL around it.
 *
 * Returns null for anything unrecognised -- the caller shows a plain link
 * instead of guessing.
 */
export function parseVideoUrl(raw: string | null | undefined): VideoEmbed | null {
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  // Scheme allowlist, checked before anything else touches the value.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  // YouTube ids are 11 chars of [A-Za-z0-9_-]; Vimeo ids are digits.
  const isYoutubeId = (v: string) => /^[A-Za-z0-9_-]{11}$/.test(v);
  const isVimeoId = (v: string) => /^\d{6,12}$/.test(v);

  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && isYoutubeId(v)) {
      return {
        provider: "youtube",
        externalId: v,
        embedUrl: `https://www.youtube-nocookie.com/embed/${v}`,
      };
    }
    // /embed/<id> and /shorts/<id>
    const seg = url.pathname.split("/").filter(Boolean);
    if ((seg[0] === "embed" || seg[0] === "shorts") && isYoutubeId(seg[1] ?? "")) {
      return {
        provider: "youtube",
        externalId: seg[1],
        embedUrl: `https://www.youtube-nocookie.com/embed/${seg[1]}`,
      };
    }
    return null;
  }

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (isYoutubeId(id)) {
      return {
        provider: "youtube",
        externalId: id,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      };
    }
    return null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean).pop() ?? "";
    if (isVimeoId(id)) {
      return {
        provider: "vimeo",
        externalId: id,
        embedUrl: `https://player.vimeo.com/video/${id}`,
      };
    }
    return null;
  }

  return null;
}

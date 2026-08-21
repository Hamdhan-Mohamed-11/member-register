export type VideoEmbed = {
  provider: "youtube" | "vimeo";
  externalId: string;
  embedUrl: string;
};

/**
 * Builds the iframe src from a provider and an already-validated id.
 *
 * The ONLY place an embed URL is constructed. Everything that renders a video
 * goes through here, so there is exactly one line to audit for "could this ever
 * be attacker-controlled" -- and the answer stays no, because the id has been
 * matched against a strict charset before it gets here.
 */
export function buildEmbedUrl(provider: "youtube" | "vimeo", externalId: string): string {
  return provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${externalId}`
    : `https://player.vimeo.com/video/${externalId}`;
}

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
        embedUrl: buildEmbedUrl("youtube", v),
      };
    }
    // /embed/<id> and /shorts/<id>
    const seg = url.pathname.split("/").filter(Boolean);
    if ((seg[0] === "embed" || seg[0] === "shorts") && isYoutubeId(seg[1] ?? "")) {
      return {
        provider: "youtube",
        externalId: seg[1],
        embedUrl: buildEmbedUrl("youtube", seg[1]),
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
        embedUrl: buildEmbedUrl("youtube", id),
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
        embedUrl: buildEmbedUrl("vimeo", id),
      };
    }
    return null;
  }

  return null;
}

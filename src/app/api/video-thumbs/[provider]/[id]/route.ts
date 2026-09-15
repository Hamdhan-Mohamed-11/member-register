import { NextResponse, type NextRequest } from "next/server";

const DAY_SECONDS = 60 * 60 * 24;

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/**
 * A still for a YouTube or Vimeo video, served from our own origin.
 *
 * Proxied for the same reasons as /api/covers: img-src stays tight (YouTube's
 * image CDN and Vimeo's are not on it), and an admin's browser does not call
 * out to a third party to draw a list. The id is checked against the same
 * charsets parseVideoUrl uses, so this cannot be pointed anywhere else.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string; id: string }> },
) {
  const { provider, id } = await params;

  let source: string | null = null;
  try {
    if (provider === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(id)) {
      source = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    } else if (provider === "vimeo" && /^\d{6,12}$/.test(id)) {
      // Vimeo has no fixed thumbnail URL; its oEmbed endpoint names one.
      const meta = await fetch(
        `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (meta.ok) {
        const body = (await meta.json()) as { thumbnail_url?: string };
        const thumb = body.thumbnail_url ?? "";
        // Only ever Vimeo's own image host.
        if (/^https:\/\/i\.vimeocdn\.com\//.test(thumb)) source = thumb;
      }
    }
    if (!source) return notFound();

    const upstream = await fetch(source, { signal: AbortSignal.timeout(8000) });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) return notFound();

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": `private, max-age=${DAY_SECONDS}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 502 });
  }
}

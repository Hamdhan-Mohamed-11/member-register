import { NextResponse, type NextRequest } from "next/server";

const MONTH_SECONDS = 60 * 60 * 24 * 30;

/**
 * Serves an Open Library cover from our own origin.
 *
 * Proxied rather than linked, for two reasons. Open Library redirects many
 * covers on to whichever archive.org server holds them, which a tight img-src
 * cannot allowlist without opening it to all of archive.org. And a member's
 * browser never talks to a third party just because they opened someone's
 * profile.
 *
 * Takes only a numeric id, so this cannot be turned into a general-purpose
 * proxy. Covers never change once published, hence the long cache.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ coverId: string }> },
) {
  const { coverId } = await params;
  const id = Number(coverId);
  if (!/^\d{1,10}$/.test(coverId) || !Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // default=false makes a missing cover a 404 instead of a blank image, so
    // the page's own placeholder shows.
    const upstream = await fetch(
      `https://covers.openlibrary.org/b/id/${id}-M.jpg?default=false`,
      { signal: AbortSignal.timeout(8000), redirect: "follow" },
    );
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": `public, max-age=${MONTH_SECONDS}, immutable`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 502 });
  }
}

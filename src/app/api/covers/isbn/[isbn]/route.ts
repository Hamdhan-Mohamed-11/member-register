import { NextResponse, type NextRequest } from "next/server";

const MONTH_SECONDS = 60 * 60 * 24 * 30;

/**
 * An Open Library cover looked up by ISBN, served from our own origin.
 *
 * The store has a cover file of its own for 162 of its 1,336 books and falls
 * back to Open Library for the rest -- which is why a book with a picture on
 * the storefront had none here. This is the same fallback, proxied for the
 * same reasons as the by-id route next door: Open Library redirects on to
 * archive.org, which a tight img-src cannot allowlist without opening it to
 * everything there, and a member's browser should not be talking to a third
 * party because they opened the shop.
 *
 * Only digits and a trailing X get through, so this cannot be turned into a
 * general-purpose proxy.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ isbn: string }> },
) {
  const { isbn } = await params;
  const clean = isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (!/^[0-9]{9}[0-9X]$|^[0-9]{13}$/.test(clean)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // default=false makes a missing cover a 404 rather than a blank grey
    // image, so the card's own placeholder shows instead.
    const upstream = await fetch(
      `https://covers.openlibrary.org/b/isbn/${clean}-M.jpg?default=false`,
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

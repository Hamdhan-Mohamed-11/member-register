import { NextResponse, type NextRequest } from "next/server";
import { getShopSnapshots } from "@/lib/shop/snapshots";

const DAY_SECONDS = 60 * 60 * 24;

/**
 * A catalogue book's cover, served from our own origin.
 *
 * The flyer maker draws it onto a canvas and then exports a PNG. A canvas
 * that has drawn an image from another origin is "tainted" and refuses to
 * export at all, so the cover cannot be loaded straight from the shop's
 * image host -- it has to come from here. Same reason /api/covers exists for
 * Open Library.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const id = Number(bookId);
  if (!/^\d{1,10}$/.test(bookId) || !Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Whichever catalogue the id belongs to -- the store, the club's own
  // authors, or the old shop. The flyer maker searches the store now, so a
  // legacy-only lookup would have found nothing for the cover it just chose.
  const snapshots = await getShopSnapshots([id]);
  const source = snapshots.get(id)?.imageUrl ?? null;
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const upstream = await fetch(source, { signal: AbortSignal.timeout(8000) });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: { "Content-Type": type, "Cache-Control": `private, max-age=${DAY_SECONDS}` },
    });
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 502 });
  }
}

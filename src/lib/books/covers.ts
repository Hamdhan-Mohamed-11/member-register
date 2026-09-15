/**
 * Where a reading-list cover is served from. Kept out of BookCover.tsx because
 * that is a client module, and a server component calling a plain function
 * exported from one gets a client reference back, not the function.
 */
export function openLibraryCoverSrc(coverId: number | null | undefined): string | null {
  return coverId ? `/api/covers/${coverId}` : null;
}

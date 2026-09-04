import Image from "next/image";

/**
 * The Pick a Book wordmark, replacing the text logotype that stood in for it.
 *
 * Sized by HEIGHT with `w-auto`, because the source is a fixed 720x216
 * (10:3) wordmark: constraining the width instead would make the mark grow and
 * shrink as the container does, and a logo that changes size between pages
 * reads as a rendering bug.
 *
 * `preload` rather than `priority` -- `priority` is deprecated as of Next 16.
 * It earns the preload: this is in the header of every page and is the largest
 * contentful paint on the short ones.
 */
export function Logo({
  className = "h-7 w-auto",
  preload = false,
}: {
  className?: string;
  preload?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="Pick a Book"
      width={720}
      height={216}
      preload={preload}
      // The intrinsic file is 720px wide and it is never displayed above
      // ~120px, so telling the optimizer the real ceiling stops it generating
      // and serving a 720px variant to every phone.
      sizes="120px"
      className={className}
    />
  );
}

import Link from "next/link";

/**
 * The "← Admin" style link above a page title.
 *
 * It was hand-written on a dozen pages, each with its own arrow character and
 * spacing, and each with a hit area the height of the text -- about 20px, well
 * under the 44px a thumb needs. This one has real padding and pulls itself back
 * into alignment with `-ml-2` so the label still lines up with the title
 * beneath it.
 */
export function BackLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`-ml-2 inline-flex items-center gap-1 rounded-lg px-2 min-h-9 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-4"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      {children}
    </Link>
  );
}

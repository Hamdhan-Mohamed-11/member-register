import { Icon } from "@/components/ui/Icon";

/**
 * A link that downloads one of the club's lists as a spreadsheet.
 *
 * A plain anchor with `download`, not a button that fetches a blob: the
 * browser handles a file it asked for better than we can, it works with the
 * middle mouse button and a right-click, and there is nothing to hold in
 * memory on the page.
 *
 * Only rendered for the roles the route lets through -- the route re-checks,
 * so this is about not offering a door that will be shut.
 */
export function ExportButton({
  kind,
  label = "Download CSV",
}: {
  kind: "members" | "sessions" | "payments";
  label?: string;
}) {
  return (
    <a
      href={`/api/admin/export/${kind}`}
      download
      className="press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-brand-700 hover:bg-canvas"
    >
      <Icon name="inbox" className="size-4" />
      {label}
    </a>
  );
}

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/**
 * The cart, beside the bell (PDF item 5).
 *
 * Same shape as NotificationBell so the two read as a pair. The count is the
 * number of distinct titles, not copies -- "3" should mean three books to look
 * at, not one book three times.
 */
export function CartButton({ count }: { count: number }) {
  const label = count > 99 ? "99+" : String(count);

  return (
    <Link
      href="/cart"
      className="relative grid size-10 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-deep hover:text-ink"
    >
      <Icon name="cart" className="size-[22px]" />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-none text-white tabular-nums ring-2 ring-surface"
        >
          {label}
        </span>
      ) : null}
      <span className="sr-only">
        {count === 0 ? "Cart" : `Cart, ${count} item${count === 1 ? "" : "s"}`}
      </span>
    </Link>
  );
}

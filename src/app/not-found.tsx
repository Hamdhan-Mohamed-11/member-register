import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";

/**
 * Also what a member sees when they open a link to someone they cannot see --
 * /members/[id] answers notFound() rather than 403 on purpose, because a 403
 * would confirm that person exists. So the wording has to work for both "no
 * such page" and "not yours to see" without hinting which it is.
 */
export default function NotFound() {
  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <Card className="max-w-sm w-full text-center">
        <h1 className="text-xl font-semibold text-ink">Not found</h1>
        <p className="mt-2 text-sm text-ink-muted">
          That page doesn&apos;t exist, or it isn&apos;t available to you.
        </p>
        <div className="mt-5">
          <Link href="/feed" className={buttonClassName("primary")}>
            Go home
          </Link>
        </div>
      </Card>
    </main>
  );
}

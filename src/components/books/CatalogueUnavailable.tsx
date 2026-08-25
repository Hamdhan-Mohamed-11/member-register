import { Card } from "@/components/ui/Card";
import type { LegacyResult } from "@/lib/legacy/types";

type Reason = Extract<LegacyResult<unknown>, { ok: false }>["reason"];

const COPY: Record<Reason, { title: string; body: string }> = {
  unconfigured: {
    title: "The book catalogue isn't connected yet",
    body: "Everything else in the portal is working. This will fill in once the shop database is linked.",
  },
  unreachable: {
    title: "The book catalogue is temporarily unavailable",
    body: "We can't reach the shop database right now. Everything else in the portal is working — please try again shortly.",
  },
  timeout: {
    title: "The book catalogue is being slow",
    body: "The shop database didn't answer in time. Everything else in the portal is working — please try again shortly.",
  },
  query_error: {
    title: "Something went wrong loading books",
    body: "Everything else in the portal is working. If this keeps happening, please tell a club admin.",
  },
};

/**
 * Shown in place of the catalogue when the legacy database is unavailable.
 *
 * Deliberately calm, and explicit that the rest of the portal is fine. The
 * legacy database belongs to a third party we do not control, so this is a
 * normal state to be in occasionally rather than an error — and a page that
 * 500s because someone else's server is busy is a worse outcome than one that
 * says so plainly.
 */
export function CatalogueUnavailable({ reason }: { reason: Reason }) {
  const copy = COPY[reason] ?? COPY.query_error;

  return (
    <Card>
      <p className="font-medium text-ink">{copy.title}</p>
      <p className="text-sm text-ink-muted mt-1">{copy.body}</p>
    </Card>
  );
}

import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase/serverClient";
import { isPayHereConfigured, getPayHereMode } from "@/lib/payments/payhere";
import { legacyPing } from "@/lib/legacy/books";
import { isLegacyConfigured } from "@/lib/legacy/env";

export const runtime = "nodejs";
// Never cached: a cached health check reports the state of whenever it was
// last rendered, which is worse than no health check at all.
export const dynamic = "force-dynamic";

type Check = { ok: boolean; detail?: string; ms?: number };

async function timed(fn: () => Promise<void>): Promise<Check> {
  const started = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message : "unknown error",
    };
  }
}

/**
 * Liveness and dependency check, for whatever watches the VPS.
 *
 * Deliberately shallow on detail: it reports WHETHER each dependency answers,
 * never what it said. This endpoint is public (a monitor cannot authenticate),
 * so it must not become a way to enumerate configuration or read error text
 * from the database.
 *
 * Answers 200 when the app itself is up and 503 when a hard dependency is
 * down, so a monitor can alert on status alone.
 */
export async function GET() {
  const checks: Record<string, Check> = {};

  checks.database = await timed(async () => {
    const supabase = getServiceSupabaseClient();
    // Cheap and always present. head:true fetches no rows.
    const { error } = await supabase
      .from("app_settings")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
  });

  // Configuration, not connectivity -- PayHere is not pinged, because a health
  // check should not depend on a third party being up to report the app as
  // healthy.
  checks.payments = {
    ok: true,
    detail: isPayHereConfigured() ? `configured (${getPayHereMode()})` : "not configured",
  };

  // The legacy catalogue is a THIRD PARTY. It is reported, but a failure here
  // does not make the app unhealthy -- the portal works fine without it, and
  // paging a human at 3am because HostGator is busy would be wrong.
  if (isLegacyConfigured()) {
    const started = Date.now();
    const reachable = await legacyPing();
    checks.catalogue = {
      ok: true,
      ms: Date.now() - started,
      detail: reachable ? "reachable" : "unreachable (portal unaffected)",
    };
  } else {
    checks.catalogue = { ok: true, detail: "not configured" };
  }

  const healthy = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      time: new Date().toISOString(),
      checks: Object.fromEntries(
        Object.entries(checks).map(([name, c]) => [
          name,
          // Suppress the detail on failure: it can carry connection strings
          // and query text. The log has the full story; the response says
          // only that something is wrong.
          { ok: c.ok, ms: c.ms, detail: c.ok ? c.detail : "unavailable" },
        ]),
      ),
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
